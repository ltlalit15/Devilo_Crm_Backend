const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

const getAll = async (req, res) => {
  try {
    const { module } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    
    let whereClause = 'WHERE company_id = ? AND is_deleted = 0';
    const params = [req.companyId];
    
    if (module) {
      whereClause += ' AND module = ?';
      params.push(module);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM custom_fields ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated custom fields - LIMIT and OFFSET as template literals (not placeholders)
    const [fields] = await pool.execute(
      `SELECT * FROM custom_fields ${whereClause} ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ 
      success: true, 
      data: fields,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch custom fields' });
  }
};

const create = async (req, res) => {
  try {
    const { name, label, type, module } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO custom_fields (company_id, name, label, type, module)
       VALUES (?, ?, ?, ?, ?)`,
      [req.companyId, name, label, type, module]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create custom field' });
  }
};

module.exports = { getAll, create };

