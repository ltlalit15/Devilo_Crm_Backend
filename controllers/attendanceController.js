const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const getAll = async (req, res) => {
  try {
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    const whereClause = 'WHERE a.company_id = ? AND u.is_deleted = 0';
    const params = [req.companyId];
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM attendance a
       JOIN users u ON a.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated attendance - LIMIT and OFFSET as template literals (not placeholders)
    const [attendance] = await pool.execute(
      `SELECT 
        a.id,
        a.company_id,
        a.user_id,
        a.date,
        a.check_in,
        a.check_out,
        a.status,
        a.notes,
        a.created_at,
        a.updated_at,
        u.name as employee_name,
        u.email as employee_email
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.date DESC, u.name ASC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ 
      success: true, 
      data: attendance,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get attendance error:', error);
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

