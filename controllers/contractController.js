const pool = require('../config/db');

const generateContractNumber = async (companyId) => {
  const [result] = await pool.execute(`SELECT COUNT(*) as count FROM contracts WHERE company_id = ?`, [companyId]);
  const nextNum = (result[0].count || 0) + 1;
  return `CONTRACT #${nextNum}`;
};

const getAll = async (req, res) => {
  try {
    const { status, lead_id } = req.query;

    // Admin must provide company_id - required for filtering
    const filterCompanyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'company_id is required'
      });
    }
    
    let whereClause = 'WHERE c.company_id = ? AND c.is_deleted = 0';
    const params = [filterCompanyId];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (lead_id) {
      whereClause += ' AND c.lead_id = ?';
      params.push(parseInt(lead_id));
    }

    // Get all contracts without pagination
    const [contracts] = await pool.execute(
      `SELECT c.*, cl.company_name as client_name
       FROM contracts c
       LEFT JOIN clients cl ON c.client_id = cl.id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: contracts
    });
  } catch (error) {
    console.error('Get contracts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [contracts] = await pool.execute(
      `SELECT c.*, cl.company_name as client_name, p.project_name
       FROM contracts c
       LEFT JOIN clients cl ON c.client_id = cl.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE c.id = ? AND c.is_deleted = 0`,
      [id]
    );

    if (contracts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    res.json({
      success: true,
      data: contracts[0]
    });
  } catch (error) {
    console.error('Get contract error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contract'
    });
  }
};

const create = async (req, res) => {
  try {
    const contract_number = await generateContractNumber(req.companyId);
    const { 
      title, contract_date, valid_until, client_id, project_id,
      lead_id, tax, second_tax, note, file_path, amount, status
    } = req.body;
    
    // Validation
    if (!title || !contract_date || !valid_until) {
      return res.status(400).json({
        success: false,
        error: 'title, contract_date, and valid_until are required'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO contracts (
        company_id, contract_number, title, contract_date, valid_until,
        client_id, project_id, lead_id, tax, second_tax, note, file_path,
        amount, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        contract_number,
        title,
        contract_date,
        valid_until,
        client_id ?? null,
        project_id ?? null,
        lead_id ?? null,
        tax ?? null,
        second_tax ?? null,
        note ?? null,
        file_path ?? null,
        amount ?? 0,
        status || 'Draft',
        req.userId ?? null
      ]
    );

    // Get created contract
    const [contracts] = await pool.execute(
      `SELECT * FROM contracts WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ 
      success: true, 
      data: contracts[0],
      message: 'Contract created successfully'
    });
  } catch (error) {
    console.error('Create contract error:', error);
    res.status(500).json({ success: false, error: 'Failed to create contract' });
  }
};

/**
 * Update contract
 * PUT /api/v1/contracts/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, contract_date, valid_until, client_id, project_id,
      lead_id, tax, second_tax, note, file_path, amount, status
    } = req.body;

    // Check if contract exists
    const [contracts] = await pool.execute(
      `SELECT id FROM contracts WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (contracts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (contract_date !== undefined) {
      updates.push('contract_date = ?');
      values.push(contract_date);
    }
    if (valid_until !== undefined) {
      updates.push('valid_until = ?');
      values.push(valid_until);
    }
    if (client_id !== undefined) {
      updates.push('client_id = ?');
      values.push(client_id);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      values.push(project_id);
    }
    if (lead_id !== undefined) {
      updates.push('lead_id = ?');
      values.push(lead_id);
    }
    if (tax !== undefined) {
      updates.push('tax = ?');
      values.push(tax);
    }
    if (second_tax !== undefined) {
      updates.push('second_tax = ?');
      values.push(second_tax);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      values.push(note);
    }
    if (file_path !== undefined) {
      updates.push('file_path = ?');
      values.push(file_path);
    }
    if (amount !== undefined) {
      updates.push('amount = ?');
      values.push(amount);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      await pool.execute(
        `UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Get updated contract with client name
    const [updatedContracts] = await pool.execute(
      `SELECT c.*, cl.company_name as client_name
       FROM contracts c
       LEFT JOIN clients cl ON c.client_id = cl.id
       WHERE c.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedContracts[0],
      message: 'Contract updated successfully'
    });
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contract'
    });
  }
};

/**
 * Update contract status
 * PUT /api/v1/contracts/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validation
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required'
      });
    }

    // Validate status value
    const validStatuses = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Check if contract exists
    const [contracts] = await pool.execute(
      `SELECT id FROM contracts WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (contracts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Update contract status
    await pool.execute(
      `UPDATE contracts 
       SET status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [status, id]
    );

    // Get updated contract
    const [updatedContracts] = await pool.execute(
      `SELECT * FROM contracts WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedContracts[0],
      message: 'Contract status updated successfully'
    });
  } catch (error) {
    console.error('Update contract status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contract status'
    });
  }
};

const deleteContract = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE contracts SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    res.json({
      success: true,
      message: 'Contract deleted successfully'
    });
  } catch (error) {
    console.error('Delete contract error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contract'
    });
  }
};

module.exports = { getAll, getById, create, update, updateStatus, delete: deleteContract };

