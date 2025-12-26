const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const getAll = async (req, res) => {
  try {
    const { status, department, company_id } = req.query;

    // Only filter by company_id if explicitly provided in query params
    // Don't use req.companyId automatically - show all employees by default
    const filterCompanyId = company_id;
    
    let whereClause = 'WHERE u.is_deleted = 0';
    const params = [];

    // Add company filter only if explicitly requested via query param
    if (filterCompanyId) {
      whereClause += ' AND u.company_id = ?';
      params.push(filterCompanyId);
    }

    if (status) {
      whereClause += ' AND u.status = ?';
      params.push(status);
    }
    if (department) {
      whereClause += ' AND e.department_id = ?';
      params.push(department);
    }

    console.log('=== GET EMPLOYEES REQUEST ===');
    console.log('Query params:', req.query);
    console.log('Filter company_id:', filterCompanyId);
    console.log('req.companyId:', req.companyId);
    console.log('Where clause:', whereClause);
    console.log('Params:', params);

    // Get all employees without pagination
    const [employees] = await pool.execute(
      `SELECT e.*, 
              u.name, u.email, u.phone, u.address, u.role as user_role, u.status,
              u.company_id,
              c.name as company_name,
              d.name as department_name, 
              p.name as position_name
       FROM employees e
       JOIN users u ON e.user_id = u.id
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       ${whereClause}
       ORDER BY e.created_at DESC`,
      params
    );

    console.log('Total employees found:', employees.length);
    console.log('Employees:', JSON.stringify(employees, null, 2));

    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    console.error('Get employees error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch employees',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create employee
 * POST /api/v1/employees
 */
const create = async (req, res) => {
  try {
    const { 
      name, email, phone, password, role, 
      company_id, department_id, position_id, 
      employee_number, joining_date, salary, address, status 
    } = req.body;

    console.log('=== CREATE EMPLOYEE REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and Email are required'
      });
    }

    // Use company_id from request body, fallback to req.companyId
    const finalCompanyId = company_id || req.companyId;
    
    if (!finalCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'Company is required'
      });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      `SELECT id FROM users WHERE email = ?`,
      [email]
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
        `INSERT INTO users (company_id, name, email, phone, address, password, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalCompanyId,
          name,
          email,
          phone || null,
          address || null,
          hashedPassword,
          role || 'EMPLOYEE',
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
          [finalCompanyId]
        );
        empNumber = `EMP-${String(countResult[0].count + 1).padStart(4, '0')}`;
      }

      // Create employee record
      const [employeeResult] = await connection.execute(
        `INSERT INTO employees (user_id, employee_number, department_id, position_id, role, joining_date, salary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          empNumber,
          department_id || null,
          position_id || null,
          role || null,
          joining_date || null,
          salary || null
        ]
      );

      await connection.commit();

      // Get created employee with user details
      const [employees] = await pool.execute(
        `SELECT e.*, 
                u.name, u.email, u.phone, u.address, u.role as user_role, u.status,
                u.company_id,
                c.name as company_name,
                d.name as department_name, 
                p.name as position_name
         FROM employees e
         JOIN users u ON e.user_id = u.id
         LEFT JOIN companies c ON u.company_id = c.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN positions p ON e.position_id = p.id
         WHERE e.id = ?`,
        [employeeResult.insertId]
      );

      console.log('Created employee:', JSON.stringify(employees[0], null, 2));

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
      error: error.message || 'Failed to create employee',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get employee by ID
 * GET /api/v1/employees/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [employees] = await pool.execute(
      `SELECT e.*, 
              u.name, u.email, u.phone, u.address, u.role as user_role, u.status,
              u.company_id,
              c.name as company_name,
              d.name as department_name, 
              p.name as position_name
       FROM employees e
       JOIN users u ON e.user_id = u.id
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       WHERE e.id = ? AND u.is_deleted = 0`,
      [id]
    );

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    res.json({
      success: true,
      data: employees[0]
    });
  } catch (error) {
    console.error('Get employee by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee'
    });
  }
};

/**
 * Update employee
 * PUT /api/v1/employees/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, email, phone, address,
      company_id, department_id, position_id,
      employee_number, joining_date, salary, role, status
    } = req.body;

    console.log('=== UPDATE EMPLOYEE REQUEST ===');
    console.log('Employee ID:', id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Get employee to find user_id
    const [existingEmployees] = await pool.execute(
      `SELECT e.user_id, u.company_id FROM employees e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = ? AND u.is_deleted = 0`,
      [id]
    );

    if (existingEmployees.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const userId = existingEmployees[0].user_id;
    const currentCompanyId = existingEmployees[0].company_id;

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update user fields
      const userUpdateFields = [];
      const userUpdateValues = [];

      if (name !== undefined) {
        userUpdateFields.push('name = ?');
        userUpdateValues.push(name);
      }
      if (email !== undefined) {
        // Check if email already exists for another user
        const [emailCheck] = await connection.execute(
          `SELECT id FROM users WHERE email = ? AND id != ?`,
          [email, userId]
        );
        if (emailCheck.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'Email already exists for another user'
          });
        }
        userUpdateFields.push('email = ?');
        userUpdateValues.push(email);
      }
      if (phone !== undefined) {
        userUpdateFields.push('phone = ?');
        userUpdateValues.push(phone || null);
      }
      if (address !== undefined) {
        userUpdateFields.push('address = ?');
        userUpdateValues.push(address || null);
      }
      if (company_id !== undefined) {
        userUpdateFields.push('company_id = ?');
        userUpdateValues.push(company_id);
      }
      if (role !== undefined) {
        userUpdateFields.push('role = ?');
        userUpdateValues.push(role);
      }
      if (status !== undefined) {
        userUpdateFields.push('status = ?');
        userUpdateValues.push(status);
      }

      if (userUpdateFields.length > 0) {
        userUpdateValues.push(userId);
        await connection.execute(
          `UPDATE users SET ${userUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          userUpdateValues
        );
      }

      // Update employee fields
      const empUpdateFields = [];
      const empUpdateValues = [];

      if (department_id !== undefined) {
        empUpdateFields.push('department_id = ?');
        empUpdateValues.push(department_id || null);
      }
      if (position_id !== undefined) {
        empUpdateFields.push('position_id = ?');
        empUpdateValues.push(position_id || null);
      }
      if (employee_number !== undefined) {
        empUpdateFields.push('employee_number = ?');
        empUpdateValues.push(employee_number || null);
      }
      if (joining_date !== undefined) {
        empUpdateFields.push('joining_date = ?');
        empUpdateValues.push(joining_date || null);
      }
      if (salary !== undefined) {
        empUpdateFields.push('salary = ?');
        empUpdateValues.push(salary || null);
      }
      if (role !== undefined) {
        empUpdateFields.push('role = ?');
        empUpdateValues.push(role || null);
      }

      if (empUpdateFields.length > 0) {
        empUpdateValues.push(id);
        await connection.execute(
          `UPDATE employees SET ${empUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          empUpdateValues
        );
      }

      await connection.commit();

      // Get updated employee
      const [updatedEmployees] = await pool.execute(
        `SELECT e.*, 
                u.name, u.email, u.phone, u.address, u.role as user_role, u.status,
                u.company_id,
                c.name as company_name,
                d.name as department_name, 
                p.name as position_name
         FROM employees e
         JOIN users u ON e.user_id = u.id
         LEFT JOIN companies c ON u.company_id = c.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN positions p ON e.position_id = p.id
         WHERE e.id = ?`,
        [id]
      );

      res.json({
        success: true,
        data: updatedEmployees[0],
        message: 'Employee updated successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update employee'
    });
  }
};

/**
 * Delete employee (soft delete)
 * DELETE /api/v1/employees/:id
 */
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Get user_id from employee
    const [employees] = await pool.execute(
      `SELECT e.user_id FROM employees e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = ? AND u.is_deleted = 0`,
      [id]
    );

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const userId = employees[0].user_id;

    // Soft delete user (which will cascade to employee via foreign key)
    await pool.execute(
      `UPDATE users SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete employee'
    });
  }
};

module.exports = { getAll, getById, create, update, deleteEmployee };

