// =====================================================
// Payment Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all payments
 * GET /api/v1/payments
 */
const getAll = async (req, res) => {
  try {
    const { client_id, invoice_id } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    let whereClause = 'WHERE p.company_id = ? AND p.is_deleted = 0';
    const params = [req.companyId];

    if (client_id) {
      whereClause += ` AND p.invoice_id IN (
        SELECT id FROM invoices WHERE client_id = ?
      )`;
      params.push(client_id);
    }
    if (invoice_id) {
      whereClause += ' AND p.invoice_id = ?';
      params.push(invoice_id);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM payments p ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated payments - LIMIT and OFFSET as template literals (not placeholders)
    const [payments] = await pool.execute(
      `SELECT p.*, i.invoice_number, c.company_name as client_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN clients c ON i.client_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: payments,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments'
    });
  }
};

/**
 * Get payment by ID
 * GET /api/v1/payments/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [payments] = await pool.execute(
      `SELECT p.*, i.invoice_number, c.company_name as client_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE p.id = ? AND p.company_id = ? AND p.is_deleted = 0`,
      [id, req.companyId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: payments[0]
    });
  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment'
    });
  }
};

/**
 * Create single payment
 * POST /api/v1/payments
 */
const create = async (req, res) => {
  try {
    const {
      project_id, invoice_id, paid_on, amount, currency, exchange_rate,
      transaction_id, payment_gateway, offline_payment_method, bank_account,
      receipt_path, remark, order_number
    } = req.body;

    // Validation
    if (!invoice_id || !paid_on || !amount) {
      return res.status(400).json({
        success: false,
        error: 'invoice_id, paid_on, and amount are required'
      });
    }

    // Insert payment - convert undefined to null for SQL
    const [result] = await pool.execute(
      `INSERT INTO payments (
        company_id, project_id, invoice_id, paid_on, amount, currency,
        exchange_rate, transaction_id, payment_gateway, offline_payment_method,
        bank_account, receipt_path, remark, order_number, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        project_id ?? null,
        invoice_id,
        paid_on,
        amount,
        currency || 'USD',
        exchange_rate ?? 1.0,
        transaction_id ?? null,
        payment_gateway ?? null,
        offline_payment_method ?? null,
        bank_account ?? null,
        receipt_path ?? null,
        remark ?? null,
        order_number ?? null,
        'Complete',
        req.userId ?? null
      ]
    );

    // Update invoice paid/unpaid amounts
    await pool.execute(
      `UPDATE invoices SET
        paid = paid + ?,
        unpaid = unpaid - ?,
        status = CASE
          WHEN unpaid - ? <= 0 THEN 'Paid'
          WHEN paid + ? > 0 AND unpaid - ? > 0 THEN 'Partially Paid'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [amount, amount, amount, amount, amount, invoice_id]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: 'Payment recorded successfully'
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
};

/**
 * Create bulk payments
 * POST /api/v1/payments/bulk
 */
const createBulk = async (req, res) => {
  try {
    const { payments } = req.body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'payments array is required'
      });
    }

    const createdPayments = [];

    for (const payment of payments) {
      const {
        invoice_id, payment_date, payment_method, offline_payment_method,
        bank_account, transaction_id, amount_received
      } = payment;

      if (!invoice_id || !payment_date || !amount_received) {
        continue; // Skip invalid payments
      }

      // Insert payment - convert undefined to null for SQL
      const [result] = await pool.execute(
        `INSERT INTO payments (
          company_id, invoice_id, paid_on, amount, currency, exchange_rate,
          transaction_id, payment_gateway, offline_payment_method, bank_account,
          status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.companyId ?? null,
          invoice_id,
          payment_date,
          amount_received,
          'USD',
          1.0,
          transaction_id ?? null,
          payment_method ?? null,
          offline_payment_method ?? null,
          bank_account ?? null,
          'Complete',
          req.userId ?? null
        ]
      );

      // Update invoice
      await pool.execute(
        `UPDATE invoices SET
          paid = paid + ?,
          unpaid = unpaid - ?,
          status = CASE
            WHEN unpaid - ? <= 0 THEN 'Paid'
            WHEN paid + ? > 0 AND unpaid - ? > 0 THEN 'Partially Paid'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [amount_received, amount_received, amount_received, amount_received, amount_received, invoice_id]
      );

      createdPayments.push({ id: result.insertId, invoice_id });
    }

    res.status(201).json({
      success: true,
      data: createdPayments,
      message: `${createdPayments.length} payments recorded successfully`
    });
  } catch (error) {
    console.error('Create bulk payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record bulk payments'
    });
  }
};

/**
 * Update payment
 * PUT /api/v1/payments/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Get payment to get invoice_id
    const [payments] = await pool.execute(
      `SELECT invoice_id, amount FROM payments WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    const oldPayment = payments[0];

    // Build update query
    const allowedFields = [
      'paid_on', 'amount', 'currency', 'exchange_rate', 'transaction_id',
      'payment_gateway', 'offline_payment_method', 'bank_account',
      'receipt_path', 'remark', 'status'
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert undefined to null for SQL
        values.push(updateFields[field] === undefined ? null : updateFields[field]);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, req.companyId);

      await pool.execute(
        `UPDATE payments SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
        values
      );

      // If amount changed, update invoice
      if (updateFields.amount && updateFields.amount !== oldPayment.amount) {
        const amountDiff = updateFields.amount - oldPayment.amount;
        await pool.execute(
          `UPDATE invoices SET
            paid = paid + ?,
            unpaid = unpaid - ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [amountDiff, amountDiff, oldPayment.invoice_id]
        );
      }
    }

    res.json({
      success: true,
      message: 'Payment updated successfully'
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment'
    });
  }
};

/**
 * Delete payment
 * DELETE /api/v1/payments/:id
 */
const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    // Get payment
    const [payments] = await pool.execute(
      `SELECT invoice_id, amount FROM payments WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    const payment = payments[0];

    // Delete payment
    await pool.execute(
      `UPDATE payments SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    // Update invoice
    await pool.execute(
      `UPDATE invoices SET
        paid = paid - ?,
        unpaid = unpaid + ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [payment.amount, payment.amount, payment.invoice_id]
    );

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete payment'
    });
  }
};

module.exports = {
  getAll,
  getById,
  getAll,
  create,
  createBulk,
  update,
  delete: deletePayment
};

