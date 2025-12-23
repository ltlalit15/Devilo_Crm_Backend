const pool = require('../config/db');

/**
 * Generate expense number
 */
const generateExpenseNumber = async (companyId) => {
  const [result] = await pool.execute(
    `SELECT COUNT(*) as count FROM expenses WHERE company_id = ?`,
    [companyId]
  );
  const nextNum = (result[0].count || 0) + 1;
  return `EXP#${String(nextNum).padStart(3, '0')}`;
};

/**
 * Calculate expense totals
 */
const calculateTotals = (items, discount, discountType) => {
  let subTotal = 0;
  
  for (const item of items) {
    subTotal += parseFloat(item.amount || 0);
  }

  let discountAmount = 0;
  if (discountType === '%') {
    discountAmount = (subTotal * parseFloat(discount || 0)) / 100;
  } else {
    discountAmount = parseFloat(discount || 0);
  }

  const total = subTotal - discountAmount;
  const taxAmount = 0; // Tax is included in item amounts

  return {
    sub_total: subTotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total: total
  };
};

const getAll = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE e.company_id = ? AND e.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND e.status = ?';
      params.push(status);
    }

    const [expenses] = await pool.execute(
      `SELECT e.* FROM expenses e
       ${whereClause}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // Get items for each expense
    for (let expense of expenses) {
      const [items] = await pool.execute(
        `SELECT * FROM expense_items WHERE expense_id = ?`,
        [expense.id]
      );
      expense.items = items;
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM expenses e ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: expenses,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expenses' });
  }
};

const create = async (req, res) => {
  try {
    const {
      lead_id, deal_id, valid_till, currency, calculate_tax, description,
      note, terms, discount, discount_type, require_approval, items = []
    } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'items array is required'
      });
    }

    // Generate expense number
    const expense_number = await generateExpenseNumber(req.companyId);

    // Calculate totals
    const totals = calculateTotals(items, discount || 0, discount_type || '%');

    // Insert expense - convert undefined to null for SQL
    const [result] = await pool.execute(
      `INSERT INTO expenses (
        company_id, expense_number, lead_id, deal_id, valid_till, currency,
        calculate_tax, description, note, terms, discount, discount_type,
        sub_total, discount_amount, tax_amount, total, require_approval,
        status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        expense_number,
        lead_id ?? null,
        deal_id ?? null,
        valid_till ?? null,
        currency || 'USD',
        calculate_tax || 'After Discount',
        description ?? null,
        note ?? null,
        terms || 'Thank you for your business.',
        discount ?? 0,
        discount_type || '%',
        totals.sub_total,
        totals.discount_amount,
        totals.tax_amount,
        totals.total,
        require_approval ?? 1,
        'Pending',
        req.userId ?? null
      ]
    );

    const expenseId = result.insertId;

    // Insert items - calculate amount if not provided
    if (items.length > 0) {
      const itemValues = items.map(item => {
        const quantity = parseFloat(item.quantity || 1);
        const unitPrice = parseFloat(item.unit_price || 0);
        
        // Extract tax rate from tax string (e.g., "GST 10%" -> 10)
        let taxRate = 0;
        if (item.tax) {
          const taxMatch = item.tax.match(/(\d+(?:\.\d+)?)/);
          if (taxMatch) {
            taxRate = parseFloat(taxMatch[1]);
          }
        }
        
        // Calculate amount: (quantity * unit_price) + tax
        let amount = quantity * unitPrice;
        if (taxRate > 0) {
          amount += (amount * taxRate / 100);
        }
        
        // Use provided amount if available, otherwise use calculated amount
        const finalAmount = item.amount !== undefined && item.amount !== null 
          ? parseFloat(item.amount) 
          : amount;
        
        return [
          expenseId,
          item.item_name,
          item.description || null,
          quantity,
          item.unit || 'Pcs',
          unitPrice,
          item.tax || null,
          taxRate,
          item.file_path || null,
          finalAmount
        ];
      });

      // Insert items one by one (mysql2 doesn't support VALUES ? syntax)
      for (const itemValue of itemValues) {
        await pool.execute(
          `INSERT INTO expense_items (
            expense_id, item_name, description, quantity, unit, unit_price,
            tax, tax_rate, file_path, amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          itemValue
        );
      }
    }

    // Get created expense with items
    const [expenses] = await pool.execute(
      `SELECT * FROM expenses WHERE id = ?`,
      [expenseId]
    );

    const [expenseItems] = await pool.execute(
      `SELECT * FROM expense_items WHERE expense_id = ?`,
      [expenseId]
    );

    const expense = expenses[0];
    expense.items = expenseItems;

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
};

/**
 * Approve expense
 * POST /api/v1/expenses/:id/approve
 */
const approve = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense exists
    const [expenses] = await pool.execute(
      `SELECT id, status FROM expenses WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (expenses.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }

    const expense = expenses[0];

    // Check if already approved
    if (expense.status === 'Approved') {
      return res.status(400).json({
        success: false,
        error: 'Expense is already approved'
      });
    }

    // Update expense status to Approved
    await pool.execute(
      `UPDATE expenses 
       SET status = 'Approved', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    // Get updated expense
    const [updatedExpenses] = await pool.execute(
      `SELECT * FROM expenses WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedExpenses[0],
      message: 'Expense approved successfully'
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve expense'
    });
  }
};

/**
 * Reject expense
 * POST /api/v1/expenses/:id/reject
 */
const reject = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Check if expense exists
    const [expenses] = await pool.execute(
      `SELECT id, status FROM expenses WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (expenses.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }

    const expense = expenses[0];

    // Check if already rejected
    if (expense.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        error: 'Expense is already rejected'
      });
    }

    // Update expense status to Rejected
    await pool.execute(
      `UPDATE expenses 
       SET status = 'Rejected', note = COALESCE(?, note), updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND company_id = ?`,
      [reason || null, id, req.companyId]
    );

    // Get updated expense
    const [updatedExpenses] = await pool.execute(
      `SELECT * FROM expenses WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedExpenses[0],
      message: 'Expense rejected successfully'
    });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject expense'
    });
  }
};

module.exports = { getAll, create, approve, reject };
