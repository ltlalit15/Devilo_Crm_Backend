const pool = require('../config/db');

/**
 * Ensure orders table exists
 */
const ensureTableExists = async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        client_id INT,
        invoice_id INT,
        title VARCHAR(255),
        description TEXT,
        amount DECIMAL(15,2) DEFAULT 0.00,
        status ENUM('New', 'Pending', 'Processing', 'Completed', 'Cancelled', 'Shipped', 'Delivered') DEFAULT 'New',
        order_date DATE DEFAULT (CURRENT_DATE),
        is_deleted TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      )
    `);
  } catch (error) {
    // Table might already exist or foreign key issues - that's ok
    console.log('Orders table check:', error.code === 'ER_TABLE_EXISTS_ERROR' ? 'exists' : error.message);
  }
};

/**
 * Get all orders
 * GET /api/v1/orders
 */
const getAll = async (req, res) => {
  try {
    await ensureTableExists();
    
    const { status, client_id } = req.query;
    const companyId = req.query.company_id || req.body.company_id || 1;
    
    let whereClause = 'WHERE o.company_id = ? AND o.is_deleted = 0';
    const params = [companyId];

    // Filter by client_id for client-side access
    if (client_id) {
      // First find the client record by user_id
      const [clients] = await pool.execute(
        'SELECT id FROM clients WHERE (owner_id = ? OR id = ?) AND company_id = ? AND is_deleted = 0 LIMIT 1',
        [client_id, client_id, companyId]
      );
      
      if (clients.length > 0) {
        whereClause += ' AND o.client_id = ?';
        params.push(clients[0].id);
      } else {
        // Return empty if no client found
        return res.json({ success: true, data: [] });
      }
    }

    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    const [orders] = await pool.execute(
      `SELECT o.*, 
              c.company_name as client_name,
              i.invoice_number
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       LEFT JOIN invoices i ON o.invoice_id = i.id
       ${whereClause}
       ORDER BY o.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
};

/**
 * Get order by ID
 * GET /api/v1/orders/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.query.company_id || req.body.company_id || 1;

    const [orders] = await pool.execute(
      `SELECT o.*, 
              c.company_name as client_name,
              i.invoice_number
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       LEFT JOIN invoices i ON o.invoice_id = i.id
       WHERE o.id = ? AND o.company_id = ? AND o.is_deleted = 0`,
      [id, companyId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: orders[0]
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
};

/**
 * Create order
 * POST /api/v1/orders
 */
const create = async (req, res) => {
  try {
    await ensureTableExists();
    
    const { title, description, amount, invoice_id, status, client_id } = req.body;
    const companyId = req.body.company_id || req.query.company_id || 1;

    // Validation
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    // Find client_id if user_id is provided
    let actualClientId = client_id;
    if (client_id) {
      const [clients] = await pool.execute(
        'SELECT id FROM clients WHERE (owner_id = ? OR id = ?) AND company_id = ? AND is_deleted = 0 LIMIT 1',
        [client_id, client_id, companyId]
      );
      if (clients.length > 0) {
        actualClientId = clients[0].id;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO orders (
        company_id, client_id, invoice_id, title, description, amount, status, order_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
      [
        companyId,
        actualClientId || null,
        invoice_id || null,
        title,
        description || null,
        amount || 0,
        status || 'New'
      ]
    );

    const [orders] = await pool.execute(
      `SELECT o.*, c.company_name as client_name
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: orders[0],
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create order',
      details: error.message
    });
  }
};

/**
 * Update order
 * PUT /api/v1/orders/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.query.company_id || req.body.company_id || 1;
    const updateFields = req.body;

    const [orders] = await pool.execute(
      'SELECT id FROM orders WHERE id = ? AND company_id = ? AND is_deleted = 0',
      [id, companyId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const allowedFields = ['title', 'description', 'amount', 'invoice_id', 'status'];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        values.push(updateFields[field] ?? null);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    values.push(id, companyId);

    await pool.execute(
      `UPDATE orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`,
      values
    );

    const [updatedOrders] = await pool.execute(
      `SELECT o.*, c.company_name as client_name
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedOrders[0],
      message: 'Order updated successfully'
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
};

/**
 * Update order status
 * PATCH /api/v1/orders/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const companyId = req.query.company_id || req.body.company_id || 1;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const validStatuses = ['New', 'Pending', 'Processing', 'Completed', 'Cancelled', 'Shipped', 'Delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    await pool.execute(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
      [status, id, companyId]
    );

    const [orders] = await pool.execute(
      `SELECT o.*, c.company_name as client_name
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: orders[0],
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
};

/**
 * Delete order (soft delete)
 * DELETE /api/v1/orders/:id
 */
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.query.company_id || req.body.company_id || 1;

    const [orders] = await pool.execute(
      'SELECT id FROM orders WHERE id = ? AND company_id = ? AND is_deleted = 0',
      [id, companyId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    await pool.execute(
      'UPDATE orders SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
      [id, companyId]
    );

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
};

module.exports = { 
  getAll, 
  getById, 
  create, 
  update, 
  updateStatus, 
  delete: deleteOrder 
};

