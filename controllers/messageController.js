const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const getAll = async (req, res) => {
  try {
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    const whereClause = 'WHERE company_id = ? AND is_deleted = 0';
    const params = [req.companyId];
    
    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM messages ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated messages - LIMIT and OFFSET as template literals (not placeholders)
    const [messages] = await pool.execute(
      `SELECT * FROM messages ${whereClause} ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ 
      success: true, 
      data: messages,
      pagination: getPaginationMeta(total, page, pageSize)
    });
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

