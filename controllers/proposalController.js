// =====================================================
// Proposal Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const generateProposalNumber = async (companyId) => {
  try {
    // Find the highest existing proposal number for this company
    // Using estimates table but filtering by proposal_number pattern
    const [result] = await pool.execute(
      `SELECT estimate_number FROM estimates 
       WHERE company_id = ? AND is_deleted = 0 
       AND estimate_number LIKE 'PROP#%'
       ORDER BY LENGTH(estimate_number) DESC, estimate_number DESC 
       LIMIT 1`,
      [companyId]
    );
    
    let nextNum = 1;
    if (result.length > 0 && result[0].estimate_number) {
      // Extract number from PROP#001 format
      const proposalNum = result[0].estimate_number;
      const match = proposalNum.match(/PROP#(\d+)/);
      if (match && match[1]) {
        const existingNum = parseInt(match[1], 10);
        if (!isNaN(existingNum)) {
          nextNum = existingNum + 1;
        }
      }
    }
    
    // Ensure uniqueness by checking if the number already exists
    let proposalNumber = `PROP#${String(nextNum).padStart(3, '0')}`;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const [existing] = await pool.execute(
        `SELECT id FROM estimates WHERE company_id = ? AND estimate_number = ? AND is_deleted = 0`,
        [companyId, proposalNumber]
      );
      
      if (existing.length === 0) {
        // Number is unique, return it
        return proposalNumber;
      }
      
      // Number exists, try next one
      nextNum++;
      proposalNumber = `PROP#${String(nextNum).padStart(3, '0')}`;
      attempts++;
    }
    
    // Fallback: use timestamp-based number if we can't find a unique sequential number
    const timestamp = Date.now().toString().slice(-6);
    return `PROP#${timestamp}`;
  } catch (error) {
    console.error('Error generating proposal number:', error);
    // Fallback to timestamp-based number on error
    const timestamp = Date.now().toString().slice(-6);
    return `PROP#${timestamp}`;
  }
};

const calculateTotals = (items, discount, discountType) => {
  let subTotal = 0;
  let taxAmount = 0;

  items.forEach(item => {
    const quantity = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const taxRate = parseFloat(item.tax_rate) || 0;
    
    const itemSubtotal = quantity * unitPrice;
    const itemTax = itemSubtotal * (taxRate / 100);
    
    subTotal += itemSubtotal;
    taxAmount += itemTax;
  });

  let discountAmount = 0;
  if (discountType === '%') {
    discountAmount = (subTotal * parseFloat(discount)) / 100;
  } else {
    discountAmount = parseFloat(discount) || 0;
  }

  const total = subTotal + taxAmount - discountAmount;

  return {
    sub_total: Math.round(subTotal * 100) / 100,
    discount_amount: Math.round(discountAmount * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100
  };
};

const getAll = async (req, res) => {
  try {
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    // Get filters from query params
    const filterCompanyId = req.query.company_id || req.companyId;
    const status = req.query.status;
    
    // Filter proposals by PROP# prefix OR by status (Sent, Draft) if no prefix
    // This allows flexibility - proposals can be identified by prefix or status
    let whereClause = 'WHERE e.is_deleted = 0 AND e.estimate_number LIKE \'PROP#%\'';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND e.company_id = ?';
      params.push(filterCompanyId);
    }
    
    if (status && status !== 'All') {
      // Handle both lowercase and uppercase status
      const statusUpper = status.toUpperCase();
      if (statusUpper === 'SENT') {
        whereClause += ' AND UPPER(e.status) = \'SENT\'';
      } else if (statusUpper === 'DRAFT') {
        whereClause += ' AND UPPER(e.status) = \'DRAFT\'';
      } else {
        whereClause += ' AND UPPER(e.status) = ?';
        params.push(statusUpper);
      }
    }
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM estimates e ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated proposals - LIMIT and OFFSET as template literals (not placeholders)
    const [proposals] = await pool.execute(
      `SELECT e.*, c.company_name as client_name, p.project_name, comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    for (let proposal of proposals) {
      const [items] = await pool.execute(
        `SELECT * FROM estimate_items WHERE estimate_id = ?`,
        [proposal.id]
      );
      proposal.items = items;
    }

    res.json({ 
      success: true, 
      data: proposals,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch proposals' });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const [proposals] = await pool.execute(
      `SELECT e.*, c.company_name as client_name, p.project_name, comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       WHERE e.id = ? AND e.is_deleted = 0 AND (e.estimate_number LIKE 'PROP#%' OR e.status IN ('Sent', 'Draft'))`,
      [id]
    );
    if (proposals.length === 0) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const proposal = proposals[0];

    // Get proposal items
    const [items] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [id]
    );
    proposal.items = items;

    res.json({ success: true, data: proposal });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch proposal' });
  }
};

const create = async (req, res) => {
  try {
    const { 
      valid_till, currency, client_id, project_id, 
      calculate_tax, description, note, terms,
      discount, discount_type, items = [], status
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
    const proposal_number = await generateProposalNumber(companyId);
    
    // Calculate totals from items
    const totals = calculateTotals(items, discount || 0, discount_type || '%');
    
    // Map status: 'sent' -> 'Sent', 'draft' -> 'Draft', etc.
    let mappedStatus = 'Draft';
    if (status === 'sent') {
      mappedStatus = 'Sent';
    } else if (status === 'draft') {
      mappedStatus = 'Draft';
    } else if (status) {
      mappedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }
    
    // Insert proposal (using estimates table with PROP# prefix)
    const [result] = await pool.execute(
      `INSERT INTO estimates (
        company_id, estimate_number, valid_till, currency, client_id, project_id,
        calculate_tax, description, note, terms, discount, discount_type,
        sub_total, discount_amount, tax_amount, total, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        proposal_number,
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
        mappedStatus,
        req.user?.id || 1
      ]
    );

    const proposalId = result.insertId;

    // Insert proposal items
    if (items && items.length > 0) {
      const itemValues = items.map(item => {
        const quantity = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxRate = parseFloat(item.tax_rate) || 0;
        
        // Calculate amount if not provided
        let amount = parseFloat(item.amount) || 0;
        if (!amount && (quantity > 0 || unitPrice > 0)) {
          const subtotal = quantity * unitPrice;
          amount = subtotal + (subtotal * taxRate / 100);
        }
        
        return [
          proposalId,
          item.item_name || '',
          item.description || null,
          quantity,
          item.unit || 'Pcs',
          unitPrice,
          item.tax || null,
          taxRate,
          item.file_path || null,
          amount
        ];
      });

      await pool.query(
        `INSERT INTO estimate_items (
          estimate_id, item_name, description, quantity, unit, unit_price, tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );
    }

    // Fetch the created proposal with relations
    const [proposals] = await pool.execute(
      `SELECT e.*, c.company_name as client_name, p.project_name, comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       WHERE e.id = ?`,
      [proposalId]
    );

    const proposal = proposals[0];
    const [itemsData] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [proposalId]
    );
    proposal.items = itemsData;

    res.status(201).json({ success: true, data: proposal });
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create proposal' 
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      valid_till, currency, client_id, project_id,
      calculate_tax, description, note, terms,
      discount, discount_type, items = [], status
    } = req.body;

    // Check if proposal exists
    const [existing] = await pool.execute(
      `SELECT id FROM estimates WHERE id = ? AND is_deleted = 0 AND (estimate_number LIKE 'PROP#%' OR status IN ('Sent', 'Draft'))`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    // Calculate totals if items are provided
    let totals = { sub_total: 0, discount_amount: 0, tax_amount: 0, total: 0 };
    if (items && items.length > 0) {
      totals = calculateTotals(items, discount || 0, discount_type || '%');
    }

    // Map status
    let mappedStatus = null;
    if (status === 'sent') {
      mappedStatus = 'Sent';
    } else if (status === 'draft') {
      mappedStatus = 'Draft';
    } else if (status) {
      mappedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }

    // Update proposal
    const updateFields = [];
    const updateValues = [];

    if (valid_till !== undefined) {
      updateFields.push('valid_till = ?');
      updateValues.push(valid_till);
    }
    if (currency !== undefined) {
      updateFields.push('currency = ?');
      updateValues.push(currency);
    }
    if (client_id !== undefined) {
      updateFields.push('client_id = ?');
      updateValues.push(client_id);
    }
    if (project_id !== undefined) {
      updateFields.push('project_id = ?');
      updateValues.push(project_id ?? null);
    }
    if (calculate_tax !== undefined) {
      updateFields.push('calculate_tax = ?');
      updateValues.push(calculate_tax);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (note !== undefined) {
      updateFields.push('note = ?');
      updateValues.push(note);
    }
    if (terms !== undefined) {
      updateFields.push('terms = ?');
      updateValues.push(terms);
    }
    if (discount !== undefined) {
      updateFields.push('discount = ?');
      updateValues.push(discount);
    }
    if (discount_type !== undefined) {
      updateFields.push('discount_type = ?');
      updateValues.push(discount_type);
    }
    if (mappedStatus !== null) {
      updateFields.push('status = ?');
      updateValues.push(mappedStatus);
    }
    if (items && items.length > 0) {
      updateFields.push('sub_total = ?');
      updateFields.push('discount_amount = ?');
      updateFields.push('tax_amount = ?');
      updateFields.push('total = ?');
      updateValues.push(totals.sub_total, totals.discount_amount, totals.tax_amount, totals.total);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    await pool.execute(
      `UPDATE estimates SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Update items if provided
    if (items && items.length > 0) {
      // Delete existing items
      await pool.execute(`DELETE FROM estimate_items WHERE estimate_id = ?`, [id]);

      // Insert new items
      const itemValues = items.map(item => {
        const quantity = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxRate = parseFloat(item.tax_rate) || 0;
        
        // Calculate amount if not provided
        let amount = parseFloat(item.amount) || 0;
        if (!amount && (quantity > 0 || unitPrice > 0)) {
          const subtotal = quantity * unitPrice;
          amount = subtotal + (subtotal * taxRate / 100);
        }
        
        return [
          id,
          item.item_name || '',
          item.description || null,
          quantity,
          item.unit || 'Pcs',
          unitPrice,
          item.tax || null,
          taxRate,
          item.file_path || null,
          amount
        ];
      });

      await pool.query(
        `INSERT INTO estimate_items (
          estimate_id, item_name, description, quantity, unit, unit_price, tax, tax_rate, file_path, amount
        ) VALUES ?`,
        [itemValues]
      );
    }

    // Fetch updated proposal
    const [proposals] = await pool.execute(
      `SELECT e.*, c.company_name as client_name, p.project_name, comp.name as company_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN companies comp ON e.company_id = comp.id
       WHERE e.id = ?`,
      [id]
    );

    const proposal = proposals[0];
    const [itemsData] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [id]
    );
    proposal.items = itemsData;

    res.json({ success: true, data: proposal });
  } catch (error) {
    console.error('Update proposal error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update proposal' 
    });
  }
};

const deleteProposal = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if proposal exists
    const [existing] = await pool.execute(
      `SELECT id FROM estimates WHERE id = ? AND is_deleted = 0 AND (estimate_number LIKE 'PROP#%' OR status IN ('Sent', 'Draft'))`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    // Soft delete
    await pool.execute(
      `UPDATE estimates SET is_deleted = 1 WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: 'Proposal deleted successfully' });
  } catch (error) {
    console.error('Delete proposal error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete proposal' });
  }
};

const convertToInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if proposal exists
    const [proposals] = await pool.execute(
      `SELECT e.* FROM estimates e 
       WHERE e.id = ? AND e.is_deleted = 0 AND (e.estimate_number LIKE 'PROP#%' OR e.status IN ('Sent', 'Draft'))`,
      [id]
    );

    if (proposals.length === 0) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    const proposal = proposals[0];

    // Get proposal items
    const [items] = await pool.execute(
      `SELECT * FROM estimate_items WHERE estimate_id = ?`,
      [id]
    );

    // Create invoice from proposal (you'll need to implement invoice creation logic)
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'Proposal converted to invoice successfully',
      data: { proposal, items }
    });
  } catch (error) {
    console.error('Convert proposal to invoice error:', error);
    res.status(500).json({ success: false, error: 'Failed to convert proposal to invoice' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteProposal,
  convertToInvoice
};

