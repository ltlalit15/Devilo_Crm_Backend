const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const getAll = async (req, res) => {
  try {
    // Check if companyId exists
    if (!req.companyId) {
      return res.status(400).json({ success: false, error: 'Company ID is required' });
    }
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    const whereClause = 'WHERE d.company_id = ? AND d.is_deleted = 0';
    const params = [req.companyId];
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM departments d ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated departments - LIMIT and OFFSET as template literals (not placeholders)
    const [departments] = await pool.execute(
      `SELECT d.*, u.name as head_name, u.email as head_email,
       COALESCE((SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id), 0) as total_employees
       FROM departments d
       LEFT JOIN users u ON d.head_id = u.id
       ${whereClause}
       ORDER BY d.name
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    
    res.json({ 
      success: true, 
      data: departments,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      companyId: req.companyId
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch departments',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const create = async (req, res) => {
  try {
    const { name, head_id } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO departments (company_id, name, head_id) VALUES (?, ?, ?)`,
      [req.companyId, name, head_id]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create department' });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.companyId) {
      return res.status(400).json({ success: false, error: 'Company ID is required' });
    }

    const [departments] = await pool.execute(
      `SELECT d.*, u.name as head_name, u.email as head_email,
       COALESCE((SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id), 0) as total_employees
       FROM departments d
       LEFT JOIN users u ON d.head_id = u.id
       WHERE d.id = ? AND d.company_id = ? AND d.is_deleted = 0`,
      [id, req.companyId]
    );
    
    if (departments.length === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    
    res.json({ success: true, data: departments[0] });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch department',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, head_id } = req.body;
    
    const [result] = await pool.execute(
      `UPDATE departments SET name = ?, head_id = ? WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [name, head_id, id, req.companyId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    
    res.json({ success: true, message: 'Department updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update department' });
  }
};

const deleteDept = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.execute(
      `UPDATE departments SET is_deleted = 1 WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete department' });
  }
};

module.exports = { getAll, create, getById, update, deleteDept };

