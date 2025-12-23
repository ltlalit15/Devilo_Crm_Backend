const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const getAll = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, department } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE u.company_id = ? AND u.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND u.status = ?';
      params.push(status);
    }
    if (department) {
      whereClause += ' AND e.department_id = ?';
      params.push(department);
    }

    const [employees] = await pool.execute(
      `SELECT e.*, u.name, u.email, u.role as user_role, u.status, d.name as department_name, p.name as position_name
       FROM employees e
       JOIN users u ON e.user_id = u.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM employees e
       JOIN users u ON e.user_id = u.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: employees,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
};

/**
 * Create employee
 * POST /api/v1/employees
 */
const create = async (req, res) => {
  try {
    const { name, email, password, role, department_id, position_id, employee_number, joining_date, status } = req.body;

    // Validation
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'name, email, and role are required'
      });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      `SELECT id FROM users WHERE email = ? AND company_id = ?`,
      [email, req.companyId]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Generate default password if not provided
    const defaultPassword = password || Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '123';

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create user first
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      const [userResult] = await connection.execute(
        `INSERT INTO users (company_id, name, email, password, role, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.companyId ?? null,
          name,
          email,
          hashedPassword,
          role,
          status || 'Active'
        ]
      );

      const userId = userResult.insertId;

      // Generate employee number if not provided
      let empNumber = employee_number;
      if (!empNumber) {
        const [countResult] = await connection.execute(
          `SELECT COUNT(*) as count FROM employees e
           JOIN users u ON e.user_id = u.id
           WHERE u.company_id = ?`,
          [req.companyId]
        );
        empNumber = `EMP-${String(countResult[0].count + 1).padStart(4, '0')}`;
      }

      // Create employee record
      const [employeeResult] = await connection.execute(
        `INSERT INTO employees (user_id, employee_number, department_id, position_id, role, joining_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          empNumber,
          department_id ?? null,
          position_id ?? null,
          role ?? null,
          joining_date ?? null
        ]
      );

      await connection.commit();

      // Get created employee with user details
      const [employees] = await pool.execute(
        `SELECT e.*, u.name, u.email, u.role as user_role, u.status, d.name as department_name, p.name as position_name
         FROM employees e
         JOIN users u ON e.user_id = u.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN positions p ON e.position_id = p.id
         WHERE e.id = ?`,
        [employeeResult.insertId]
      );

      res.status(201).json({
        success: true,
        data: employees[0],
        message: 'Employee created successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create employee'
    });
  }
};

module.exports = { getAll, create };

