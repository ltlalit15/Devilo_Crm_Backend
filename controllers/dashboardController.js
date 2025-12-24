// =====================================================
// Dashboard Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get admin dashboard stats
 * GET /api/v1/dashboard/admin
 */
const getAdminDashboard = async (req, res) => {
  try {
    // Parallelize all database queries for better performance
    const [
      [leadsCount],
      [clientsCount],
      [projectsCount],
      [invoicesCount],
      [tasksCount]
    ] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total FROM leads WHERE company_id = ? AND is_deleted = 0`,
        [req.companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM clients WHERE company_id = ? AND is_deleted = 0`,
        [req.companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM projects WHERE company_id = ? AND is_deleted = 0`,
        [req.companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total, SUM(total) as total_amount, SUM(paid) as paid_amount, SUM(unpaid) as unpaid_amount
         FROM invoices WHERE company_id = ? AND is_deleted = 0`,
        [req.companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM tasks WHERE company_id = ? AND is_deleted = 0`,
        [req.companyId]
      )
    ]);

    res.json({
      success: true,
      data: {
        leads: leadsCount[0].total,
        clients: clientsCount[0].total,
        projects: projectsCount[0].total,
        invoices: {
          total: invoicesCount[0].total,
          total_amount: invoicesCount[0].total_amount || 0,
          paid_amount: invoicesCount[0].paid_amount || 0,
          unpaid_amount: invoicesCount[0].unpaid_amount || 0
        },
        tasks: tasksCount[0].total
      }
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
};

/**
 * Get employee dashboard stats
 * GET /api/v1/dashboard/employee
 */
const getEmployeeDashboard = async (req, res) => {
  try {
    const userId = req.userId;
    const today = new Date().toISOString().split('T')[0];

    // Parallelize all database queries for better performance
    const [
      [tasksCount],
      [projectsCount],
      [timeLogs],
      [events]
    ] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total FROM tasks t
         JOIN task_assignees ta ON t.id = ta.task_id
         WHERE ta.user_id = ? AND t.company_id = ? AND t.is_deleted = 0`,
        [userId, req.companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM projects p
         JOIN project_members pm ON p.id = pm.project_id
         WHERE pm.user_id = ? AND p.company_id = ? AND p.is_deleted = 0`,
        [userId, req.companyId]
      ),
      pool.execute(
        `SELECT SUM(hours) as total_hours FROM time_logs
         WHERE user_id = ? AND company_id = ? AND date = ? AND is_deleted = 0`,
        [userId, req.companyId, today]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM events e
         JOIN event_employees ee ON e.id = ee.event_id
         WHERE ee.user_id = ? AND e.company_id = ? AND e.starts_on_date >= ? AND e.is_deleted = 0`,
        [userId, req.companyId, today]
      )
    ]);

    res.json({
      success: true,
      data: {
        my_tasks: tasksCount[0].total,
        my_projects: projectsCount[0].total,
        time_logged_today: timeLogs[0].total_hours || 0,
        upcoming_events: events[0].total
      }
    });
  } catch (error) {
    console.error('Get employee dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
};

/**
 * Get client dashboard stats
 * GET /api/v1/dashboard/client
 */
const getClientDashboard = async (req, res) => {
  try {
    const userId = req.userId;

    // Get client ID from user
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, req.companyId]
    );

    if (clients.length === 0) {
      return res.json({
        success: true,
        data: {
          my_projects: 0,
          my_tasks: 0,
          outstanding_invoices: 0,
          total_payments: 0
        }
      });
    }

    const clientId = clients[0].id;

    // Parallelize all database queries for better performance
    const [
      [projectsCount],
      [tasksCount],
      [invoices],
      [payments]
    ] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total FROM projects WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM tasks WHERE project_id IN (
           SELECT id FROM projects WHERE client_id = ?
         ) AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT SUM(unpaid) as total FROM invoices WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT SUM(amount) as total FROM payments WHERE invoice_id IN (
           SELECT id FROM invoices WHERE client_id = ?
         ) AND is_deleted = 0`,
        [clientId]
      )
    ]);

    res.json({
      success: true,
      data: {
        my_projects: projectsCount[0].total,
        my_tasks: tasksCount[0].total,
        outstanding_invoices: invoices[0].total || 0,
        total_payments: payments[0].total || 0
      }
    });
  } catch (error) {
    console.error('Get client dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data'
    });
  }
};

module.exports = {
  getAdminDashboard,
  getEmployeeDashboard,
  getClientDashboard
};

