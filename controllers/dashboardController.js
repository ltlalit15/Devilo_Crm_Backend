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
    const companyId = req.query.company_id || req.body.company_id || 1;
    // Parallelize all database queries for better performance
    const [
      [leadsCount],
      [clientsCount],
      [employeesCount],
      [companiesCount],
      [projectsCount],
      [invoicesCount],
      [tasksCount]
    ] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total FROM leads WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM clients WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM users WHERE company_id = ? AND role = 'EMPLOYEE' AND is_deleted = 0`,
        [companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM companies WHERE is_deleted = 0`,
        []
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM projects WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total, SUM(total) as total_amount, SUM(paid) as paid_amount, SUM(unpaid) as unpaid_amount
         FROM invoices WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM tasks WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      )
    ]);

    res.json({
      success: true,
      data: {
        leads: leadsCount[0].total,
        clients: clientsCount[0].total,
        employees: employeesCount[0].total,
        companies: companiesCount[0].total,
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
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;
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
        [userId, companyId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM projects p
         JOIN project_members pm ON p.id = pm.project_id
         WHERE pm.user_id = ? AND p.company_id = ? AND p.is_deleted = 0`,
        [userId, companyId]
      ),
      pool.execute(
        `SELECT SUM(hours) as total_hours FROM time_logs
         WHERE user_id = ? AND company_id = ? AND date = ? AND is_deleted = 0`,
        [userId, companyId, today]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM events e
         JOIN event_employees ee ON e.id = ee.event_id
         WHERE ee.user_id = ? AND e.company_id = ? AND e.starts_on_date >= ? AND e.is_deleted = 0`,
        [userId, companyId, today]
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
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;

    // Get client ID from user
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId]
    );

    if (clients.length === 0) {
      return res.json({
        success: true,
        data: {
          my_projects: 0,
          my_tasks: 0,
          outstanding_invoices: 0,
          total_payments: 0,
          contracts_count: 0,
          estimates_count: 0,
          credit_notes_count: 0,
          contacts_count: 0
        }
      });
    }

    const clientId = clients[0].id;

    // Parallelize all database queries for better performance
    const [
      [projectsCount],
      [tasksCount],
      [invoices],
      [payments],
      [contractsCount],
      [estimatesCount],
      [creditNotesCount],
      [contactsCount]
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
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM contracts WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM estimates WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM credit_notes WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      pool.execute(
        `SELECT COUNT(*) as total FROM client_contacts WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      )
    ]);

    res.json({
      success: true,
      data: {
        my_projects: projectsCount[0].total,
        my_tasks: tasksCount[0].total,
        outstanding_invoices: invoices[0].total || 0,
        total_payments: payments[0].total || 0,
        contracts_count: contractsCount[0].total,
        estimates_count: estimatesCount[0].total,
        credit_notes_count: creditNotesCount[0].total,
        contacts_count: contactsCount[0].total
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

/**
 * Get client work data (projects and tasks)
 * GET /api/v1/dashboard/client/work
 */
const getClientWork = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;

    // Get client ID from user
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId]
    );

    if (clients.length === 0) {
      return res.json({
        success: true,
        data: {
          projects: [],
          tasks: []
        }
      });
    }

    const clientId = clients[0].id;

    // Get projects and tasks
    const [projects] = await pool.execute(
      `SELECT p.*, c.company_name as client_name 
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.client_id = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    const projectIds = projects.map(p => p.id);
    let tasks = [];
    if (projectIds.length > 0) {
      const [tasksResult] = await pool.execute(
        `SELECT t.*, p.project_name, u.name as assigned_to_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         LEFT JOIN users u ON t.created_by = u.id
         WHERE t.project_id IN (${projectIds.map(() => '?').join(',')}) AND t.is_deleted = 0
         ORDER BY t.created_at DESC
         LIMIT 20`,
        projectIds
      );
      tasks = tasksResult;
    }

    res.json({
      success: true,
      data: {
        projects: projects || [],
        tasks: tasks || []
      }
    });
  } catch (error) {
    console.error('Get client work error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch work data'
    });
  }
};

/**
 * Get client finance data (invoices, payments, estimates, contracts, credit notes)
 * GET /api/v1/dashboard/client/finance
 */
const getClientFinance = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;

    // Get client ID from user
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId]
    );

    if (clients.length === 0) {
      return res.json({
        success: true,
        data: {
          invoices: [],
          payments: [],
          estimates: [],
          contracts: [],
          credit_notes: []
        }
      });
    }

    const clientId = clients[0].id;

    // Get invoices, payments, estimates, contracts, and credit notes
    const [invoices] = await pool.execute(
      `SELECT i.*, c.company_name as client_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.client_id = ? AND i.is_deleted = 0
       ORDER BY i.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    const invoiceIds = invoices.map(i => i.id);
    let payments = [];
    if (invoiceIds.length > 0) {
      const [paymentsResult] = await pool.execute(
        `SELECT p.*, i.invoice_number
         FROM payments p
         LEFT JOIN invoices i ON p.invoice_id = i.id
         WHERE p.invoice_id IN (${invoiceIds.map(() => '?').join(',')}) AND p.is_deleted = 0
         ORDER BY p.created_at DESC
         LIMIT 10`,
        invoiceIds
      );
      payments = paymentsResult;
    }

    // Get estimates
    const [estimates] = await pool.execute(
      `SELECT e.*, c.company_name as client_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE e.client_id = ? AND e.is_deleted = 0
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    // Get contracts
    const [contracts] = await pool.execute(
      `SELECT ct.*, c.company_name as client_name
       FROM contracts ct
       LEFT JOIN clients c ON ct.client_id = c.id
       WHERE ct.client_id = ? AND ct.is_deleted = 0
       ORDER BY ct.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    // Get credit notes
    const [creditNotes] = await pool.execute(
      `SELECT cn.*, c.company_name as client_name
       FROM credit_notes cn
       LEFT JOIN clients c ON cn.client_id = c.id
       WHERE cn.client_id = ? AND cn.is_deleted = 0
       ORDER BY cn.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    res.json({
      success: true,
      data: {
        invoices: invoices || [],
        payments: payments || [],
        estimates: estimates || [],
        contracts: contracts || [],
        credit_notes: creditNotes || []
      }
    });
  } catch (error) {
    console.error('Get client finance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch finance data'
    });
  }
};

module.exports = {
  getAdminDashboard,
  getEmployeeDashboard,
  getClientDashboard,
  getClientWork,
  getClientFinance
};

