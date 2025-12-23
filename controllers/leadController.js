// =====================================================
// Lead Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get all leads
 * GET /api/v1/leads
 */
const getAll = async (req, res) => {
  try {
    const { status, owner_id, source, city } = req.query;

    let whereClause = 'WHERE l.company_id = ? AND l.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND l.status = ?';
      params.push(status);
    }
    if (owner_id) {
      whereClause += ' AND l.owner_id = ?';
      params.push(owner_id);
    }
    if (source) {
      whereClause += ' AND l.source = ?';
      params.push(source);
    }
    if (city) {
      whereClause += ' AND l.city = ?';
      params.push(city);
    }

    // Get leads with owner info
    const [leads] = await pool.execute(
      `SELECT l.*, u.name as owner_name, u.email as owner_email
       FROM leads l
       LEFT JOIN users u ON l.owner_id = u.id
       ${whereClause}
       ORDER BY l.created_at DESC`,
      params
    );

    // Get managers and labels for each lead
    for (let lead of leads) {
      const [managers] = await pool.execute(
        `SELECT u.id, u.name FROM lead_managers lm
         JOIN users u ON lm.user_id = u.id
         WHERE lm.lead_id = ?`,
        [lead.id]
      );
      lead.managers = managers;

      const [labels] = await pool.execute(
        `SELECT label FROM lead_labels WHERE lead_id = ?`,
        [lead.id]
      );
      lead.labels = labels.map(l => l.label);
    }

    res.json({
      success: true,
      data: leads
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads'
    });
  }
};

/**
 * Get lead by ID
 * GET /api/v1/leads/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [leads] = await pool.execute(
      `SELECT l.*, u.name as owner_name, u.email as owner_email
       FROM leads l
       LEFT JOIN users u ON l.owner_id = u.id
       WHERE l.id = ? AND l.company_id = ? AND l.is_deleted = 0`,
      [id, req.companyId]
    );

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const lead = leads[0];

    // Get managers
    const [managers] = await pool.execute(
      `SELECT u.id, u.name FROM lead_managers lm
       JOIN users u ON lm.user_id = u.id
       WHERE lm.lead_id = ?`,
      [lead.id]
    );
    lead.managers = managers;

    // Get labels
    const [labels] = await pool.execute(
      `SELECT label FROM lead_labels WHERE lead_id = ?`,
      [lead.id]
    );
    lead.labels = labels.map(l => l.label);

    res.json({
      success: true,
      data: lead
    });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead'
    });
  }
};

/**
 * Create lead
 * POST /api/v1/leads
 */
const create = async (req, res) => {
  try {
    const {
      lead_type, company_name, person_name, email, phone,
      owner_id, managers = [], status, source, address,
      city, state, zip, country, value, due_followup,
      notes, probability, call_this_week, labels = []
    } = req.body;

    // Validation
    if (!person_name || !email || !phone || !owner_id) {
      return res.status(400).json({
        success: false,
        error: 'person_name, email, phone, and owner_id are required'
      });
    }

    // Insert lead - convert undefined to null for SQL
    const [result] = await pool.execute(
      `INSERT INTO leads (
        company_id, lead_type, company_name, person_name, email, phone,
        owner_id, status, source, address, city, state, zip, country,
        value, due_followup, notes, probability, call_this_week, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        lead_type || 'Organization',
        company_name ?? null,
        person_name,
        email,
        phone,
        owner_id,
        status || 'New',
        source ?? null,
        address ?? null,
        city ?? null,
        state ?? null,
        zip ?? null,
        country ?? null,
        value ?? null,
        due_followup ?? null,
        notes ?? null,
        probability ?? null,
        call_this_week || 0,
        req.userId ?? null
      ]
    );

    const leadId = result.insertId;

    // Insert managers
    if (managers.length > 0) {
      const managerValues = managers.map(userId => [leadId, userId]);
      await pool.query(
        `INSERT INTO lead_managers (lead_id, user_id) VALUES ?`,
        [managerValues]
      );
    }

    // Insert labels
    if (labels.length > 0) {
      const labelValues = labels.map(label => [leadId, label]);
      await pool.query(
        `INSERT INTO lead_labels (lead_id, label) VALUES ?`,
        [labelValues]
      );
    }

    // Get created lead
    const [leads] = await pool.execute(
      `SELECT * FROM leads WHERE id = ?`,
      [leadId]
    );

    res.status(201).json({
      success: true,
      data: leads[0],
      message: 'Lead created successfully'
    });
  } catch (error) {
    console.error('Create lead error:', error);
    console.error('Error details:', {
      message: error.message,
      sqlMessage: error.sqlMessage,
      code: error.code,
      errno: error.errno
    });
    res.status(500).json({
      success: false,
      error: error.sqlMessage || error.message || 'Failed to create lead'
    });
  }
};

/**
 * Update lead
 * PUT /api/v1/leads/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if lead exists
    const [leads] = await pool.execute(
      `SELECT id FROM leads WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    // Build update query
    const allowedFields = [
      'lead_type', 'company_name', 'person_name', 'email', 'phone',
      'owner_id', 'status', 'source', 'address', 'city', 'state',
      'zip', 'country', 'value', 'due_followup', 'notes', 'probability', 'call_this_week'
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert undefined to null for SQL
        values.push(updateFields[field] === undefined ? null : updateFields[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, req.companyId);

    await pool.execute(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
      values
    );

    // Update managers if provided
    if (updateFields.managers) {
      await pool.execute(`DELETE FROM lead_managers WHERE lead_id = ?`, [id]);
      if (updateFields.managers.length > 0) {
        const managerValues = updateFields.managers.map(userId => [id, userId]);
        await pool.query(
          `INSERT INTO lead_managers (lead_id, user_id) VALUES ?`,
          [managerValues]
        );
      }
    }

    // Update labels if provided
    if (updateFields.labels) {
      await pool.execute(`DELETE FROM lead_labels WHERE lead_id = ?`, [id]);
      if (updateFields.labels.length > 0) {
        const labelValues = updateFields.labels.map(label => [id, label]);
        await pool.query(
          `INSERT INTO lead_labels (lead_id, label) VALUES ?`,
          [labelValues]
        );
      }
    }

    // Get updated lead
    const [updatedLeads] = await pool.execute(
      `SELECT * FROM leads WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedLeads[0],
      message: 'Lead updated successfully'
    });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update lead'
    });
  }
};

/**
 * Delete lead (soft delete)
 * DELETE /api/v1/leads/:id
 */
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE leads SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete lead'
    });
  }
};

/**
 * Convert lead to client
 * POST /api/v1/leads/:id/convert-to-client
 */
const convertToClient = async (req, res) => {
  try {
    const { id } = req.params;

    // Get lead
    const [leads] = await pool.execute(
      `SELECT * FROM leads WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const lead = leads[0];

    // Create client - convert undefined to null for SQL
    const [clientResult] = await pool.execute(
      `INSERT INTO clients (
        company_id, company_name, owner_id, address, city, state, zip, country,
        phone_country_code, phone_number, website, vat_number, gst_number,
        currency, currency_symbol, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        lead.company_name || lead.person_name,
        lead.owner_id ?? null,
        lead.address ?? null,
        lead.city ?? null,
        lead.state ?? null,
        lead.zip ?? null,
        lead.country || 'United States',
        '+1',
        lead.phone ?? null,
        lead.source ?? null,
        null,
        null,
        'USD',
        '$',
        'Active'
      ]
    );

    const clientId = clientResult.insertId;

    // Create client contact - convert undefined to null for SQL
    await pool.execute(
      `INSERT INTO client_contacts (
        client_id, name, job_title, email, phone, is_primary
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        lead.person_name ?? null,
        null,
        lead.email ?? null,
        lead.phone ?? null,
        1
      ]
    );

    // Update lead status to 'Won'
    await pool.execute(
      `UPDATE leads SET status = 'Won', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: { client_id: clientId },
      message: 'Lead converted to client successfully'
    });
  } catch (error) {
    console.error('Convert lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert lead to client'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteLead,
  convertToClient
};

