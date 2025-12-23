const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const [events] = await pool.execute(
      `SELECT * FROM events WHERE company_id = ? AND is_deleted = 0 ORDER BY starts_on_date DESC`,
      [req.companyId]
    );
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
};

const create = async (req, res) => {
  try {
    const { event_name, starts_on_date, ends_on_date, where: whereLocation } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO events (company_id, event_name, starts_on_date, ends_on_date, where, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.companyId, event_name, starts_on_date, ends_on_date, whereLocation, req.userId]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create event' });
  }
};

module.exports = { getAll, create };

