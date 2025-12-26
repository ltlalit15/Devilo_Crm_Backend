// =====================================================
// Credit Note Controller
// =====================================================

const pool = require('../config/db');

/**
 * Generate unique credit note number
 */
const generateCreditNoteNumber = async (companyId) => {
  try {
    const [result] = await pool.execute(
      `SELECT credit_note_number FROM credit_notes 
       WHERE company_id = ? AND is_deleted = 0 
       AND credit_note_number LIKE 'CN#%'
       ORDER BY LENGTH(credit_note_number) DESC, credit_note_number DESC 
       LIMIT 1`,
      [companyId]
    );
    
    let nextNum = 1;
    if (result.length > 0 && result[0].credit_note_number) {
      const cnNum = result[0].credit_note_number;
      const match = cnNum.match(/CN#(\d+)/);
      if (match && match[1]) {
        const existingNum = parseInt(match[1], 10);
        if (!isNaN(existingNum)) {
          nextNum = existingNum + 1;
        }
      }
    }
    
    let creditNoteNumber = `CN#${String(nextNum).padStart(3, '0')}`;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const [existing] = await pool.execute(
        `SELECT id FROM credit_notes WHERE company_id = ? AND credit_note_number = ? AND is_deleted = 0`,
        [companyId, creditNoteNumber]
      );
      
      if (existing.length === 0) {
        return creditNoteNumber;
      }
      
      nextNum++;
      creditNoteNumber = `CN#${String(nextNum).padStart(3, '0')}`;
      attempts++;
    }
    
    const timestamp = Date.now().toString().slice(-6);
    return `CN#${timestamp}`;
  } catch (error) {
    console.error('Error generating credit note number:', error);
    const timestamp = Date.now().toString().slice(-6);
    return `CN#${timestamp}`;
  }
};

/**
 * Get all credit notes
 * GET /api/v1/credit-notes
 */
const getAll = async (req, res) => {
  try {
    const filterCompanyId = req.query.company_id || req.body.company_id || 1;
    const status = req.query.status;
    const invoiceId = req.query.invoice_id;
    const clientId = req.query.client_id;

    let whereClause = 'WHERE cn.is_deleted = 0';
    const params = [];

    if (filterCompanyId) {
      whereClause += ' AND cn.company_id = ?';
      params.push(filterCompanyId);
    }

    if (status && status !== 'All') {
      whereClause += ' AND cn.status = ?';
      params.push(status);
    }

    if (invoiceId) {
      whereClause += ' AND cn.invoice_id = ?';
      params.push(invoiceId);
    }

    if (clientId) {
      whereClause += ' AND i.client_id = ?';
      params.push(clientId);
    }

    const [creditNotes] = await pool.execute(
      `SELECT cn.*, 
              i.invoice_number,
              i.client_id,
              c.company_name as client_name,
              u.name as created_by_name
       FROM credit_notes cn
       LEFT JOIN invoices i ON cn.invoice_id = i.id
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN users u ON cn.created_by = u.id
       ${whereClause}
       ORDER BY cn.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: creditNotes
    });
  } catch (error) {
    console.error('Get credit notes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch credit notes'
    });
  }
};

/**
 * Get credit note by ID
 * GET /api/v1/credit-notes/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [creditNotes] = await pool.execute(
      `SELECT cn.*, 
              i.invoice_number,
              i.client_id,
              c.company_name as client_name,
              u.name as created_by_name
       FROM credit_notes cn
       LEFT JOIN invoices i ON cn.invoice_id = i.id
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE cn.id = ? AND cn.company_id = ? AND cn.is_deleted = 0`,
      [id, req.companyId]
    );

    if (creditNotes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credit note not found'
      });
    }

    res.json({
      success: true,
      data: creditNotes[0]
    });
  } catch (error) {
    console.error('Get credit note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch credit note'
    });
  }
};

/**
 * Create credit note
 * POST /api/v1/credit-notes
 */
const create = async (req, res) => {
  try {
    const {
      invoice_id,
      amount,
      date,
      reason,
      status = 'Pending'
    } = req.body;

    if (!invoice_id || !amount || !date) {
      return res.status(400).json({
        success: false,
        error: 'invoice_id, amount, and date are required'
      });
    }

    // Verify invoice exists and belongs to company
    const [invoices] = await pool.execute(
      `SELECT id, client_id, total, unpaid FROM invoices 
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [invoice_id, req.companyId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = invoices[0];

    // Generate credit note number
    const creditNoteNumber = await generateCreditNoteNumber(req.companyId);

    // Insert credit note
    const [result] = await pool.execute(
      `INSERT INTO credit_notes (
        company_id, credit_note_number, invoice_id, amount, date, reason, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId,
        creditNoteNumber,
        invoice_id,
        amount,
        date,
        reason || null,
        status,
        req.userId
      ]
    );

    // If status is Applied, update invoice unpaid amount
    if (status === 'Applied') {
      await pool.execute(
        `UPDATE invoices SET
          unpaid = GREATEST(0, unpaid - ?),
          status = CASE
            WHEN unpaid - ? <= 0 THEN 'Paid'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [amount, amount, invoice_id]
      );
    }

    res.status(201).json({
      success: true,
      data: { id: result.insertId, credit_note_number: creditNoteNumber },
      message: 'Credit note created successfully'
    });
  } catch (error) {
    console.error('Create credit note error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create credit note'
    });
  }
};

/**
 * Update credit note
 * PUT /api/v1/credit-notes/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, reason, status } = req.body;

    // Check if credit note exists
    const [creditNotes] = await pool.execute(
      `SELECT * FROM credit_notes WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (creditNotes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credit note not found'
      });
    }

    const oldCreditNote = creditNotes[0];
    const updates = [];
    const values = [];

    if (amount !== undefined) {
      updates.push('amount = ?');
      values.push(amount);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (reason !== undefined) {
      updates.push('reason = ?');
      values.push(reason);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, req.companyId);

    await pool.execute(
      `UPDATE credit_notes SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
      values
    );

    // Handle status change to Applied
    if (status === 'Applied' && oldCreditNote.status !== 'Applied') {
      await pool.execute(
        `UPDATE invoices SET
          unpaid = GREATEST(0, unpaid - ?),
          status = CASE
            WHEN unpaid - ? <= 0 THEN 'Paid'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [amount || oldCreditNote.amount, amount || oldCreditNote.amount, oldCreditNote.invoice_id]
      );
    }

    res.json({
      success: true,
      message: 'Credit note updated successfully'
    });
  } catch (error) {
    console.error('Update credit note error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update credit note'
    });
  }
};

/**
 * Delete credit note (soft delete)
 * DELETE /api/v1/credit-notes/:id
 */
const deleteCreditNote = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE credit_notes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Credit note not found'
      });
    }

    res.json({
      success: true,
      message: 'Credit note deleted successfully'
    });
  } catch (error) {
    console.error('Delete credit note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete credit note'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  deleteCreditNote
};

