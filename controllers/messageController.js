const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const [messages] = await pool.execute(
      `SELECT * FROM messages WHERE company_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
      [req.companyId]
    );
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
};

const create = async (req, res) => {
  try {
    const { to_user_id, subject, message } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO messages (company_id, from_user_id, to_user_id, subject, message)
       VALUES (?, ?, ?, ?, ?)`,
      [req.companyId, req.userId, to_user_id, subject, message]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

module.exports = { getAll, create };

