// =====================================================
// Report Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get Sales Report
 * GET /api/v1/reports/sales
 */
const getSalesReport = async (req, res) => {
  try {
    const { start_date, end_date, company_id } = req.query;
    const filterCompanyId = company_id || req.companyId;
    
    let whereClause = 'WHERE i.is_deleted = 0';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND i.company_id = ?';
      params.push(filterCompanyId);
    }
    
    if (start_date) {
      whereClause += ' AND DATE(i.created_at) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause += ' AND DATE(i.created_at) <= ?';
      params.push(end_date);
    }
    
    // Get sales data grouped by month
    const [sales] = await pool.execute(
      `SELECT 
        DATE_FORMAT(i.created_at, '%Y-%m') as month,
        DATE_FORMAT(i.created_at, '%b') as month_name,
        COUNT(*) as count,
        SUM(i.total) as revenue,
        SUM(i.paid) as paid,
        SUM(i.unpaid) as unpaid
       FROM invoices i
       ${whereClause}
       GROUP BY DATE_FORMAT(i.created_at, '%Y-%m')
       ORDER BY month ASC`,
      params
    );
    
    res.json({
      success: true,
      data: sales
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch sales report'
    });
  }
};

/**
 * Get Revenue Report
 * GET /api/v1/reports/revenue
 */
const getRevenueReport = async (req, res) => {
  try {
    const { start_date, end_date, company_id, period = 'monthly' } = req.query;
    const filterCompanyId = company_id || req.companyId;
    
    let whereClause = 'WHERE i.is_deleted = 0';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND i.company_id = ?';
      params.push(filterCompanyId);
    }
    
    if (start_date) {
      whereClause += ' AND DATE(i.created_at) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause += ' AND DATE(i.created_at) <= ?';
      params.push(end_date);
    }
    
    let groupBy = '';
    if (period === 'quarterly') {
      groupBy = `QUARTER(i.created_at), YEAR(i.created_at)`;
    } else if (period === 'yearly') {
      groupBy = `YEAR(i.created_at)`;
    } else {
      groupBy = `DATE_FORMAT(i.created_at, '%Y-%m')`;
    }
    
    const [revenue] = await pool.execute(
      `SELECT 
        ${period === 'quarterly' ? 'CONCAT("Q", QUARTER(i.created_at), " ", YEAR(i.created_at)) as period' : 
          period === 'yearly' ? 'YEAR(i.created_at) as period' :
          'DATE_FORMAT(i.created_at, "%b %Y") as period'},
        SUM(i.total) as total_revenue,
        SUM(i.paid) as total_paid,
        SUM(i.unpaid) as total_unpaid,
        COUNT(*) as invoice_count
       FROM invoices i
       ${whereClause}
       GROUP BY ${groupBy}
       ORDER BY ${period === 'yearly' ? 'period' : 'MIN(i.created_at)'} ASC`,
      params
    );
    
    res.json({
      success: true,
      data: revenue
    });
  } catch (error) {
    console.error('Get revenue report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch revenue report'
    });
  }
};

/**
 * Get Project Status Report
 * GET /api/v1/reports/projects
 */
const getProjectStatusReport = async (req, res) => {
  try {
    const { company_id } = req.query;
    const filterCompanyId = company_id || req.companyId;
    
    let whereClause = 'WHERE p.is_deleted = 0';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND p.company_id = ?';
      params.push(filterCompanyId);
    }
    
    const [status] = await pool.execute(
      `SELECT 
        p.status,
        COUNT(*) as count,
        SUM(p.budget) as total_budget
       FROM projects p
       ${whereClause}
       GROUP BY p.status`,
      params
    );
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get project status report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch project status report'
    });
  }
};

/**
 * Get Employee Performance Report
 * GET /api/v1/reports/employees
 */
const getEmployeePerformanceReport = async (req, res) => {
  try {
    const { start_date, end_date, company_id } = req.query;
    const filterCompanyId = company_id || req.companyId;
    
    let whereClause = 'WHERE u.is_deleted = 0 AND u.role = "EMPLOYEE"';
    const params = [];
    
    if (filterCompanyId) {
      whereClause += ' AND u.company_id = ?';
      params.push(filterCompanyId);
    }
    
    if (start_date) {
      whereClause += ' AND DATE(t.completed_on) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      whereClause += ' AND DATE(t.completed_on) <= ?';
      params.push(end_date);
    }
    
    // Get employee performance metrics
    // Join employees with users to get name and email
    // Join with task_assignees and tasks for completed tasks
    // Join with project_members and projects for assigned projects
    // Join with time_logs for hours logged
    const [performance] = await pool.execute(
      `SELECT 
        e.id,
        u.id as user_id,
        u.name,
        u.email,
        COUNT(DISTINCT CASE WHEN t.status = 'Done' THEN t.id END) as tasks_completed,
        COUNT(DISTINCT p.id) as projects_assigned,
        COALESCE(SUM(tt.hours), 0) as hours_logged
       FROM employees e
       INNER JOIN users u ON e.user_id = u.id
       LEFT JOIN task_assignees ta ON u.id = ta.user_id
       LEFT JOIN tasks t ON ta.task_id = t.id AND t.status = 'Done' AND t.is_deleted = 0
       LEFT JOIN project_members pm ON u.id = pm.user_id
       LEFT JOIN projects p ON pm.project_id = p.id AND p.is_deleted = 0
       LEFT JOIN time_logs tt ON u.id = tt.user_id AND tt.is_deleted = 0
       ${whereClause}
       GROUP BY e.id, u.id, u.name, u.email
       ORDER BY tasks_completed DESC`,
      params
    );
    
    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get employee performance report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch employee performance report'
    });
  }
};

/**
 * Get All Reports Summary
 * GET /api/v1/reports/summary
 */
const getReportsSummary = async (req, res) => {
  try {
    const { company_id } = req.query;
    const filterCompanyId = company_id || req.companyId;
    
    let whereClause = '';
    const params = [];
    
    if (filterCompanyId) {
      whereClause = 'WHERE company_id = ?';
      params.push(filterCompanyId);
    }
    
    // Get summary statistics
    const [invoices] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(total) as total_revenue,
        SUM(paid) as total_paid,
        SUM(unpaid) as total_unpaid
       FROM invoices
       ${whereClause ? whereClause.replace('company_id', 'company_id') : 'WHERE is_deleted = 0'}
       ${whereClause ? '' : 'AND is_deleted = 0'}`,
      params
    );
    
    const [projects] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
       FROM projects
       ${whereClause ? whereClause.replace('company_id', 'company_id') : 'WHERE is_deleted = 0'}
       ${whereClause ? '' : 'AND is_deleted = 0'}`,
      params
    );
    
    const [leads] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Won' THEN 1 END) as won,
        COUNT(CASE WHEN status = 'Lost' THEN 1 END) as lost
       FROM leads
       ${whereClause ? whereClause.replace('company_id', 'company_id') : 'WHERE is_deleted = 0'}
       ${whereClause ? '' : 'AND is_deleted = 0'}`,
      params
    );
    
    res.json({
      success: true,
      data: {
        invoices: invoices[0] || {},
        projects: projects[0] || {},
        leads: leads[0] || {}
      }
    });
  } catch (error) {
    console.error('Get reports summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch reports summary'
    });
  }
};

module.exports = {
  getSalesReport,
  getRevenueReport,
  getProjectStatusReport,
  getEmployeePerformanceReport,
  getReportsSummary
};

