// =====================================================
// Dashboard Controller
// =====================================================

const pool = require('../config/db');

// Safe query helper - returns default value on error
const safeQuery = async (query, params, defaultValue = [{ total: 0 }]) => {
  try {
    const [result] = await pool.execute(query, params);
    return result;
  } catch (error) {
    console.warn('Safe query warning:', error.message);
    return defaultValue;
  }
};

/**
 * Get admin dashboard stats
 * GET /api/v1/dashboard/admin
 */
const getAdminDashboard = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.body.company_id || 1;
    
    // Use safe queries to handle missing tables gracefully
    const [
      leadsCount,
      clientsCount,
      employeesCount,
      companiesCount,
      projectsCount,
      invoicesCount,
      tasksCount
    ] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) as total FROM leads WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM clients WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM users WHERE company_id = ? AND role = 'EMPLOYEE' AND is_deleted = 0`,
        [companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM companies WHERE is_deleted = 0`,
        []
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM projects WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as total_amount, COALESCE(SUM(paid), 0) as paid_amount, COALESCE(SUM(unpaid), 0) as unpaid_amount
         FROM invoices WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM tasks WHERE company_id = ? AND is_deleted = 0`,
        [companyId]
      )
    ]);

    res.json({
      success: true,
      data: {
        leads: leadsCount[0]?.total || 0,
        clients: clientsCount[0]?.total || 0,
        employees: employeesCount[0]?.total || 0,
        companies: companiesCount[0]?.total || 0,
        projects: projectsCount[0]?.total || 0,
        invoices: {
          total: invoicesCount[0]?.total || 0,
          total_amount: invoicesCount[0]?.total_amount || 0,
          paid_amount: invoicesCount[0]?.paid_amount || 0,
          unpaid_amount: invoicesCount[0]?.unpaid_amount || 0
        },
        tasks: tasksCount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
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

    // Use safe queries to handle missing tables gracefully
    const [
      tasksCount,
      projectsCount,
      timeLogs,
      events
    ] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) as total FROM tasks t
         LEFT JOIN task_assignees ta ON t.id = ta.task_id
         WHERE (ta.user_id = ? OR t.created_by = ?) AND t.company_id = ? AND t.is_deleted = 0`,
        [userId, userId, companyId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM projects p
         LEFT JOIN project_members pm ON p.id = pm.project_id
         WHERE pm.user_id = ? AND p.company_id = ? AND p.is_deleted = 0`,
        [userId, companyId]
      ),
      safeQuery(
        `SELECT COALESCE(SUM(hours), 0) as total_hours FROM time_logs
         WHERE user_id = ? AND company_id = ? AND DATE(date) = ? AND is_deleted = 0`,
        [userId, companyId, today]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM events e
         LEFT JOIN event_employees ee ON e.id = ee.event_id
         WHERE (ee.user_id = ? OR e.created_by = ?) AND e.company_id = ? AND e.starts_on_date >= ? AND e.is_deleted = 0`,
        [userId, userId, companyId, today]
      )
    ]);

    res.json({
      success: true,
      data: {
        my_tasks: tasksCount[0]?.total || 0,
        my_projects: projectsCount[0]?.total || 0,
        time_logged_today: timeLogs[0]?.total_hours || 0,
        upcoming_events: events[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get employee dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
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

    console.log('Client dashboard - userId:', userId, 'companyId:', companyId);

    // Get client ID from user - try multiple ways to find the client
    let clients = await safeQuery(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId],
      []
    );

    // If not found by owner_id, try by user_id directly
    if (clients.length === 0) {
      clients = await safeQuery(
        `SELECT c.id FROM clients c
         INNER JOIN users u ON c.owner_id = u.id
         WHERE u.id = ? AND c.company_id = ? AND c.is_deleted = 0 LIMIT 1`,
        [userId, companyId],
        []
      );
    }

    // If still not found, use userId directly as clientId (for direct client users)
    let clientId = userId;
    if (clients.length > 0) {
      clientId = clients[0].id;
    }
    console.log('Using client ID:', clientId);

    // Use safe queries to handle missing tables gracefully
    const [
      projectsCount,
      tasksCount,
      invoices,
      payments,
      contractsCount,
      estimatesCount,
      creditNotesCount,
      contactsCount
    ] = await Promise.all([
      safeQuery(
        `SELECT COUNT(*) as total FROM projects WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM tasks WHERE project_id IN (
           SELECT id FROM projects WHERE client_id = ?
         ) AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COALESCE(SUM(unpaid), 0) as total FROM invoices WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE invoice_id IN (
           SELECT id FROM invoices WHERE client_id = ?
         ) AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM contracts WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM estimates WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM credit_notes WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      ),
      safeQuery(
        `SELECT COUNT(*) as total FROM client_contacts WHERE client_id = ? AND is_deleted = 0`,
        [clientId]
      )
    ]);

    res.json({
      success: true,
      data: {
        my_projects: projectsCount[0]?.total || 0,
        my_tasks: tasksCount[0]?.total || 0,
        outstanding_invoices: invoices[0]?.total || 0,
        total_payments: payments[0]?.total || 0,
        contracts_count: contractsCount[0]?.total || 0,
        estimates_count: estimatesCount[0]?.total || 0,
        credit_notes_count: creditNotesCount[0]?.total || 0,
        contacts_count: contactsCount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get client dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
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

    // Get client ID from user - try multiple ways to find the client
    let clients = await safeQuery(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId],
      []
    );

    // If not found by owner_id, use userId directly as clientId
    let clientId = userId;
    if (clients.length > 0) {
      clientId = clients[0].id;
    }

    // Get projects
    const projects = await safeQuery(
      `SELECT p.*, c.company_name as client_name 
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.client_id = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [clientId],
      []
    );

    const projectIds = projects.map(p => p.id);
    let tasks = [];
    if (projectIds.length > 0) {
      tasks = await safeQuery(
        `SELECT t.*, p.project_name, u.name as assigned_to_name
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
         LEFT JOIN users u ON t.created_by = u.id
         WHERE t.project_id IN (${projectIds.map(() => '?').join(',')}) AND t.is_deleted = 0
         ORDER BY t.created_at DESC
         LIMIT 20`,
        projectIds,
        []
      );
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
      error: 'Failed to fetch work data',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
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

    // Get client ID from user - try multiple ways to find the client
    let clients = await safeQuery(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId],
      []
    );

    // If not found by owner_id, use userId directly as clientId
    let clientId = userId;
    if (clients.length > 0) {
      clientId = clients[0].id;
    }

    // Get invoices
    const invoices = await safeQuery(
      `SELECT i.*, c.company_name as client_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.client_id = ? AND i.is_deleted = 0
       ORDER BY i.created_at DESC
       LIMIT 10`,
      [clientId],
      []
    );

    const invoiceIds = invoices.map(i => i.id);
    let payments = [];
    if (invoiceIds.length > 0) {
      payments = await safeQuery(
        `SELECT p.*, i.invoice_number
         FROM payments p
         LEFT JOIN invoices i ON p.invoice_id = i.id
         WHERE p.invoice_id IN (${invoiceIds.map(() => '?').join(',')}) AND p.is_deleted = 0
         ORDER BY p.created_at DESC
         LIMIT 10`,
        invoiceIds,
        []
      );
    }

    // Get estimates
    const estimates = await safeQuery(
      `SELECT e.*, c.company_name as client_name
       FROM estimates e
       LEFT JOIN clients c ON e.client_id = c.id
       WHERE e.client_id = ? AND e.is_deleted = 0
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [clientId],
      []
    );

    // Get contracts
    const contracts = await safeQuery(
      `SELECT ct.*, c.company_name as client_name
       FROM contracts ct
       LEFT JOIN clients c ON ct.client_id = c.id
       WHERE ct.client_id = ? AND ct.is_deleted = 0
       ORDER BY ct.created_at DESC
       LIMIT 10`,
      [clientId],
      []
    );

    // Get credit notes
    const creditNotes = await safeQuery(
      `SELECT cn.*, c.company_name as client_name
       FROM credit_notes cn
       LEFT JOIN clients c ON cn.client_id = c.id
       WHERE cn.client_id = ? AND cn.is_deleted = 0
       ORDER BY cn.created_at DESC
       LIMIT 10`,
      [clientId],
      []
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
      error: 'Failed to fetch finance data',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
};

/**
 * Get client announcements
 * GET /api/v1/dashboard/client/announcements
 */
const getClientAnnouncements = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;

    // Get announcements from notifications table
    const announcements = await safeQuery(
      `SELECT n.*, u.name as created_by_name
       FROM notifications n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.company_id = ? 
         AND (n.user_id = ? OR n.user_id IS NULL)
         AND n.type = 'announcement'
         AND n.is_deleted = 0
       ORDER BY n.created_at DESC
       LIMIT 10`,
      [companyId, userId],
      []
    );

    res.json({
      success: true,
      data: announcements || []
    });
  } catch (error) {
    console.error('Get client announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcements'
    });
  }
};

/**
 * Get client recent activity
 * GET /api/v1/dashboard/client/activity
 */
const getClientActivity = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || 1;
    const companyId = req.query.company_id || req.body.company_id || 1;

    // Get client ID
    let clients = await safeQuery(
      `SELECT id FROM clients WHERE owner_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId, companyId],
      []
    );

    let clientId = userId;
    if (clients.length > 0) {
      clientId = clients[0].id;
    }

    // Get recent activity from various sources
    const activities = [];

    // Recent invoices
    const recentInvoices = await safeQuery(
      `SELECT id, invoice_number, status, created_at, 'invoice' as type
       FROM invoices 
       WHERE client_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 5`,
      [clientId],
      []
    );
    
    recentInvoices.forEach(inv => {
      activities.push({
        id: `inv-${inv.id}`,
        message: `Invoice ${inv.invoice_number} ${inv.status === 'Paid' ? 'paid' : 'sent'}`,
        date: inv.created_at,
        type: 'invoice'
      });
    });

    // Recent payments
    const recentPayments = await safeQuery(
      `SELECT p.id, p.amount, p.created_at, i.invoice_number
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       WHERE i.client_id = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [clientId],
      []
    );
    
    recentPayments.forEach(pay => {
      activities.push({
        id: `pay-${pay.id}`,
        message: `Payment of $${pay.amount} received for ${pay.invoice_number || 'Invoice'}`,
        date: pay.created_at,
        type: 'payment'
      });
    });

    // Recent projects
    const recentProjects = await safeQuery(
      `SELECT id, project_name, status, created_at
       FROM projects 
       WHERE client_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 5`,
      [clientId],
      []
    );
    
    recentProjects.forEach(proj => {
      activities.push({
        id: `proj-${proj.id}`,
        message: `Project "${proj.project_name}" ${proj.status || 'created'}`,
        date: proj.created_at,
        type: 'project'
      });
    });

    // Sort by date
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: activities.slice(0, 10)
    });
  } catch (error) {
    console.error('Get client activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity'
    });
  }
};

module.exports = {
  getAdminDashboard,
  getEmployeeDashboard,
  getClientDashboard,
  getClientWork,
  getClientFinance,
  getClientAnnouncements,
  getClientActivity
};

