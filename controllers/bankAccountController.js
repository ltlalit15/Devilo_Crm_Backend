// =====================================================
// Bank Account Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get all bank accounts
 * GET /api/v1/bank-accounts
 */
const getAll = async (req, res) => {
  try {
    // Admin must provide company_id - required for filtering
    const filterCompanyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required'
      });
    }

    let whereClause = 'WHERE ba.company_id = ? AND ba.is_deleted = 0';
    const params = [filterCompanyId];

    // Get all bank accounts without pagination
    const [accounts] = await pool.execute(
      `SELECT ba.*, c.name as company_name
       FROM bank_accounts ba
       LEFT JOIN companies c ON ba.company_id = c.id
       ${whereClause}
       ORDER BY ba.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Get bank accounts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bank accounts'
    });
  }
};

/**
 * Get bank account by ID
 * GET /api/v1/bank-accounts/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    // Admin must provide company_id - required for filtering
    const filterCompanyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required'
      });
    }

    let whereClause = 'WHERE ba.id = ? AND ba.company_id = ? AND ba.is_deleted = 0';
    const params = [id, filterCompanyId];

    const [accounts] = await pool.execute(
      `SELECT ba.*, c.name as company_name
       FROM bank_accounts ba
       LEFT JOIN companies c ON ba.company_id = c.id
       ${whereClause}`,
      params
    );

    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    res.json({
      success: true,
      data: accounts[0]
    });
  } catch (error) {
    console.error('Get bank account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bank account'
    });
  }
};

/**
 * Create bank account
 * POST /api/v1/bank-accounts
 */
const create = async (req, res) => {
  try {
    const {
      account_name,
      account_number,
      bank_name,
      bank_code,
      branch_name,
      branch_code,
      swift_code,
      iban,
      currency = 'USD',
      opening_balance = 0,
      current_balance = 0,
      notes
    } = req.body;

    if (!account_name || !bank_name) {
      return res.status(400).json({
        success: false,
        error: 'Account name and bank name are required'
      });
    }

    const companyId = req.body.company_id || req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO bank_accounts (
        company_id, account_name, account_number, bank_name, bank_code,
        branch_name, branch_code, swift_code, iban, currency,
        opening_balance, current_balance, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        companyId, account_name, account_number || null, bank_name, bank_code || null,
        branch_name || null, branch_code || null, swift_code || null, iban || null, currency,
        opening_balance, current_balance, notes || null
      ]
    );

    const [newAccount] = await pool.execute(
      'SELECT * FROM bank_accounts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: newAccount[0],
      message: 'Bank account created successfully'
    });
  } catch (error) {
    console.error('Create bank account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bank account'
    });
  }
};

/**
 * Update bank account
 * PUT /api/v1/bank-accounts/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      account_name,
      account_number,
      bank_name,
      bank_code,
      branch_name,
      branch_code,
      swift_code,
      iban,
      currency,
      opening_balance,
      current_balance,
      notes
    } = req.body;

    const filterCompanyId = req.body.company_id || req.companyId;

    // Check if account exists
    let whereClause = 'WHERE id = ? AND is_deleted = 0';
    const checkParams = [id];

    if (filterCompanyId) {
      whereClause += ' AND company_id = ?';
      checkParams.push(filterCompanyId);
    }

    const [existing] = await pool.execute(
      `SELECT id FROM bank_accounts ${whereClause}`,
      checkParams
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (account_name !== undefined) {
      updates.push('account_name = ?');
      params.push(account_name);
    }
    if (account_number !== undefined) {
      updates.push('account_number = ?');
      params.push(account_number);
    }
    if (bank_name !== undefined) {
      updates.push('bank_name = ?');
      params.push(bank_name);
    }
    if (bank_code !== undefined) {
      updates.push('bank_code = ?');
      params.push(bank_code);
    }
    if (branch_name !== undefined) {
      updates.push('branch_name = ?');
      params.push(branch_name);
    }
    if (branch_code !== undefined) {
      updates.push('branch_code = ?');
      params.push(branch_code);
    }
    if (swift_code !== undefined) {
      updates.push('swift_code = ?');
      params.push(swift_code);
    }
    if (iban !== undefined) {
      updates.push('iban = ?');
      params.push(iban);
    }
    if (currency !== undefined) {
      updates.push('currency = ?');
      params.push(currency);
    }
    if (opening_balance !== undefined) {
      updates.push('opening_balance = ?');
      params.push(opening_balance);
    }
    if (current_balance !== undefined) {
      updates.push('current_balance = ?');
      params.push(current_balance);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.execute(
      `UPDATE bank_accounts SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [updatedAccount] = await pool.execute(
      'SELECT * FROM bank_accounts WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: updatedAccount[0],
      message: 'Bank account updated successfully'
    });
  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bank account'
    });
  }
};

/**
 * Delete bank account (soft delete)
 * DELETE /api/v1/bank-accounts/:id
 */
const deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const filterCompanyId = req.query.company_id || req.companyId;

    let whereClause = 'WHERE id = ? AND is_deleted = 0';
    const params = [id];

    if (filterCompanyId) {
      whereClause += ' AND company_id = ?';
      params.push(filterCompanyId);
    }

    const [existing] = await pool.execute(
      `SELECT id FROM bank_accounts ${whereClause}`,
      params
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE bank_accounts SET is_deleted = 1, updated_at = NOW() WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Bank account deleted successfully'
    });
  } catch (error) {
    console.error('Delete bank account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bank account'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteAccount
};

