/**
 * Dashboard Controller
 * Get dashboard statistics and summary data
 */

const pool = require('../config/db');

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 * Returns statistics based on user role
 */
const getDashboardStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    let stats = {};

    if (userRole === 'admin') {
      // Admin Dashboard Stats
      const [
        totalJobsToday,
        jobsUnderRepair,
        jobsPendingPayment,
        completedJobs,
        lowStockItems,
        todaySales,
        pendingPayments,
        totalCustomers,
        totalInvoices,
        recentJobCards
      ] = await Promise.all([
        // Total Jobs Today
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE DATE(created_at) = ?`,
          [today]
        ),
        // Jobs Under Repair
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE status IN ('Under Repair', 'Testing')`
        ),
        // Jobs Pending Payment
        pool.execute(
          `SELECT COUNT(*) as count FROM invoices WHERE status IN ('Unpaid', 'Partially Paid')`
        ),
        // Completed Jobs
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE status = 'Completed'`
        ),
        // Low Stock Items
        pool.execute(
          `SELECT COUNT(*) as count FROM inventory_items WHERE available_stock <= min_stock_level`
        ),
        // Today's Sales
        pool.execute(
          `SELECT COALESCE(SUM(grand_total), 0) as total FROM invoices WHERE DATE(created_at) = ?`,
          [today]
        ),
        // Pending Payments
        pool.execute(
          `SELECT COALESCE(SUM(grand_total - COALESCE((SELECT SUM(amount_paid) FROM payments WHERE invoice_id = invoices.id), 0)), 0) as total 
           FROM invoices WHERE status IN ('Unpaid', 'Partially Paid')`
        ),
        // Total Customers
        pool.execute(`SELECT COUNT(*) as count FROM customers`),
        // Total Invoices
        pool.execute(`SELECT COUNT(*) as count FROM invoices`),
        // Recent Job Cards (last 5)
        pool.execute(
          `SELECT jc.id, jc.job_no, c.name AS customer_name, jc.status, jc.created_at
           FROM job_cards jc
           LEFT JOIN customers c ON jc.customer_id = c.id
           ORDER BY jc.created_at DESC LIMIT 5`
        )
      ]);

      stats = {
        totalJobsToday: totalJobsToday[0][0]?.count || 0,
        jobsUnderRepair: jobsUnderRepair[0][0]?.count || 0,
        jobsPendingPayment: jobsPendingPayment[0][0]?.count || 0,
        completedJobs: completedJobs[0][0]?.count || 0,
        lowStockAlerts: lowStockItems[0][0]?.count || 0,
        todaySales: parseFloat(todaySales[0][0]?.total || 0),
        pendingPayments: parseFloat(pendingPayments[0][0]?.total || 0),
        totalCustomers: totalCustomers[0][0]?.count || 0,
        totalInvoices: totalInvoices[0][0]?.count || 0,
        recentJobCards: recentJobCards[0].map(jc => ({
          id: jc.id,
          jobNumber: jc.job_no,
          customerName: jc.customer_name,
          status: jc.status,
          createdAt: jc.created_at ? jc.created_at.toISOString().split('T')[0] : null
        }))
      };

    } else if (userRole === 'technician') {
      // Technician Dashboard Stats
      const [
        assignedJobs,
        completedJobs,
        pendingJobs,
        pendingTests,
        recentJobs
      ] = await Promise.all([
        // Assigned Jobs
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE technician_id = ?`,
          [userId]
        ),
        // Completed Jobs
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE technician_id = ? AND status = 'Completed'`,
          [userId]
        ),
        // Pending Jobs (not completed)
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards WHERE technician_id = ? AND status != 'Completed' AND status != 'Delivered'`,
          [userId]
        ),
        // Pending Tests
        pool.execute(
          `SELECT COUNT(*) as count FROM job_cards jc
           LEFT JOIN testing_records tr ON jc.id = tr.job_card_id
           WHERE jc.technician_id = ? AND jc.status = 'Testing' AND tr.id IS NULL`,
          [userId]
        ),
        // Recent Assigned Jobs
        pool.execute(
          `SELECT jc.id, jc.job_no, c.name AS customer_name, jc.status, jc.expected_delivery_date
           FROM job_cards jc
           LEFT JOIN customers c ON jc.customer_id = c.id
           WHERE jc.technician_id = ?
           ORDER BY jc.created_at DESC LIMIT 5`,
          [userId]
        )
      ]);

      stats = {
        assignedJobs: assignedJobs[0][0]?.count || 0,
        completedJobs: completedJobs[0][0]?.count || 0,
        pendingJobs: pendingJobs[0][0]?.count || 0,
        pendingTests: pendingTests[0][0]?.count || 0,
        recentJobs: recentJobs[0].map(jc => ({
          id: jc.id,
          jobNumber: jc.job_no,
          customerName: jc.customer_name,
          status: jc.status,
          expectedDeliveryDate: jc.expected_delivery_date ? jc.expected_delivery_date.toISOString().split('T')[0] : null
        }))
      };

    } else if (userRole === 'storekeeper') {
      // Storekeeper Dashboard Stats
      const [
        totalInventoryItems,
        lowStockItems,
        recentReceipts,
        recentTransactions
      ] = await Promise.all([
        // Total Inventory Items
        pool.execute(`SELECT COUNT(*) as count FROM inventory_items`),
        // Low Stock Items
        pool.execute(
          `SELECT id, part_name, part_code, available_stock, min_stock_level
           FROM inventory_items WHERE available_stock <= min_stock_level
           ORDER BY available_stock ASC LIMIT 10`
        ),
        // Recent Stock In Transactions
        pool.execute(
          `SELECT st.id, ii.part_name, st.quantity, st.created_at, u.name AS created_by_name
           FROM stock_transactions st
           LEFT JOIN inventory_items ii ON st.inventory_item_id = ii.id
           LEFT JOIN users u ON st.created_by = u.id
           WHERE st.transaction_type = 'Stock In'
           ORDER BY st.created_at DESC LIMIT 10`
        ),
        // Recent Stock Transactions
        pool.execute(
          `SELECT st.id, ii.part_name, st.transaction_type, st.quantity, st.created_at
           FROM stock_transactions st
           LEFT JOIN inventory_items ii ON st.inventory_item_id = ii.id
           ORDER BY st.created_at DESC LIMIT 10`
        )
      ]);

      stats = {
        totalInventoryItems: totalInventoryItems[0][0]?.count || 0,
        lowStockAlerts: lowStockItems[0].length,
        recentReceipts: recentReceipts[0].map(r => ({
          id: r.id,
          partName: r.part_name,
          quantity: r.quantity,
          date: r.created_at ? r.created_at.toISOString().split('T')[0] : null,
          supplier: r.created_by_name || 'System'
        })),
        lowStockItems: lowStockItems[0].map(item => ({
          id: item.id,
          partName: item.part_name,
          partCode: item.part_code,
          availableStock: item.available_stock,
          minStockLevel: item.min_stock_level
        })),
        recentTransactions: recentTransactions[0].map(t => ({
          id: t.id,
          partName: t.part_name,
          transactionType: t.transaction_type,
          quantity: t.quantity,
          createdAt: t.created_at ? t.created_at.toISOString().split('T')[0] : null
        }))
      };
    }

    res.json({
      success: true,
      data: stats,
      role: userRole
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics'
    });
  }
};

module.exports = {
  getDashboardStats
};

