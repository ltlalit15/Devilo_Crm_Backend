const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    if (!req.companyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company ID is required' 
      });
    }

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
      WHERE tl.company_id = ? AND tl.is_deleted = 0 AND u.is_deleted = 0
      ORDER BY tl.date DESC, u.name ASC`,
      [req.companyId]
    );
    res.json({ success: true, data: timeLogs });
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

module.exports = { getAll, create };

