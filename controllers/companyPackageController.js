// =====================================================
// Company Package Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get all company packages
 * GET /api/v1/company-packages
 */
const getAll = async (req, res) => {
  try {
    // Check if companyId exists
    if (!req.companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required. Please ensure you are logged in with a valid company account.'
      });
    }

    const { status } = req.query;

    let whereClause = 'WHERE cp.company_id = ? AND cp.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND cp.status = ?';
      params.push(status);
    }

    const [packages] = await pool.execute(
      `SELECT cp.*, 
              0 as companies_count
       FROM company_packages cp
       ${whereClause}
       ORDER BY cp.created_at DESC`,
      params
    );

    // Parse JSON features safely
    const packagesWithFeatures = packages.map(pkg => {
      try {
        return {
          ...pkg,
          features: pkg.features ? (typeof pkg.features === 'string' ? JSON.parse(pkg.features) : pkg.features) : []
        };
      } catch (parseError) {
        console.error('Error parsing features for package:', pkg.id, parseError);
        return {
          ...pkg,
          features: []
        };
      }
    });

    res.json({
      success: true,
      data: packagesWithFeatures
    });
  } catch (error) {
    console.error('Get company packages error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      companyId: req.companyId
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch company packages',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get package by ID
 * GET /api/v1/company-packages/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [packages] = await pool.execute(
      `SELECT cp.*, 
              0 as companies_count
       FROM company_packages cp
       WHERE cp.id = ? AND cp.company_id = ? AND cp.is_deleted = 0`,
      [id, req.companyId]
    );

    if (packages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    const pkg = packages[0];
    pkg.features = pkg.features ? JSON.parse(pkg.features) : [];

    res.json({
      success: true,
      data: pkg
    });
  } catch (error) {
    console.error('Get package by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch package'
    });
  }
};

/**
 * Create new package
 * POST /api/v1/company-packages
 */
const create = async (req, res) => {
  try {
    const {
      package_name,
      price,
      billing_cycle = 'Monthly',
      features = [],
      status = 'Active'
    } = req.body;

    if (!package_name || price === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Package name and price are required'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO company_packages 
       (company_id, package_name, price, billing_cycle, features, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.companyId,
        package_name,
        parseFloat(price),
        billing_cycle,
        JSON.stringify(features),
        status
      ]
    );

    const [newPackage] = await pool.execute(
      `SELECT * FROM company_packages WHERE id = ?`,
      [result.insertId]
    );

    const pkg = newPackage[0];
    pkg.features = pkg.features ? JSON.parse(pkg.features) : [];
    pkg.companies_count = 0;

    res.status(201).json({
      success: true,
      data: pkg,
      message: 'Package created successfully'
    });
  } catch (error) {
    console.error('Create package error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create package'
    });
  }
};

/**
 * Update package
 * PUT /api/v1/company-packages/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      package_name,
      price,
      billing_cycle,
      features,
      status
    } = req.body;

    // Check if package exists
    const [existing] = await pool.execute(
      `SELECT id FROM company_packages 
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    const updateFields = [];
    const updateValues = [];

    if (package_name !== undefined) {
      updateFields.push('package_name = ?');
      updateValues.push(package_name);
    }
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(parseFloat(price));
    }
    if (billing_cycle !== undefined) {
      updateFields.push('billing_cycle = ?');
      updateValues.push(billing_cycle);
    }
    if (features !== undefined) {
      updateFields.push('features = ?');
      updateValues.push(JSON.stringify(features));
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    await pool.execute(
      `UPDATE company_packages 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [...updateValues, id, req.companyId]
    );

    const [updated] = await pool.execute(
      `SELECT cp.*, 
              0 as companies_count
       FROM company_packages cp
       WHERE cp.id = ? AND cp.company_id = ?`,
      [id, req.companyId]
    );

    const pkg = updated[0];
    pkg.features = pkg.features ? JSON.parse(pkg.features) : [];

    res.json({
      success: true,
      data: pkg,
      message: 'Package updated successfully'
    });
  } catch (error) {
    console.error('Update package error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update package'
    });
  }
};

/**
 * Delete package (soft delete)
 * DELETE /api/v1/company-packages/:id
 */
const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute(
      `SELECT id FROM company_packages 
       WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    await pool.execute(
      `UPDATE company_packages 
       SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    console.error('Delete package error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete package'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  deletePackage
};

