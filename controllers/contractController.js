const pool = require('../config/db');

const generateContractNumber = async (companyId) => {
  const [result] = await pool.execute(`SELECT COUNT(*) as count FROM contracts WHERE company_id = ?`, [companyId]);
  const nextNum = (result[0].count || 0) + 1;
  return `CONTRACT #${nextNum}`;
};

const getAll = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = 'WHERE c.company_id = ? AND c.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

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
 * Update contract status
 * PUT /api/v1/contracts/:id
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
      `SELECT id FROM contracts WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
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
       WHERE id = ? AND company_id = ?`,
      [status, id, req.companyId]
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

module.exports = { getAll, create, updateStatus };

