const pool = require('../config/db');

const get = async (req, res) => {
  try {
    const [settings] = await pool.execute(
      `SELECT * FROM system_settings WHERE company_id = ? OR company_id IS NULL`,
      [req.companyId]
    );
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
};

const update = async (req, res) => {
  try {
    let setting_key, setting_value;
    
    // Handle file upload (multipart/form-data)
    if (req.file) {
      // File was uploaded
      setting_key = req.body.setting_key || 'logo';
      // Store file path relative to uploads directory
      setting_value = `/uploads/${req.file.filename}`;
    } else {
      // Regular JSON data
      setting_key = req.body.setting_key;
      setting_value = req.body.setting_value;
    }
    
    // Validate required fields
    if (!setting_key) {
      return res.status(400).json({ 
        success: false, 
        error: 'setting_key is required' 
      });
    }
    
    // Check if companyId exists
    if (!req.companyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company ID is required. Please ensure you are logged in with a valid company account.' 
      });
    }
    
    await pool.execute(
      `INSERT INTO system_settings (company_id, setting_key, setting_value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [req.companyId, setting_key, setting_value, setting_value]
    );
    
    res.json({ 
      success: true, 
      message: 'Settings updated',
      data: {
        setting_key,
        setting_value
      }
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to update settings',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = { get, update };

