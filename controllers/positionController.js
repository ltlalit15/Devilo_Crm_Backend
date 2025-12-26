const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    // Only filter by company_id if explicitly provided in query params
    const filterCompanyId = req.query.company_id || req.body.company_id || null;
    
    let whereClause = 'WHERE p.is_deleted = 0';
    const params = [];
    
    // Add company filter only if explicitly requested via query param
    if (filterCompanyId) {
      whereClause += ' AND p.company_id = ?';
      params.push(filterCompanyId);
    }

    // Get all positions without pagination
    const [positions] = await pool.execute(
      `SELECT p.*, 
              d.name as department_name,
              c.name as company_name,
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN companies c ON p.company_id = c.id
       ${whereClause}
       ORDER BY p.name`,
      params
    );
    
    res.json({ 
      success: true, 
      data: positions
    });
  } catch (error) {
    console.error('Get positions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch positions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.companyId) {
      return res.status(400).json({ success: false, error: 'Company ID is required' });
    }

    const [positions] = await pool.execute(
      `SELECT p.*, 
              d.name as department_name,
              c.name as company_name,
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN companies c ON p.company_id = c.id
       WHERE p.id = ? AND p.is_deleted = 0`,
      [id]
    );
    
    if (positions.length === 0) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    res.json({ success: true, data: positions[0] });
  } catch (error) {
    console.error('Get position error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch position',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const create = async (req, res) => {
  try {
    const { name, department_id, description, company_id } = req.body;
    
    console.log('=== CREATE POSITION REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('req.companyId:', req.companyId);
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Position name is required' });
    }
    
    // Use company_id from request body, fallback to req.companyId if not provided
    const finalCompanyId = company_id || req.companyId;
    
    if (!finalCompanyId) {
      return res.status(400).json({ success: false, error: 'Company is required' });
    }
    
    console.log('Final company_id to use:', finalCompanyId);

    const [result] = await pool.execute(
      `INSERT INTO positions (company_id, name, department_id, description) 
       VALUES (?, ?, ?, ?)`,
      [finalCompanyId, name.trim(), department_id || null, description || null]
    );
    
    console.log('Position created with ID:', result.insertId);
    
    // Fetch the created position with company and department names
    const [newPosition] = await pool.execute(
      `SELECT p.*, 
              d.name as department_name,
              c.name as company_name,
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN companies c ON p.company_id = c.id
       WHERE p.id = ?`,
      [result.insertId]
    );
    
    console.log('Created position data:', JSON.stringify(newPosition[0], null, 2));
    
    res.status(201).json({ 
      success: true, 
      data: newPosition[0],
      message: 'Position created successfully'
    });
  } catch (error) {
    console.error('Create position error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create position',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_id, description, company_id } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Position name is required' });
    }

    const updateFields = ['name = ?', 'department_id = ?', 'description = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const updateValues = [name.trim(), department_id || null, description || null];
    
    // Update company_id if provided
    if (company_id !== undefined) {
      updateFields.splice(3, 0, 'company_id = ?'); // Insert before updated_at
      updateValues.splice(3, 0, company_id);
    }
    
    updateValues.push(id);
    
    // Remove company_id filter from WHERE clause to allow updating across companies
    const [result] = await pool.execute(
      `UPDATE positions 
       SET ${updateFields.join(', ')}
       WHERE id = ? AND is_deleted = 0`,
      updateValues
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    // Fetch updated position with company and department names
    const [updatedPosition] = await pool.execute(
      `SELECT p.*, 
              d.name as department_name,
              c.name as company_name,
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN companies c ON p.company_id = c.id
       WHERE p.id = ?`,
      [id]
    );
    
    res.json({ 
      success: true, 
      data: updatedPosition[0],
      message: 'Position updated successfully' 
    });
  } catch (error) {
    console.error('Update position error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update position'
    });
  }
};

const deletePosition = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.execute(
      `UPDATE positions SET is_deleted = 1 WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    res.json({ success: true, message: 'Position deleted successfully' });
  } catch (error) {
    console.error('Delete position error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to delete position'
    });
  }
};

module.exports = { getAll, getById, create, update, deletePosition };

