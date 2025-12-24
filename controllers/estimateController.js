// =====================================================
// Estimate Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const generateEstimateNumber = async (companyId) => {
  try {
    // Find the highest existing estimate number globally (estimate_number has UNIQUE constraint)
    // Check all estimates, not just for this company, since estimate_number is globally unique
    const [result] = await pool.execute(
      `SELECT estimate_number FROM estimates 
       WHERE is_deleted = 0 AND estimate_number LIKE 'EST#%'
       ORDER BY LENGTH(estimate_number) DESC, estimate_number DESC 
       LIMIT 1`
    );
    
    let nextNum = 1;
    if (result.length > 0 && result[0].estimate_number) {
      // Extract number from EST#001 format
      const estimateNum = result[0].estimate_number;
      const match = estimateNum.match(/EST#(\d+)/);
      if (match && match[1]) {
        const existingNum = parseInt(match[1], 10);
        if (!isNaN(existingNum)) {
          nextNum = existingNum + 1;
        }
      }
    }
    
    // Ensure uniqueness by checking if the number already exists globally
    let estimateNumber = `EST#${String(nextNum).padStart(3, '0')}`;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      // Check globally since estimate_number has UNIQUE constraint
      const [existing] = await pool.execute(
        `SELECT id FROM estimates WHERE estimate_number = ? AND is_deleted = 0`,
        [estimateNumber]
      );
      
      if (existing.length === 0) {
        // Number is unique, return it
        return estimateNumber;
      }
      
      // Number exists, try next one
      nextNum++;
      estimateNumber = `EST#${String(nextNum).padStart(3, '0')}`;
      attempts++;
    }
    
    // Fallback: use timestamp-based number if we can't find a unique sequential number
    const timestamp = Date.now().toString().slice(-6);
    return `EST#${timestamp}`;
  } catch (error) {
    console.error('Error generating estimate number:', error);
    // Fallback to timestamp-based number on error
    const timestamp = Date.now().toString().slice(-6);
    return `EST#${timestamp}`;
  }
};

const getAll = async (req, res) => {
  try {
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    // Only filter by company_id if explicitly provided in query params or req.companyId exists
    const filterCompanyId = req.query.company_id || req.companyId;
    
    let whereClause = 'WHERE e.is_deleted = 0';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND e.company_id = ?';
      params.push(filterCompanyId);
    }
    
    // Optional status filter
    if (req.query.status && req.query.status !== 'All') {
      whereClause += ' AND UPPER(e.status) = UPPER(?)';
      params.push(req.query.status);
    }
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM estimates e ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated estimates - LIMIT and OFFSET as template literals (not placeholders)
    const [estimates] = await pool.execute(
      `SELECT 
        e.id,
        e.company_id,
        e.estimate_number,
        e.valid_till,
        e.currency,
        e.client_id,
        e.project_id,
        e.calculate_tax,
        e.description,
        e.note,
        e.terms,
        e.discount,
        e.discount_type,
        e.sub_total,
        e.discount_amount,
        e.tax_amount,
        e.total,
        e.estimate_request_number,
        e.status,
        e.created_by,
        e.created_at,
        e.updated_at,
        e.is_deleted,
        c.company_name as client_name,
        p.project_name,
        comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Fetch items for each estimate and format the response
    for (let estimate of estimates) {
      const [items] = await pool.execute(
        `SELECT 
          id,
          estimate_id,
          item_name,
          description,
          quantity,
          unit,
          unit_price,
          tax,
          tax_rate,
          file_path,
          amount,
          created_at,
          updated_at
         FROM estimate_items WHERE estimate_id = ?`,
        [estimate.id]
      );
      estimate.items = items || [];
    }

    // Return response in the exact format expected
    res.json({ 
      success: true, 
      data: estimates,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get estimates error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch estimates' 
    });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const [estimates] = await pool.execute(
      `SELECT e.*, c.company_name as client_name, p.project_name, comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       WHERE e.id = ? AND e.is_deleted = 0`,
      [id]
    );
    if (estimates.length === 0) {
      return res.status(404).json({ success: false, error: 'Estimate not found' });
    }

    const estimate = estimates[0];

    // Get estimate items
    const [items] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [id]
    );
    estimate.items = items;

    res.json({ success: true, data: estimate });
  } catch (error) {
    console.error('Get estimate error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch estimate' });
  }
};

const create = async (req, res) => {
  try {
    const { 
      valid_till, currency, client_id, project_id, 
      calculate_tax, description, note, terms,
      discount, discount_type, items = [] 
    } = req.body;

    // Validation
    if (!valid_till || !client_id || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'valid_till, client_id, and items are required'
      });
    }

    const companyId = req.body.company_id || req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "company_id is required"
      });
    }
    const estimate_number = await generateEstimateNumber(companyId);
    
    // Calculate totals from items
    const totals = calculateTotals(items, discount || 0, discount_type || '%');
    
    // Insert estimate
    const [result] = await pool.execute(
      `INSERT INTO estimates (
        company_id, estimate_number, valid_till, currency, client_id, project_id,
        calculate_tax, description, note, terms, discount, discount_type,
        sub_total, discount_amount, tax_amount, total, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        estimate_number,
        valid_till,
        currency || 'USD',
        client_id,
        project_id ?? null,
        calculate_tax || 'After Discount',
        description ?? null,
        note ?? null,
        terms || 'Thank you for your business.',
        discount ?? 0,
        discount_type || '%',
        totals.sub_total,
        totals.discount_amount,
        totals.tax_amount,
        totals.total,
        req.userId ?? null
      ]
    );

    const estimateId = result.insertId;

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
          estimateId,
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
        `INSERT INTO estimate_items (
          estimate_id, item_name, description, quantity, unit, unit_price,
          tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );
    }

    // Get created estimate
    const [estimates] = await pool.execute(
      `SELECT * FROM estimates WHERE id = ?`,
      [estimateId]
    );

    // Get items
    const [estimateItems] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [estimateId]
    );
    estimates[0].items = estimateItems;

    res.status(201).json({ 
      success: true, 
      data: estimates[0], 
      message: 'Estimate created successfully' 
    });
  } catch (error) {
    console.error('Create estimate error:', error);
    res.status(500).json({ success: false, error: 'Failed to create estimate' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if estimate exists
    const [estimates] = await pool.execute(
      `SELECT id FROM estimates WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (estimates.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Estimate not found'
      });
    }

    // Build update query
    const allowedFields = [
      'valid_till', 'currency', 'client_id', 'project_id', 'calculate_tax',
      'description', 'note', 'terms', 'discount', 'discount_type', 'status'
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
      updates.push('sub_total = ?', 'discount_amount = ?', 'tax_amount = ?', 'total = ?');
      values.push(totals.sub_total, totals.discount_amount, totals.tax_amount, totals.total);

      // Update items
      await pool.execute(`DELETE FROM estimate_items WHERE estimate_id = ?`, [id]);
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
          `INSERT INTO estimate_items (
            estimate_id, item_name, description, quantity, unit, unit_price,
            tax, tax_rate, file_path, amount
          ) VALUES ?`,
          [itemValues]
        );
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      await pool.execute(
        `UPDATE estimates SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Get updated estimate
    const [updatedEstimates] = await pool.execute(
      `SELECT * FROM estimates WHERE id = ?`,
      [id]
    );

    // Get items
    const [items] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [id]
    );
    updatedEstimates[0].items = items;

    res.json({
      success: true,
      data: updatedEstimates[0],
      message: 'Estimate updated successfully'
    });
  } catch (error) {
    console.error('Update estimate error:', error);
    res.status(500).json({ success: false, error: 'Failed to update estimate' });
  }
};

const deleteEstimate = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      `UPDATE estimates SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Estimate not found'
      });
    }
    
    res.json({ success: true, message: 'Estimate deleted successfully' });
  } catch (error) {
    console.error('Delete estimate error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete estimate' });
  }
};

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
 * Convert estimate to invoice
 * POST /api/v1/estimates/:id/convert-to-invoice
 */
const convertToInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { invoice_date, due_date, items: requestItems } = req.body;

    // Get estimate
    const [estimates] = await pool.execute(
      `SELECT * FROM estimates WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (estimates.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Estimate not found'
      });
    }

    const estimate = estimates[0];

    let estimateItems = [];

    // If items are provided in request body, use those; otherwise get from database
    if (requestItems && requestItems.length > 0) {
      // Use items from request body
      estimateItems = requestItems;
    } else {
      // Get estimate items from database
      const [dbItems] = await pool.execute(
        `SELECT * FROM estimate_items WHERE estimate_id = ?`,
        [id]
      );
      estimateItems = dbItems;
    }

    if (estimateItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Estimate has no items. Please provide items in the request body or add items to the estimate first.'
      });
    }

    // Validation for invoice dates
    if (!invoice_date || !due_date) {
      return res.status(400).json({
        success: false,
        error: 'invoice_date and due_date are required'
      });
    }

    // Generate invoice number
    const invoice_number = await generateInvoiceNumber(req.companyId);

    // Convert estimate items to invoice items format
    const invoiceItems = estimateItems.map(item => {
      // Handle both database items (with item.item_name) and request items (already in correct format)
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

      return {
        item_name: item.item_name,
        description: item.description || null,
        quantity: quantity,
        unit: item.unit || 'Pcs',
        unit_price: unitPrice,
        tax: item.tax || null,
        tax_rate: taxRate,
        file_path: item.file_path || null,
        amount: finalAmount
      };
    });

    // Calculate totals
    const totals = calculateTotals(invoiceItems, estimate.discount || 0, estimate.discount_type || '%');

    // If items were provided in request body, save them to the estimate
    if (requestItems && requestItems.length > 0) {
      // Delete existing items
      await pool.execute(`DELETE FROM estimate_items WHERE estimate_id = ?`, [id]);
      
      // Insert new items
      const itemValues = requestItems.map(item => {
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
        `INSERT INTO estimate_items (
          estimate_id, item_name, description, quantity, unit, unit_price,
          tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );

      // Update estimate totals
      await pool.execute(
        `UPDATE estimates SET 
          sub_total = ?, discount_amount = ?, tax_amount = ?, total = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND company_id = ?`,
        [totals.sub_total, totals.discount_amount, totals.tax_amount, totals.total, id, req.companyId]
      );
    }

    // Create invoice
    const [invoiceResult] = await pool.execute(
      `INSERT INTO invoices (
        company_id, invoice_number, invoice_date, due_date, currency, exchange_rate,
        client_id, project_id, calculate_tax, note, terms,
        discount, discount_type, sub_total, discount_amount, tax_amount,
        total, unpaid, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        invoice_number,
        invoice_date,
        due_date,
        estimate.currency || 'USD',
        1.0,
        estimate.client_id,
        estimate.project_id ?? null,
        estimate.calculate_tax || 'After Discount',
        estimate.note ?? null,
        estimate.terms || 'Thank you for your business.',
        estimate.discount ?? 0,
        estimate.discount_type || '%',
        totals.sub_total,
        totals.discount_amount,
        totals.tax_amount,
        totals.total,
        totals.unpaid,
        'Unpaid',
        req.userId ?? null
      ]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert invoice items
    const itemValues = invoiceItems.map(item => [
      invoiceId,
      item.item_name,
      item.description,
      item.quantity,
      item.unit,
      item.unit_price,
      item.tax,
      item.tax_rate,
      item.file_path,
      item.amount
    ]);

    await pool.query(
      `INSERT INTO invoice_items (
        invoice_id, item_name, description, quantity, unit, unit_price,
        tax, tax_rate, file_path, amount
      ) VALUES ?`,
      [itemValues]
    );

    // Update estimate status to 'Accepted'
    await pool.execute(
      `UPDATE estimates SET status = 'Accepted', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    // Get created invoice
    const [invoices] = await pool.execute(
      `SELECT * FROM invoices WHERE id = ?`,
      [invoiceId]
    );

    res.status(201).json({
      success: true,
      data: invoices[0],
      message: 'Estimate converted to invoice successfully'
    });
  } catch (error) {
    console.error('Convert estimate to invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert estimate to invoice'
    });
  }
};

module.exports = { 
  getAll, 
  getById, 
  create, 
  update, 
  delete: deleteEstimate,
  convertToInvoice
};

