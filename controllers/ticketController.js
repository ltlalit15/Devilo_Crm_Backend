const pool = require('../config/db');

const generateTicketId = async (companyId) => {
  const [result] = await pool.execute(`SELECT COUNT(*) as count FROM tickets WHERE company_id = ?`, [companyId]);
  const nextNum = (result[0].count || 0) + 1;
  return `TKT-${String(nextNum).padStart(3, '0')}`;
};

const getAll = async (req, res) => {
  try {
    // No pagination - return all tickets
    const companyId = req.query.company_id || req.body.company_id || 1;
    
    let whereClause = 'WHERE is_deleted = 0';
    const params = [];

    // Add company_id filter only if provided
    if (companyId) {
      whereClause += ' AND company_id = ?';
      params.push(companyId);
    }

    // Get all tickets without pagination
    const [tickets] = await pool.execute(
      `SELECT * FROM tickets ${whereClause} ORDER BY created_at DESC`,
      params
    );
    res.json({ 
      success: true, 
      data: tickets
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
};

const create = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.body.company_id || 1;
    const userId = req.query.user_id || req.body.user_id || null;
    const ticket_id = await generateTicketId(companyId);
    const { subject, client_id, priority, description, status, assigned_to_id } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO tickets (company_id, ticket_id, subject, client_id, priority, description, status, assigned_to_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        ticket_id,
        subject,
        client_id ?? null,
        priority || 'Medium',
        description ?? null,
        status || 'Open',
        assigned_to_id ?? null,
        userId
      ]
    );
    
    // Get created ticket
    const [tickets] = await pool.execute(
      `SELECT * FROM tickets WHERE id = ?`,
      [result.insertId]
    );
    
    res.status(201).json({ 
      success: true, 
      data: tickets[0],
      message: 'Ticket created successfully'
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ success: false, error: 'Failed to create ticket' });
  }
};

/**
 * Add comment to ticket
 * POST /api/v1/tickets/:id/comments
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, file_path } = req.body;
    const companyId = req.query.company_id || req.body.company_id || 1;
    const userId = req.query.user_id || req.body.user_id || null;

    // Check if ticket exists
    const [tickets] = await pool.execute(
      `SELECT id FROM tickets WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }

    // Insert comment
    const [result] = await pool.execute(
      `INSERT INTO ticket_comments (ticket_id, comment, file_path, created_by)
       VALUES (?, ?, ?, ?)`,
      [id, comment, file_path ?? null, userId]
    );

    // Get created comment
    const [comments] = await pool.execute(
      `SELECT * FROM ticket_comments WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: comments[0],
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Add ticket comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
};

module.exports = { getAll, create, addComment };

