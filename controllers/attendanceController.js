const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const [attendance] = await pool.execute(
      `SELECT * FROM attendance WHERE company_id = ? ORDER BY date DESC`,
      [req.companyId]
    );
    res.json({ success: true, data: attendance });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch attendance' });
  }
};

const checkIn = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await pool.execute(
      `INSERT INTO attendance (company_id, user_id, date, check_in, status)
       VALUES (?, ?, ?, NOW(), 'Present')
       ON DUPLICATE KEY UPDATE check_in = NOW(), status = 'Present'`,
      [req.companyId, req.userId, today]
    );
    res.json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check in' });
  }
};

const checkOut = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await pool.execute(
      `UPDATE attendance SET check_out = NOW() WHERE company_id = ? AND user_id = ? AND date = ?`,
      [req.companyId, req.userId, today]
    );
    res.json({ success: true, message: 'Checked out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check out' });
  }
};

module.exports = { getAll, checkIn, checkOut };

