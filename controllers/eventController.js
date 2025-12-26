const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { year, month, start_date, end_date } = req.query;
    const companyId = req.query.company_id || req.body.company_id || 1;
    
    // No pagination - return all events
    let whereClause = 'WHERE e.is_deleted = 0';
    const params = [];

    // Add company_id filter only if provided
    if (companyId) {
      whereClause += ' AND e.company_id = ?';
      params.push(companyId);
    }

    // Filter by year and month if provided
    if (year && month) {
      const monthNum = parseInt(month); // 1-12 from frontend
      const yearNum = parseInt(year);
      const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
      // JavaScript Date months are 0-indexed (0=Jan, 11=Dec)
      // To get last day of monthNum (1-12), use new Date(year, monthNum + 1, 0)
      // This gives us day 0 of next month = last day of current month
      const lastDay = new Date(yearNum, monthNum + 1, 0).getDate();
      const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      whereClause += ' AND e.starts_on_date >= ? AND e.starts_on_date <= ?';
      params.push(startDate, endDate);
    } else if (start_date && end_date) {
      whereClause += ' AND e.starts_on_date >= ? AND e.starts_on_date <= ?';
      params.push(start_date, end_date);
    }

    // For employees, show all company events (they can see all events in their company)
    // If you want to restrict to only assigned events, uncomment the code below:
    /*
    if (req.user.role === 'EMPLOYEE') {
      whereClause += ` AND (
        e.id IN (SELECT event_id FROM event_employees WHERE user_id = ?)
        OR e.host_id = ?
        OR e.created_by = ?
      )`;
      params.push(req.userId, req.userId, req.userId);
    }
    */

    // Get all events without pagination
    const [events] = await pool.execute(
      `SELECT e.*, 
              u.name as host_name,
              u.email as host_email
       FROM events e
       LEFT JOIN users u ON e.host_id = u.id
       ${whereClause}
       ORDER BY e.starts_on_date ASC, e.starts_on_time ASC`,
      params
    );

    // Get departments, employees, and clients for each event
    for (let event of events) {
      // Get departments
      const [departments] = await pool.execute(
        `SELECT d.id, d.name as department_name 
         FROM event_departments ed
         JOIN departments d ON ed.department_id = d.id
         WHERE ed.event_id = ?`,
        [event.id]
      );
      event.departments = departments;

      // Get employees
      const [employees] = await pool.execute(
        `SELECT u.id, u.name, u.email 
         FROM event_employees ee
         JOIN users u ON ee.user_id = u.id
         WHERE ee.event_id = ?`,
        [event.id]
      );
      event.employees = employees;

      // Get clients
      const [clients] = await pool.execute(
        `SELECT c.id, c.company_name, u.email 
         FROM event_clients ec
         JOIN clients c ON ec.client_id = c.id
         LEFT JOIN users u ON c.owner_id = u.id
         WHERE ec.event_id = ?`,
        [event.id]
      );
      event.clients = clients;
    }

    console.log(`Fetched ${events.length} events for company ${companyId}, year ${year || 'all'}, month ${month || 'all'}`);
    res.json({ 
      success: true, 
      data: events
    });
  } catch (error) {
    console.error('Get events error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch events',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
};

const create = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      event_name,
      label_color,
      where: whereLocation,
      description,
      start_date,
      start_time,
      starts_on_date,
      starts_on_time,
      end_date,
      end_time,
      ends_on_date,
      ends_on_time,
      department_ids,
      employee_ids,
      client_ids,
      select_employee,
      select_client,
      host_id,
      host,
      status,
      event_link,
      eventLink
    } = req.body;

    // Use the correct field names (support both formats)
    const eventName = event_name || req.body.eventName;
    const labelColor = label_color || req.body.labelColor || '#FF0000';
    const location = whereLocation || req.body.where || req.body.location;
    const desc = description || req.body.description || null;
    const startDate = starts_on_date || start_date;
    const startTime = starts_on_time || start_time;
    const endDate = ends_on_date || end_date;
    const endTime = ends_on_time || end_time;
    const departments = department_ids || req.body.department || [];
    const employees = employee_ids || select_employee || [];
    const clients = client_ids || select_client || [];
    const userId = req.query.user_id || req.body.user_id || null;
    const companyId = req.query.company_id || req.body.company_id || 1;
    const hostId = host_id || host || userId;
    const eventStatus = status || 'Pending';
    const link = event_link || eventLink || null;

    if (!eventName || !location || !startDate || !startTime || !endDate || !endTime) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: event_name, where, start_date, start_time, end_date, end_time'
      });
    }

    // Validate host_id exists in users table
    if (hostId) {
      const [hostCheck] = await connection.execute(
        `SELECT id FROM users WHERE id = ? AND is_deleted = 0`,
        [hostId]
      );
      if (hostCheck.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `Invalid host_id: User with ID ${hostId} not found or doesn't belong to this company`
        });
      }
    }

    // Insert event - use NULL if hostId is not provided or invalid
    const [result] = await connection.execute(
      `INSERT INTO events (
        company_id, event_name, label_color, \`where\`, description,
        starts_on_date, starts_on_time, ends_on_date, ends_on_time,
        host_id, status, event_link, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        eventName,
        labelColor,
        location || null,
        desc || null,
        startDate,
        startTime,
        endDate,
        endTime,
        hostId || null,
        eventStatus,
        link || null,
        userId
      ]
    );

    const eventId = result.insertId;

    // Insert departments
    if (departments && departments.length > 0) {
      for (const deptId of departments) {
        await connection.execute(
          'INSERT INTO event_departments (event_id, department_id) VALUES (?, ?)',
          [eventId, deptId]
        );
      }
    }

    // Insert employees - always add the creator if they're an employee
    const employeesToAdd = [...new Set(employees && employees.length > 0 ? employees : [])];
    // If creator is employee and not already in list, add them
    if (userId && !employeesToAdd.includes(userId)) {
      employeesToAdd.push(userId);
    }
    
    if (employeesToAdd.length > 0) {
      for (const empId of employeesToAdd) {
        try {
          await connection.execute(
            'INSERT INTO event_employees (event_id, user_id) VALUES (?, ?)',
            [eventId, empId]
          );
        } catch (err) {
          // Skip if already exists (unique constraint)
          if (err.code !== 'ER_DUP_ENTRY') {
            throw err;
          }
        }
      }
    }

    // Insert clients (if event_clients table exists)
    if (clients && clients.length > 0) {
      try {
        for (const clientId of clients) {
          await connection.execute(
            'INSERT INTO event_clients (event_id, client_id) VALUES (?, ?)',
            [eventId, clientId]
          );
        }
      } catch (err) {
        // event_clients table might not exist, skip
        console.log('event_clients table not found, skipping client assignment');
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      data: { id: eventId },
      message: 'Event created successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create event'
    });
  } finally {
    connection.release();
  }
};

module.exports = { getAll, create };

