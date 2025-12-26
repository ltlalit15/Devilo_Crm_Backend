// =====================================================
// Message Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get all messages/conversations
 * GET /api/v1/messages
 */
const getAll = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || null;
    const companyId = req.query.company_id || req.body.company_id || 1;
    const conversationWith = req.query.conversation_with; // User ID to get conversation with

    if (conversationWith) {
      // Get conversation between two users
      const [messages] = await pool.execute(
        `SELECT m.*, 
                from_user.name as from_user_name,
                from_user.email as from_user_email,
                to_user.name as to_user_name,
                to_user.email as to_user_email
         FROM messages m
         LEFT JOIN users from_user ON m.from_user_id = from_user.id
         LEFT JOIN users to_user ON m.to_user_id = to_user.id
         WHERE m.company_id = ? 
           AND m.is_deleted = 0
           AND ((m.from_user_id = ? AND m.to_user_id = ?) 
                OR (m.from_user_id = ? AND m.to_user_id = ?))
         ORDER BY m.created_at ASC`,
        [companyId, userId, conversationWith, conversationWith, userId]
      );

      return res.json({
        success: true,
        data: messages
      });
    }

    // Get all conversations (grouped by other user)
    const [conversations] = await pool.execute(
      `SELECT 
         CASE 
           WHEN m.from_user_id = ? THEN m.to_user_id
           ELSE m.from_user_id
         END as other_user_id,
         CASE 
           WHEN m.from_user_id = ? THEN u_to.name
           ELSE u_from.name
         END as other_user_name,
         CASE 
           WHEN m.from_user_id = ? THEN u_to.email
           ELSE u_from.email
         END as other_user_email,
         m.message as last_message,
         m.created_at as last_message_time,
         SUM(CASE WHEN m.to_user_id = ? AND m.is_read = 0 THEN 1 ELSE 0 END) as unread_count
       FROM messages m
       LEFT JOIN users u_from ON m.from_user_id = u_from.id
       LEFT JOIN users u_to ON m.to_user_id = u_to.id
       WHERE m.company_id = ? 
         AND m.is_deleted = 0
         AND (m.from_user_id = ? OR m.to_user_id = ?)
       GROUP BY other_user_id, other_user_name, other_user_email, last_message, last_message_time
       ORDER BY last_message_time DESC`,
      [userId, userId, userId, userId, companyId, userId, userId]
    );

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
};

/**
 * Get message by ID
 * GET /api/v1/messages/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const companyId = req.companyId;

    const [messages] = await pool.execute(
      `SELECT m.*, 
              from_user.name as from_user_name,
              from_user.email as from_user_email,
              to_user.name as to_user_name,
              to_user.email as to_user_email
       FROM messages m
       LEFT JOIN users from_user ON m.from_user_id = from_user.id
       LEFT JOIN users to_user ON m.to_user_id = to_user.id
       WHERE m.id = ? AND m.company_id = ? AND m.is_deleted = 0
         AND (m.from_user_id = ? OR m.to_user_id = ?)`,
      [id, companyId, userId, userId]
    );

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Mark as read if current user is recipient
    if (messages[0].to_user_id === userId && messages[0].is_read === 0) {
      await pool.execute(
        `UPDATE messages SET is_read = 1, read_at = NOW() WHERE id = ?`,
        [id]
      );
    }

    res.json({
      success: true,
      data: messages[0]
    });
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message'
    });
  }
};

/**
 * Create/Send message
 * POST /api/v1/messages
 */
const create = async (req, res) => {
  try {
    const { to_user_id, subject, message, file_path } = req.body;
    const userId = req.userId;
    const companyId = req.companyId;

    if (!to_user_id || !message) {
      return res.status(400).json({
        success: false,
        error: 'to_user_id and message are required'
      });
    }

    // Verify recipient exists and belongs to same company
    const [recipients] = await pool.execute(
      `SELECT id FROM users WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [to_user_id, companyId]
    );

    if (recipients.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Recipient not found'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO messages (company_id, from_user_id, to_user_id, subject, message, file_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, userId, to_user_id, subject || 'No Subject', message, file_path || null]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message'
    });
  }
};

/**
 * Update message (mark as read, etc.)
 * PUT /api/v1/messages/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_read } = req.body;
    const userId = req.userId;
    const companyId = req.companyId;

    const updates = [];
    const values = [];

    if (is_read !== undefined) {
      updates.push('is_read = ?');
      values.push(is_read ? 1 : 0);
      if (is_read) {
        updates.push('read_at = NOW()');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, companyId, userId);

    const [result] = await pool.execute(
      `UPDATE messages SET ${updates.join(', ')} 
       WHERE id = ? AND company_id = ? AND to_user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Message updated successfully'
    });
  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update message'
    });
  }
};

/**
 * Delete message (soft delete)
 * DELETE /api/v1/messages/:id
 */
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const companyId = req.companyId;

    const [result] = await pool.execute(
      `UPDATE messages SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ? AND (from_user_id = ? OR to_user_id = ?)`,
      [id, companyId, userId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  deleteMessage
};
