const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { user_id, month, year } = req.query;
    
    const companyId = req.query.company_id || req.body.company_id || 1;
    let whereClause = 'WHERE a.company_id = ? AND u.is_deleted = 0';
    const params = [companyId];
    
    // Filter by user_id if provided (for employee dashboard)
    if (user_id) {
      whereClause += ' AND a.user_id = ?';
      params.push(user_id);
    } else if (req.user && req.user.role === 'EMPLOYEE') {
      // For employees, only show their own attendance
      whereClause += ' AND a.user_id = ?';
      params.push(req.userId);
    }
    
    // Filter by month and year if provided
    if (month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      whereClause += ' AND a.date >= ? AND a.date <= ?';
      params.push(startDate, endDate);
    }

    // Get all attendance without pagination
    const [attendance] = await pool.execute(
      `SELECT 
        a.id,
        a.company_id,
        a.user_id,
        a.date,
        a.check_in,
        a.check_out,
        a.status,
        a.notes,
        a.created_at,
        a.updated_at,
        u.name as employee_name,
        u.email as employee_email,
        TIMESTAMPDIFF(HOUR, CONCAT(a.date, ' ', a.check_in), CONCAT(a.date, ' ', COALESCE(a.check_out, NOW()))) as total_hours
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.date DESC, u.name ASC`,
      params
    );
    res.json({ 
      success: true, 
      data: attendance
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance' });
  }
};

/**
 * Get monthly calendar attendance
 * GET /api/v1/attendance/calendar?month=12&year=2025
 */
const getMonthlyCalendar = async (req, res) => {
  try {
    const { month, year, user_id } = req.query;
    const userId = user_id || req.userId;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [attendance] = await pool.execute(
      `SELECT 
        a.date,
        a.check_in,
        a.check_out,
        a.status,
        TIMESTAMPDIFF(HOUR, CONCAT(a.date, ' ', a.check_in), CONCAT(a.date, ' ', COALESCE(a.check_out, NOW()))) as total_hours
      FROM attendance a
      WHERE a.company_id = ? AND a.user_id = ? AND a.date >= ? AND a.date <= ?
      ORDER BY a.date ASC`,
      [req.companyId, userId, startDate, endDate]
    );

    // Calculate attendance percentage
    const totalDays = lastDay;
    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        calendar: attendance,
        attendance_percentage: parseFloat(attendancePercentage),
        total_days: totalDays,
        present_days: presentDays,
        absent_days: totalDays - presentDays
      }
    });
  } catch (error) {
    console.error('Get monthly calendar error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch monthly calendar'
    });
  }
};

/**
 * Get attendance percentage
 * GET /api/v1/attendance/percentage?month=12&year=2025
 */
const getAttendancePercentage = async (req, res) => {
  try {
    const { month, year, user_id } = req.query;
    const userId = user_id || req.userId;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'Half Day' THEN 1 ELSE 0 END) as half_days
      FROM attendance
      WHERE company_id = ? AND user_id = ? AND date >= ? AND date <= ?`,
      [req.companyId, userId, startDate, endDate]
    );

    const totalDays = lastDay;
    const presentDays = stats[0].present_days || 0;
    const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        attendance_percentage: parseFloat(attendancePercentage),
        total_days: totalDays,
        present_days: presentDays,
        absent_days: stats[0].absent_days || 0,
        late_days: stats[0].late_days || 0,
        half_days: stats[0].half_days || 0
      }
    });
  } catch (error) {
    console.error('Get attendance percentage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance percentage'
    });
  }
};

const checkIn = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await pool.execute(
      `INSERT INTO attendance (company_id, user_id, date, check_in, status)
       VALUES (?, ?, ?, NOW(), 'Present')
       ON DUPLICATE KEY UPDATE check_in = NOW(), status = 'Present'`,
      [req.companyId, req.userId, today]
    );
    res.json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check in' });
  }
};

const checkOut = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await pool.execute(
      `UPDATE attendance SET check_out = NOW() WHERE company_id = ? AND user_id = ? AND date = ?`,
      [req.companyId, req.userId, today]
    );
    res.json({ success: true, message: 'Checked out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check out' });
  }
};

module.exports = { getAll, checkIn, checkOut, getMonthlyCalendar, getAttendancePercentage };

