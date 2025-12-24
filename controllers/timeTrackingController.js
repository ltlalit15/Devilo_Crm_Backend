const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const getAll = async (req, res) => {
  try {
    if (!req.companyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company ID is required' 
      });
    }
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    const whereClause = 'WHERE tl.company_id = ? AND tl.is_deleted = 0 AND u.is_deleted = 0';
    const params = [req.companyId];
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM time_logs tl
       JOIN users u ON tl.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated time logs - LIMIT and OFFSET as template literals (not placeholders)
    const [timeLogs] = await pool.execute(
      `SELECT 
        tl.id,
        tl.company_id,
        tl.user_id,
        tl.project_id,
        tl.task_id,
        tl.hours,
        tl.date,
        tl.description,
        tl.created_at,
        tl.updated_at,
        u.name as employee_name,
        u.email as employee_email,
        p.project_name as project_name,
        t.title as task_title
      FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      LEFT JOIN projects p ON tl.project_id = p.id
      LEFT JOIN tasks t ON tl.task_id = t.id
      ${whereClause}
      ORDER BY tl.date DESC, u.name ASC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ 
      success: true, 
      data: timeLogs,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get time logs error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      companyId: req.companyId
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch time logs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const create = async (req, res) => {
  try {
    const { user_id, project_id, task_id, hours, date, description } = req.body;
    
    // For admin, use provided user_id; for employees, use their own userId
    const userId = user_id || req.userId;
    
    if (!userId || !project_id || !hours || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, project_id, hours, date'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO time_logs (company_id, user_id, project_id, task_id, hours, date, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.companyId, userId, project_id, task_id || null, hours, date, description || null]
    );
    
    res.status(201).json({ 
      success: true, 
      data: { id: result.insertId },
      message: 'Time log created successfully'
    });
  } catch (error) {
    console.error('Create time log error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create time log' 
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { project_id, task_id, hours, date, description } = req.body;
    
    // Check if time log exists and belongs to user or company
    const [existing] = await pool.execute(
      `SELECT id, user_id FROM time_logs WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Time log not found'
      });
    }

    // For employees, only allow updating their own logs
    if (req.user.role === 'EMPLOYEE' && existing[0].user_id !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own time logs'
      });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (project_id !== undefined) {
      updates.push('project_id = ?');
      values.push(project_id);
    }
    if (task_id !== undefined) {
      updates.push('task_id = ?');
      values.push(task_id || null);
    }
    if (hours !== undefined) {
      updates.push('hours = ?');
      values.push(hours);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await pool.execute(
      `UPDATE time_logs SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Get updated time log
    const [timeLogs] = await pool.execute(
      `SELECT 
        tl.id,
        tl.company_id,
        tl.user_id,
        tl.project_id,
        tl.task_id,
        tl.hours,
        tl.date,
        tl.description,
        tl.created_at,
        tl.updated_at,
        u.name as employee_name,
        u.email as employee_email,
        p.project_name as project_name,
        t.title as task_title
       FROM time_logs tl
       JOIN users u ON tl.user_id = u.id
       LEFT JOIN projects p ON tl.project_id = p.id
       LEFT JOIN tasks t ON tl.task_id = t.id
       WHERE tl.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: timeLogs[0],
      message: 'Time log updated successfully'
    });
  } catch (error) {
    console.error('Update time log error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update time log'
    });
  }
};

const deleteTimeLog = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if time log exists
    const [existing] = await pool.execute(
      `SELECT id, user_id FROM time_logs WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Time log not found'
      });
    }

    // For employees, only allow deleting their own logs
    if (req.user.role === 'EMPLOYEE' && existing[0].user_id !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own time logs'
      });
    }

    await pool.execute(
      `UPDATE time_logs SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Time log deleted successfully'
    });
  } catch (error) {
    console.error('Delete time log error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete time log'
    });
  }
};

module.exports = { getAll, create, update, delete: deleteTimeLog };

