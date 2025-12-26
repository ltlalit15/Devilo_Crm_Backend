const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    // Admin must provide company_id - required for filtering
    const filterCompanyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'company_id is required'
      });
    }
    
    let whereClause = 'WHERE d.company_id = ? AND d.is_deleted = 0';
    const params = [filterCompanyId];
    
    console.log('=== GET DEPARTMENTS REQUEST ===');
    console.log('Query params:', req.query);
    console.log('Filter company_id:', filterCompanyId);
    console.log('req.companyId:', req.companyId);
    console.log('Where clause:', whereClause);
    console.log('Params:', params);

    // Get all departments without pagination
    const [departments] = await pool.execute(
      `SELECT d.*, c.name as company_name,
       COALESCE((SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id), 0) as total_employees
       FROM departments d
       LEFT JOIN companies c ON d.company_id = c.id
       ${whereClause}
       ORDER BY d.name`,
      params
    );
    
    console.log('Total departments found:', departments.length);
    console.log('Departments:', JSON.stringify(departments, null, 2));
    
    res.json({ 
      success: true, 
      data: departments
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
    const { name, company_id } = req.body;
    
    console.log('=== CREATE DEPARTMENT REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('req.companyId:', req.companyId);
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Department name is required' });
    }
    
    // Use company_id from request body, fallback to req.companyId if not provided
    const finalCompanyId = company_id || req.companyId;
    
    if (!finalCompanyId) {
      return res.status(400).json({ success: false, error: 'Company is required' });
    }
    
    console.log('Final company_id to use:', finalCompanyId);
    
    const [result] = await pool.execute(
      `INSERT INTO departments (company_id, name) VALUES (?, ?)`,
      [finalCompanyId, name.trim()]
    );
    
    console.log('Department created with ID:', result.insertId);
    
    // Fetch the created department with company name
    const [newDepartment] = await pool.execute(
      `SELECT d.*, c.name as company_name,
       COALESCE((SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id), 0) as total_employees
       FROM departments d
       LEFT JOIN companies c ON d.company_id = c.id
       WHERE d.id = ?`,
      [result.insertId]
    );
    
    console.log('Created department data:', JSON.stringify(newDepartment[0], null, 2));
    
    res.status(201).json({ 
      success: true, 
      data: newDepartment[0],
      message: 'Department created successfully'
    });
  } catch (error) {
    console.error('Error creating department:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create department',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Admin must provide company_id - required for filtering
    const companyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const [departments] = await pool.execute(
      `SELECT d.*, c.name as company_name,
       COALESCE((SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id), 0) as total_employees
       FROM departments d
       LEFT JOIN companies c ON d.company_id = c.id
       WHERE d.id = ? AND d.company_id = ? AND d.is_deleted = 0`,
      [id, companyId]
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
    const { name, company_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Department name is required' });
    }
    
    const updateFields = ['name = ?'];
    const updateValues = [name];
    
    // Update company_id if provided
    if (company_id !== undefined) {
      updateFields.push('company_id = ?');
      updateValues.push(company_id);
    }
    
    updateValues.push(id, req.companyId);
    
    const [result] = await pool.execute(
      `UPDATE departments SET ${updateFields.join(', ')} WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      updateValues
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    
    res.json({ success: true, message: 'Department updated successfully' });
  } catch (error) {
    console.error('Error updating department:', error);
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

