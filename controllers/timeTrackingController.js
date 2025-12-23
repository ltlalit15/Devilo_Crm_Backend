const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const [timeLogs] = await pool.execute(
      `SELECT * FROM time_logs WHERE company_id = ? AND is_deleted = 0 ORDER BY date DESC`,
      [req.companyId]
    );
    res.json({ success: true, data: timeLogs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch time logs' });
  }
};

const create = async (req, res) => {
  try {
    const { project_id, task_id, hours, date, description } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO time_logs (company_id, user_id, project_id, task_id, hours, date, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.companyId, req.userId, project_id, task_id, hours, date, description]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create time log' });
  }
};

module.exports = { getAll, create };

