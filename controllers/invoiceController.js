// =====================================================
// Invoice Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Generate invoice number
 */
const generateInvoiceNumber = async (companyId) => {
  const [result] = await pool.execute(
    `SELECT COUNT(*) as count FROM invoices WHERE company_id = ?`,
    [companyId]
  );
  const nextNum = (result[0].count || 0) + 1;
  return `INV#${String(nextNum).padStart(3, '0')}`;
};

/**
 * Calculate invoice totals
 */
const calculateTotals = (items, discount, discountType) => {
  let subTotal = 0;
  
  for (const item of items) {
    subTotal += parseFloat(item.amount || 0);
  }

  let discountAmount = 0;
  if (discountType === '%') {
    discountAmount = (subTotal * parseFloat(discount || 0)) / 100;
  } else {
    discountAmount = parseFloat(discount || 0);
  }

  const total = subTotal - discountAmount;
  const taxAmount = 0; // Tax is included in item amounts

  return {
    sub_total: subTotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total: total,
    unpaid: total
  };
};

/**
 * Get all invoices
 * GET /api/v1/invoices
 */
const getAll = async (req, res) => {
  try {
    const { status, client_id, search, start_date, end_date, project_id } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    let whereClause = 'WHERE i.is_deleted = 0';
    const params = [];

    // Company filter
    const filterCompanyId = req.query.company_id || req.companyId;
    if (filterCompanyId) {
      whereClause += ' AND i.company_id = ?';
      params.push(filterCompanyId);
    }

    // Status filter
    if (status && status !== 'All' && status !== 'all') {
      whereClause += ' AND UPPER(i.status) = UPPER(?)';
      params.push(status);
    }
    
    // Client filter
    if (client_id) {
      whereClause += ' AND i.client_id = ?';
      params.push(client_id);
    }
    
    // Project filter
    if (project_id) {
      whereClause += ' AND i.project_id = ?';
      params.push(project_id);
    }
    
    // Search filter (invoice number or client name)
    if (search) {
      whereClause += ' AND (i.invoice_number LIKE ? OR c.company_name LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    // Date range filter
    if (start_date) {
      whereClause += ' AND DATE(i.bill_date) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND DATE(i.bill_date) <= ?';
      params.push(end_date);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated invoices - LIMIT and OFFSET as template literals (not placeholders)
    const [invoices] = await pool.execute(
      `SELECT i.*, 
       c.company_name as client_name, 
       comp.name as company_name, 
       p.project_name,
       COALESCE(SUM(pay.amount), 0) as paid_amount
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN companies comp ON i.company_id = comp.id
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN payments pay ON pay.invoice_id = i.id AND pay.is_deleted = 0
       ${whereClause}
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Get items and calculate totals for each invoice
    for (let invoice of invoices) {
      const [items] = await pool.execute(
        `SELECT * FROM invoice_items WHERE invoice_id = ?`,
        [invoice.id]
      );
      invoice.items = items || [];
      
      // Calculate paid amount from payments
      const paidAmount = parseFloat(invoice.paid_amount || 0);
      const totalAmount = parseFloat(invoice.total || 0);
      const dueAmount = totalAmount - paidAmount;
      
      invoice.paid_amount = paidAmount;
      invoice.due_amount = dueAmount;
      invoice.bill_date = invoice.bill_date || invoice.invoice_date || invoice.created_at;
      
      // Determine status based on payments
      if (!invoice.status || invoice.status === 'Draft') {
        invoice.status = 'Draft';
      } else if (paidAmount === 0) {
        invoice.status = 'Unpaid';
      } else if (paidAmount >= totalAmount) {
        invoice.status = 'Fully Paid';
      } else if (paidAmount > 0) {
        invoice.status = 'Partially Paid';
      }
      
      // Check for credit notes
      const [creditNotes] = await pool.execute(
        `SELECT SUM(amount) as total_credit FROM credit_notes WHERE invoice_id = ? AND is_deleted = 0`,
        [invoice.id]
      );
      if (creditNotes[0]?.total_credit > 0) {
        invoice.status = 'Credited';
      }
    }

    res.json({
      success: true,
      data: invoices,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices'
    });
  }
};

/**
 * Get invoice by ID
 * GET /api/v1/invoices/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const filterCompanyId = req.query.company_id || req.companyId;

    const [invoices] = await pool.execute(
      `SELECT i.*, 
       c.company_name as client_name, 
       comp.name as company_name, 
       p.project_name,
       COALESCE(SUM(pay.amount), 0) as paid_amount
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN companies comp ON i.company_id = comp.id
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN payments pay ON pay.invoice_id = i.id AND pay.is_deleted = 0
       WHERE i.id = ? AND i.is_deleted = 0
       GROUP BY i.id`,
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = invoices[0];

    // Get items
    const [items] = await pool.execute(
      `SELECT * FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );
    invoice.items = items || [];
    
    // Calculate totals
    const paidAmount = parseFloat(invoice.paid_amount || 0);
    const totalAmount = parseFloat(invoice.total || 0);
    const dueAmount = totalAmount - paidAmount;
    
    invoice.paid_amount = paidAmount;
    invoice.due_amount = dueAmount;
    invoice.bill_date = invoice.bill_date || invoice.invoice_date || invoice.created_at;
    
    // Determine status based on payments
    if (!invoice.status || invoice.status === 'Draft') {
      invoice.status = 'Draft';
    } else if (paidAmount === 0) {
      invoice.status = 'Unpaid';
    } else if (paidAmount >= totalAmount) {
      invoice.status = 'Fully Paid';
    } else if (paidAmount > 0) {
      invoice.status = 'Partially Paid';
    }
    
    // Check for credit notes
    const [creditNotes] = await pool.execute(
      `SELECT SUM(amount) as total_credit FROM credit_notes WHERE invoice_id = ? AND is_deleted = 0`,
      [invoice.id]
    );
    if (creditNotes[0]?.total_credit > 0) {
      invoice.status = 'Credited';
    }

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice'
    });
  }
};

/**
 * Create invoice
 * POST /api/v1/invoices
 */
const create = async (req, res) => {
  try {
    const {
      company_id, invoice_date, due_date, currency, exchange_rate, client_id, project_id,
      calculate_tax, bank_account, payment_details, billing_address,
      shipping_address, generated_by, note, terms, discount, discount_type,
      items = [], is_recurring, billing_frequency, recurring_start_date,
      recurring_total_count, is_time_log_invoice, time_log_from, time_log_to
    } = req.body;

    // Validation
    if (!company_id || !invoice_date || !due_date || !client_id || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'company_id, invoice_date, due_date, client_id, and items are required'
      });
    }

    // Generate invoice number
    const invoice_number = await generateInvoiceNumber(req.companyId);

    // Calculate totals
    const totals = calculateTotals(items, discount, discount_type);

    // Insert invoice - convert undefined to null for SQL
    const [result] = await pool.execute(
      `INSERT INTO invoices (
        company_id, invoice_number, invoice_date, due_date, currency, exchange_rate,
        client_id, project_id, calculate_tax, bank_account, payment_details,
        billing_address, shipping_address, generated_by, note, terms,
        discount, discount_type, sub_total, discount_amount, tax_amount,
        total, unpaid, status, is_recurring, billing_frequency,
        recurring_start_date, recurring_total_count, is_time_log_invoice,
        time_log_from, time_log_to, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id ?? req.companyId ?? null,
        invoice_number,
        invoice_date,
        due_date,
        currency || 'USD',
        exchange_rate ?? 1.0,
        client_id,
        project_id ?? null,
        calculate_tax || 'After Discount',
        bank_account ?? null,
        payment_details ?? null,
        billing_address ?? null,
        shipping_address ?? null,
        generated_by || 'Worksuite',
        note ?? null,
        terms || 'Thank you for your business.',
        discount ?? 0,
        discount_type || '%',
        totals.sub_total,
        totals.discount_amount,
        totals.tax_amount,
        totals.total,
        totals.unpaid,
        'Unpaid',
        is_recurring ?? 0,
        billing_frequency ?? null,
        recurring_start_date ?? null,
        recurring_total_count ?? null,
        is_time_log_invoice ?? 0,
        time_log_from ?? null,
        time_log_to ?? null,
        req.userId ?? null
      ]
    );

    const invoiceId = result.insertId;

    // Insert items - calculate amount if not provided
    if (items.length > 0) {
      const itemValues = items.map(item => {
        const quantity = parseFloat(item.quantity || 1);
        const unitPrice = parseFloat(item.unit_price || 0);
        const taxRate = parseFloat(item.tax_rate || 0);
        
        // Calculate amount: (quantity * unit_price) + tax
        let amount = quantity * unitPrice;
        if (taxRate > 0) {
          amount += (amount * taxRate / 100);
        }
        
        // Use provided amount if available, otherwise use calculated amount
        const finalAmount = item.amount !== undefined && item.amount !== null 
          ? parseFloat(item.amount) 
          : amount;
        
        return [
          invoiceId,
          item.item_name,
          item.description || null,
          quantity,
          item.unit || 'Pcs',
          unitPrice,
          item.tax || null,
          taxRate,
          item.file_path || null,
          finalAmount
        ];
      });

      await pool.query(
        `INSERT INTO invoice_items (
          invoice_id, item_name, description, quantity, unit, unit_price,
          tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );
    }

    // Get created invoice
    const [invoices] = await pool.execute(
      `SELECT * FROM invoices WHERE id = ?`,
      [invoiceId]
    );

    res.status(201).json({
      success: true,
      data: invoices[0],
      message: 'Invoice created successfully'
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice'
    });
  }
};

/**
 * Update invoice
 * PUT /api/v1/invoices/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if invoice exists
    const [invoices] = await pool.execute(
      `SELECT id FROM invoices WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Build update query
    const allowedFields = [
      'invoice_date', 'due_date', 'currency', 'exchange_rate', 'client_id',
      'project_id', 'calculate_tax', 'bank_account', 'payment_details',
      'billing_address', 'shipping_address', 'note', 'terms', 'discount',
      'discount_type', 'status'
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert undefined to null for SQL
        values.push(updateFields[field] === undefined ? null : updateFields[field]);
      }
    }

    // Recalculate totals if items are updated
    if (updateFields.items) {
      const totals = calculateTotals(
        updateFields.items,
        updateFields.discount || 0,
        updateFields.discount_type || '%'
      );
      updates.push('sub_total = ?', 'discount_amount = ?', 'tax_amount = ?', 'total = ?', 'unpaid = ?');
      values.push(totals.sub_total, totals.discount_amount, totals.tax_amount, totals.total, totals.unpaid);

      // Update items - calculate amount if not provided
      await pool.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [id]);
      if (updateFields.items.length > 0) {
        const itemValues = updateFields.items.map(item => {
          const quantity = parseFloat(item.quantity || 1);
          const unitPrice = parseFloat(item.unit_price || 0);
          const taxRate = parseFloat(item.tax_rate || 0);
          
          // Calculate amount: (quantity * unit_price) + tax
          let amount = quantity * unitPrice;
          if (taxRate > 0) {
            amount += (amount * taxRate / 100);
          }
          
          // Use provided amount if available, otherwise use calculated amount
          const finalAmount = item.amount !== undefined && item.amount !== null 
            ? parseFloat(item.amount) 
            : amount;
          
          return [
            id,
            item.item_name,
            item.description || null,
            quantity,
            item.unit || 'Pcs',
            unitPrice,
            item.tax || null,
            taxRate,
            item.file_path || null,
            finalAmount
          ];
        });
        await pool.query(
          `INSERT INTO invoice_items (
            invoice_id, item_name, description, quantity, unit, unit_price,
            tax, tax_rate, file_path, amount
          ) VALUES ?`,
          [itemValues]
        );
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, req.companyId);

      await pool.execute(
        `UPDATE invoices SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
        values
      );
    }

    // Get updated invoice
    const [updatedInvoices] = await pool.execute(
      `SELECT * FROM invoices WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedInvoices[0],
      message: 'Invoice updated successfully'
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice'
    });
  }
};

/**
 * Delete invoice (soft delete)
 * DELETE /api/v1/invoices/:id
 */
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE invoices SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete invoice'
    });
  }
};

/**
 * Create invoice from time logs
 * POST /api/v1/invoices/create-from-time-logs
 */
const createFromTimeLogs = async (req, res) => {
  try {
    const { time_log_from, time_log_to, client_id, project_id, invoice_date, due_date } = req.body;

    // Validation
    if (!time_log_from || !time_log_to || !client_id || !invoice_date || !due_date) {
      return res.status(400).json({
        success: false,
        error: 'time_log_from, time_log_to, client_id, invoice_date, and due_date are required'
      });
    }

    // Get time logs
    const [timeLogs] = await pool.execute(
      `SELECT * FROM time_logs
       WHERE company_id = ? AND date BETWEEN ? AND ?
       AND (project_id = ? OR ? IS NULL)
       AND is_deleted = 0`,
      [req.companyId, time_log_from, time_log_to, project_id || null, project_id || null]
    );

    if (timeLogs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No time logs found for the specified period'
      });
    }

    // Group by task and calculate totals
    const taskHours = {};
    for (const log of timeLogs) {
      const key = log.task_id || 'general';
      if (!taskHours[key]) {
        taskHours[key] = { hours: 0, task_id: log.task_id };
      }
      taskHours[key].hours += parseFloat(log.hours);
    }

    // Create invoice items from time logs
    const items = [];
    for (const [key, data] of Object.entries(taskHours)) {
      // Get task name if available
      let itemName = 'Time Log Entry';
      if (data.task_id) {
        const [tasks] = await pool.execute(`SELECT title FROM tasks WHERE id = ?`, [data.task_id]);
        if (tasks.length > 0) {
          itemName = tasks[0].title;
        }
      }

      items.push({
        item_name: itemName,
        description: `Time logged: ${data.hours} hours`,
        quantity: data.hours,
        unit: 'Hours',
        unit_price: 100, // Default hourly rate - should be configurable
        amount: data.hours * 100
      });
    }

    // Create invoice
    const invoiceData = {
      invoice_date,
      due_date,
      client_id,
      project_id,
      items,
      is_time_log_invoice: true,
      time_log_from,
      time_log_to
    };

    // Use create function
    return await create({ ...req, body: invoiceData }, res);
  } catch (error) {
    console.error('Create from time logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice from time logs'
    });
  }
};

/**
 * Create recurring invoice
 * POST /api/v1/invoices/create-recurring
 */
const createRecurring = async (req, res) => {
  try {
    const {
      billing_frequency, recurring_start_date, recurring_total_count,
      client_id, items = []
    } = req.body;

    // Validation
    if (!billing_frequency || !recurring_start_date || !recurring_total_count || !client_id || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'billing_frequency, recurring_start_date, recurring_total_count, client_id, and items are required'
      });
    }

    const invoices = [];
    const startDate = new Date(recurring_start_date);

    for (let i = 0; i < recurring_total_count; i++) {
      let invoiceDate = new Date(startDate);
      let dueDate = new Date(startDate);

      // Calculate dates based on frequency
      if (billing_frequency === 'Monthly') {
        invoiceDate.setMonth(startDate.getMonth() + i);
        dueDate.setMonth(startDate.getMonth() + i);
        dueDate.setDate(dueDate.getDate() + 30);
      } else if (billing_frequency === 'Quarterly') {
        invoiceDate.setMonth(startDate.getMonth() + (i * 3));
        dueDate.setMonth(startDate.getMonth() + (i * 3));
        dueDate.setDate(dueDate.getDate() + 90);
      } else if (billing_frequency === 'Yearly') {
        invoiceDate.setFullYear(startDate.getFullYear() + i);
        dueDate.setFullYear(startDate.getFullYear() + i);
        dueDate.setDate(dueDate.getDate() + 365);
      }

      const invoiceData = {
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        client_id,
        items,
        is_recurring: true,
        billing_frequency,
        recurring_start_date: recurring_start_date,
        recurring_total_count: recurring_total_count
      };

      // Create invoice
      const invoice_number = await generateInvoiceNumber(req.companyId);
      const totals = calculateTotals(items, 0, '%');

      const [result] = await pool.execute(
        `INSERT INTO invoices (
          company_id, invoice_number, invoice_date, due_date, client_id,
          sub_total, discount_amount, tax_amount, total, unpaid, status,
          is_recurring, billing_frequency, recurring_start_date,
          recurring_total_count, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.companyId ?? null,
          invoice_number,
          invoiceData.invoice_date,
          invoiceData.due_date,
          client_id,
          totals.sub_total,
          totals.discount_amount,
          totals.tax_amount,
          totals.total,
          totals.unpaid,
          'Unpaid',
          1,
          billing_frequency ?? null,
          recurring_start_date ?? null,
          recurring_total_count ?? null,
          req.userId ?? null
        ]
      );

      // Insert items - calculate amount if not provided
      const itemValues = items.map(item => {
        const quantity = parseFloat(item.quantity || 1);
        const unitPrice = parseFloat(item.unit_price || 0);
        const taxRate = parseFloat(item.tax_rate || 0);
        
        // Calculate amount: (quantity * unit_price) + tax
        let amount = quantity * unitPrice;
        if (taxRate > 0) {
          amount += (amount * taxRate / 100);
        }
        
        // Use provided amount if available, otherwise use calculated amount
        const finalAmount = item.amount !== undefined && item.amount !== null 
          ? parseFloat(item.amount) 
          : amount;
        
        return [
          result.insertId,
          item.item_name,
          item.description || null,
          quantity,
          item.unit || 'Pcs',
          unitPrice,
          item.tax || null,
          taxRate,
          item.file_path || null,
          finalAmount
        ];
      });

      await pool.query(
        `INSERT INTO invoice_items (
          invoice_id, item_name, description, quantity, unit, unit_price,
          tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );

      invoices.push({ id: result.insertId, invoice_number });
    }

    res.status(201).json({
      success: true,
      data: invoices,
      message: `${invoices.length} recurring invoices created successfully`
    });
  } catch (error) {
    console.error('Create recurring invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create recurring invoices'
    });
  }
};

/**
 * Generate PDF data for invoice
 * GET /api/v1/invoices/:id/pdf
 */
const generatePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const [invoices] = await pool.execute(
      `SELECT i.*, c.company_name as client_name, comp.name as company_name, p.project_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN companies comp ON i.company_id = comp.id
       LEFT JOIN projects p ON i.project_id = p.id
       WHERE i.id = ? AND i.company_id = ? AND i.is_deleted = 0`,
      [id, req.companyId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = invoices[0];

    // Get items
    const [items] = await pool.execute(
      `SELECT * FROM invoice_items WHERE invoice_id = ?`,
      [invoice.id]
    );
    invoice.items = items;

    // Return invoice data formatted for PDF generation
    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF data'
    });
  }
};

/**
 * Send invoice by email
 * POST /api/v1/invoices/:id/send-email
 */
const sendEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    // Get invoice
    const [invoices] = await pool.execute(
      `SELECT i.*, c.company_name as client_name, c.email as client_email, comp.name as company_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN companies comp ON i.company_id = comp.id
       WHERE i.id = ? AND i.is_deleted = 0`,
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const invoice = invoices[0];

    // Generate public URL
    const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/public/invoices/${id}`;

    // Generate email HTML
    const { sendEmail: sendEmailUtil, generateInvoiceEmailHTML } = require('../utils/emailService');
    const emailHTML = generateInvoiceEmailHTML(invoice, publicUrl);

    // Send email
    const recipientEmail = to || invoice.client_email;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required' });
    }

    await sendEmailUtil({
      to: recipientEmail,
      subject: subject || `Invoice ${invoice.invoice_number}`,
      html: emailHTML,
      text: `Please view the invoice at: ${publicUrl}`
    });

    // Update invoice status to 'Sent' if it's Draft
    if (invoice.status === 'Draft') {
      await pool.execute(
        `UPDATE invoices SET status = 'Unpaid', sent_at = NOW() WHERE id = ?`,
        [id]
      );
    }

    res.json({ 
      success: true, 
      message: 'Invoice sent successfully',
      data: { email: recipientEmail }
    });
  } catch (error) {
    console.error('Send invoice email error:', error);
    res.status(500).json({ success: false, error: 'Failed to send invoice email' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteInvoice,
  createFromTimeLogs,
  createRecurring,
  generatePDF,
  sendEmail
};

