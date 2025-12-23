const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE s.company_id = ? AND s.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    const [subscriptions] = await pool.execute(
      `SELECT s.*, c.company_name as client_name
       FROM subscriptions s
       LEFT JOIN clients c ON s.client_id = c.id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM subscriptions s ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: subscriptions,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
  }
};

const create = async (req, res) => {
  try {
    const { client_id, plan, amount, billing_cycle, next_billing_date } = req.body;

    // Validation
    if (!client_id || !plan || !amount || !billing_cycle) {
      return res.status(400).json({
        success: false,
        error: 'client_id, plan, amount, and billing_cycle are required'
      });
    }

    // Calculate next_billing_date if not provided
    let nextBillingDate = next_billing_date;
    if (!nextBillingDate) {
      const today = new Date();
      if (billing_cycle === 'Monthly') {
        today.setMonth(today.getMonth() + 1);
      } else if (billing_cycle === 'Quarterly') {
        today.setMonth(today.getMonth() + 3);
      } else if (billing_cycle === 'Yearly') {
        today.setFullYear(today.getFullYear() + 1);
      } else {
        // Default to monthly
        today.setMonth(today.getMonth() + 1);
      }
      nextBillingDate = today.toISOString().split('T')[0];
    }

    // Insert subscription - convert undefined to null for SQL
    const [result] = await pool.execute(
      `INSERT INTO subscriptions (
        company_id, client_id, plan, amount, billing_cycle, status, next_billing_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        client_id,
        plan,
        amount,
        billing_cycle || 'Monthly',
        'Active',
        nextBillingDate
      ]
    );

    // Get created subscription
    const [subscriptions] = await pool.execute(
      `SELECT * FROM subscriptions WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ 
      success: true, 
      data: subscriptions[0],
      message: 'Subscription created successfully'
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create subscription'
    });
  }
};

/**
 * Update subscription
 * PUT /api/v1/subscriptions/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if subscription exists
    const [subscriptions] = await pool.execute(
      `SELECT id FROM subscriptions WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    // Build update query
    const allowedFields = ['plan', 'amount', 'billing_cycle', 'status', 'next_billing_date'];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert undefined to null for SQL
        values.push(updateFields[field] === undefined ? null : updateFields[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, req.companyId);

    await pool.execute(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
      values
    );

    // Get updated subscription
    const [updatedSubscriptions] = await pool.execute(
      `SELECT * FROM subscriptions WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedSubscriptions[0],
      message: 'Subscription updated successfully'
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subscription'
    });
  }
};

/**
 * Cancel subscription
 * PUT /api/v1/subscriptions/:id/cancel
 */
const cancel = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if subscription exists
    const [subscriptions] = await pool.execute(
      `SELECT id, status FROM subscriptions WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    const subscription = subscriptions[0];

    // Check if already cancelled
    if (subscription.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Subscription is already cancelled'
      });
    }

    // Update subscription status to Cancelled
    await pool.execute(
      `UPDATE subscriptions 
       SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    // Get updated subscription
    const [updatedSubscriptions] = await pool.execute(
      `SELECT * FROM subscriptions WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedSubscriptions[0],
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    });
  }
};

module.exports = { getAll, create, update, cancel };

