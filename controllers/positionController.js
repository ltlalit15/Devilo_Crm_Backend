const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    if (!req.companyId) {
      return res.status(400).json({ success: false, error: 'Company ID is required' });
    }

    const [positions] = await pool.execute(
      `SELECT p.*, 
              d.name as department_name,
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE p.company_id = ? AND p.is_deleted = 0 
       ORDER BY p.name`,
      [req.companyId]
    );
    
    res.json({ success: true, data: positions });
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
              COALESCE((SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id), 0) as total_employees
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE p.id = ? AND p.company_id = ? AND p.is_deleted = 0`,
      [id, req.companyId]
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
    const { name, department_id, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Position name is required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO positions (company_id, name, department_id, description) 
       VALUES (?, ?, ?, ?)`,
      [req.companyId, name, department_id || null, description || null]
    );
    
    res.status(201).json({ 
      success: true, 
      data: { id: result.insertId },
      message: 'Position created successfully'
    });
  } catch (error) {
    console.error('Create position error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create position'
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_id, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Position name is required' });
    }

    const [result] = await pool.execute(
      `UPDATE positions 
       SET name = ?, department_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [name, department_id || null, description || null, id, req.companyId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }
    
    res.json({ success: true, message: 'Position updated successfully' });
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

