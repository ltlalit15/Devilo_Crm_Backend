const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const [positions] = await pool.execute(
      `SELECT * FROM positions WHERE company_id = ? AND is_deleted = 0 ORDER BY name`,
      [req.companyId]
    );
    res.json({ success: true, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch positions' });
  }
};

module.exports = { getAll };

