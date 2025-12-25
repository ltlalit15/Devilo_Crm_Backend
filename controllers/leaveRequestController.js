// =====================================================
// Leave Request Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all leave requests
 * GET /api/v1/leave-requests
 */
const getAll = async (req, res) => {
  try {
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    const filterCompanyId = req.query.company_id || req.companyId;
    const employee_id = req.query.employee_id || req.userId;
    const status = req.query.status;
    const leave_type = req.query.leave_type;

    let whereClause = 'WHERE lr.is_deleted = 0';
    const params = [];

    if (filterCompanyId) {
      whereClause += ' AND lr.company_id = ?';
      params.push(filterCompanyId);
    }

    // Employee can only see their own requests, Admin can see all
    if (req.user && req.user.role === 'EMPLOYEE') {
      whereClause += ' AND lr.employee_id = ?';
      params.push(employee_id);
    } else if (employee_id) {
      whereClause += ' AND lr.employee_id = ?';
      params.push(employee_id);
    }

    if (status) {
      whereClause += ' AND lr.status = ?';
      params.push(status);
    }

    if (leave_type) {
      whereClause += ' AND lr.leave_type = ?';
      params.push(leave_type);
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM leave_requests lr ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated leave requests
    const [requests] = await pool.execute(
      `SELECT lr.*, 
              e.user_id,
              u.name as employee_name,
              u.email as employee_email,
              d.name as department_name
       FROM leave_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereClause}
       ORDER BY lr.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: requests,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leave requests'
    });
  }
};

/**
 * Get leave request by ID
 * GET /api/v1/leave-requests/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const filterCompanyId = req.query.company_id || req.companyId;

    let whereClause = 'WHERE lr.id = ? AND lr.is_deleted = 0';
    const params = [id];

    if (filterCompanyId) {
      whereClause += ' AND lr.company_id = ?';
      params.push(filterCompanyId);
    }

    // Employee can only see their own requests
    if (req.user && req.user.role === 'EMPLOYEE') {
      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE user_id = ?',
        [req.userId]
      );
      if (employee.length > 0) {
        whereClause += ' AND lr.employee_id = ?';
        params.push(employee[0].id);
      }
    }

    const [requests] = await pool.execute(
      `SELECT lr.*, 
              e.user_id,
              u.name as employee_name,
              u.email as employee_email,
              d.name as department_name
       FROM leave_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereClause}`,
      params
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Leave request not found'
      });
    }

    res.json({
      success: true,
      data: requests[0]
    });
  } catch (error) {
    console.error('Get leave request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leave request'
    });
  }
};

/**
 * Create leave request
 * POST /api/v1/leave-requests
 */
const create = async (req, res) => {
  try {
    const {
      employee_id,
      leave_type,
      start_date,
      end_date,
      days,
      reason,
      status = 'Pending'
    } = req.body;

    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Leave type, start date, and end date are required'
      });
    }

    const companyId = req.body.company_id || req.companyId;
    
    // Get employee_id from user if not provided (for employee role)
    let finalEmployeeId = employee_id;
    if (!finalEmployeeId && req.user && req.user.role === 'EMPLOYEE') {
      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE user_id = ?',
        [req.userId]
      );
      if (employee.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Employee profile not found'
        });
      }
      finalEmployeeId = employee[0].id;
    }

    if (!finalEmployeeId) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID is required'
      });
    }

    // Calculate days if not provided
    let calculatedDays = days;
    if (!calculatedDays) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      const diffTime = Math.abs(end - start);
      calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const [result] = await pool.execute(
      `INSERT INTO leave_requests (
        company_id, employee_id, leave_type, start_date, end_date,
        days, reason, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        companyId || null,
        finalEmployeeId,
        leave_type,
        start_date,
        end_date,
        calculatedDays,
        reason || null,
        status
      ]
    );

    const [newRequest] = await pool.execute(
      'SELECT * FROM leave_requests WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: newRequest[0],
      message: 'Leave request created successfully'
    });
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create leave request'
    });
  }
};

/**
 * Update leave request
 * PUT /api/v1/leave-requests/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      leave_type,
      start_date,
      end_date,
      days,
      reason,
      status
    } = req.body;

    const filterCompanyId = req.body.company_id || req.companyId;

    // Check if request exists
    let whereClause = 'WHERE id = ? AND is_deleted = 0';
    const checkParams = [id];

    if (filterCompanyId) {
      whereClause += ' AND company_id = ?';
      checkParams.push(filterCompanyId);
    }

    // Employee can only update their own pending requests
    if (req.user && req.user.role === 'EMPLOYEE') {
      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE user_id = ?',
        [req.userId]
      );
      if (employee.length > 0) {
        whereClause += ' AND employee_id = ? AND status = ?';
        checkParams.push(employee[0].id, 'Pending');
      }
    }

    const [existing] = await pool.execute(
      `SELECT * FROM leave_requests ${whereClause}`,
      checkParams
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Leave request not found or you do not have permission to update it'
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (leave_type !== undefined) {
      updates.push('leave_type = ?');
      params.push(leave_type);
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(start_date);
    }
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(end_date);
    }
    if (days !== undefined) {
      updates.push('days = ?');
      params.push(days);
    }
    if (reason !== undefined) {
      updates.push('reason = ?');
      params.push(reason);
    }
    // Only Admin can change status
    if (status !== undefined && req.user && req.user.role !== 'EMPLOYEE') {
      updates.push('status = ?');
      params.push(status);
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
      `UPDATE leave_requests SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [updatedRequest] = await pool.execute(
      'SELECT * FROM leave_requests WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: updatedRequest[0],
      message: 'Leave request updated successfully'
    });
  } catch (error) {
    console.error('Update leave request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update leave request'
    });
  }
};

/**
 * Delete leave request (soft delete)
 * DELETE /api/v1/leave-requests/:id
 */
const deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const filterCompanyId = req.query.company_id || req.companyId;

    let whereClause = 'WHERE id = ? AND is_deleted = 0';
    const params = [id];

    if (filterCompanyId) {
      whereClause += ' AND company_id = ?';
      params.push(filterCompanyId);
    }

    // Employee can only delete their own pending requests
    if (req.user && req.user.role === 'EMPLOYEE') {
      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE user_id = ?',
        [req.userId]
      );
      if (employee.length > 0) {
        whereClause += ' AND employee_id = ? AND status = ?';
        params.push(employee[0].id, 'Pending');
      }
    }

    const [existing] = await pool.execute(
      `SELECT id FROM leave_requests ${whereClause}`,
      params
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Leave request not found or you do not have permission to delete it'
      });
    }

    await pool.execute(
      'UPDATE leave_requests SET is_deleted = 1, updated_at = NOW() WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Leave request deleted successfully'
    });
  } catch (error) {
    console.error('Delete leave request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete leave request'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteRequest
};

