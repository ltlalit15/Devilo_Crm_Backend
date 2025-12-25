// =====================================================
// Lead Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all leads
 * GET /api/v1/leads
 */
const getAll = async (req, res) => {
  try {
    const { status, owner_id, source, city } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

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

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM leads l ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated leads with owner info - LIMIT and OFFSET as template literals (not placeholders)
    const [leads] = await pool.execute(
      `SELECT l.*, u.name as owner_name, u.email as owner_email
       FROM leads l
       LEFT JOIN users u ON l.owner_id = u.id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Get labels for each lead
    for (let lead of leads) {
      const [labels] = await pool.execute(
        `SELECT label FROM lead_labels WHERE lead_id = ?`,
        [lead.id]
      );
      lead.labels = labels.map(l => l.label);
    }

    res.json({
      success: true,
      data: leads,
      pagination: getPaginationMeta(total, page, pageSize)
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
      owner_id, status, source, address,
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

/**
 * Get leads overview statistics
 * GET /api/v1/leads/overview
 */
const getOverview = async (req, res) => {
  try {
    const { date_range = 'all', start_date, end_date } = req.query;
    const companyId = req.companyId;

    // Calculate date range
    let dateFilter = '';
    const dateParams = [];
    
    if (date_range === 'today') {
      dateFilter = 'AND DATE(l.created_at) = CURDATE()';
    } else if (date_range === 'this_week') {
      dateFilter = 'AND YEARWEEK(l.created_at, 1) = YEARWEEK(CURDATE(), 1)';
    } else if (date_range === 'this_month') {
      dateFilter = 'AND YEAR(l.created_at) = YEAR(CURDATE()) AND MONTH(l.created_at) = MONTH(CURDATE())';
    } else if (date_range === 'custom' && start_date && end_date) {
      dateFilter = 'AND DATE(l.created_at) BETWEEN ? AND ?';
      dateParams.push(start_date, end_date);
    }

    // Total Leads
    const [totalLeadsResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l 
       WHERE l.company_id = ? AND l.is_deleted = 0 ${dateFilter}`,
      [companyId, ...dateParams]
    );
    const totalLeads = totalLeadsResult[0].count;

    // New Leads
    const [newLeadsResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l 
       WHERE l.company_id = ? AND l.is_deleted = 0 AND l.status = 'New' ${dateFilter}`,
      [companyId, ...dateParams]
    );
    const newLeads = newLeadsResult[0].count;

    // Converted Leads (Won)
    const [convertedLeadsResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l 
       WHERE l.company_id = ? AND l.is_deleted = 0 AND l.status = 'Won' ${dateFilter}`,
      [companyId, ...dateParams]
    );
    const convertedLeads = convertedLeadsResult[0].count;

    // Lost Leads
    const [lostLeadsResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l 
       WHERE l.company_id = ? AND l.is_deleted = 0 AND l.status = 'Lost' ${dateFilter}`,
      [companyId, ...dateParams]
    );
    const lostLeads = lostLeadsResult[0].count;

    // Lead Sources Distribution
    const [sourcesResult] = await pool.execute(
      `SELECT 
        COALESCE(l.source, 'Unknown') as source,
        COUNT(*) as count
       FROM leads l
       WHERE l.company_id = ? AND l.is_deleted = 0 ${dateFilter}
       GROUP BY l.source
       ORDER BY count DESC
       LIMIT 10`,
      [companyId, ...dateParams]
    );

    // Lead Status Distribution
    const [statusResult] = await pool.execute(
      `SELECT 
        l.status,
        COUNT(*) as count
       FROM leads l
       WHERE l.company_id = ? AND l.is_deleted = 0 ${dateFilter}
       GROUP BY l.status
       ORDER BY count DESC`,
      [companyId, ...dateParams]
    );

    // Assigned Users
    let assignedUsersQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(l.id) as leads_count
       FROM users u
       LEFT JOIN leads l ON l.owner_id = u.id AND l.company_id = ? AND l.is_deleted = 0
    `;
    const assignedUsersParams = [companyId];
    
    if (dateFilter) {
      assignedUsersQuery += dateFilter.replace('l.company_id = ?', '');
      assignedUsersParams.push(...dateParams);
    }
    
    assignedUsersQuery += `
       WHERE u.company_id = ? AND u.is_deleted = 0
       GROUP BY u.id, u.name, u.email
       HAVING leads_count > 0
       ORDER BY leads_count DESC
       LIMIT 10
    `;
    assignedUsersParams.push(companyId);
    
    const [assignedUsersResult] = await pool.execute(assignedUsersQuery, assignedUsersParams);

    // Follow-up Today
    const [followUpTodayResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l
       WHERE l.company_id = ? AND l.is_deleted = 0 
       AND DATE(l.due_followup) = CURDATE()`,
      [companyId]
    );
    const followUpToday = followUpTodayResult[0].count;

    // Follow-up Upcoming (next 7 days)
    const [followUpUpcomingResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM leads l
       WHERE l.company_id = ? AND l.is_deleted = 0 
       AND DATE(l.due_followup) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
      [companyId]
    );
    const followUpUpcoming = followUpUpcomingResult[0].count;

    // Revenue/Value Summary
    const [revenueResult] = await pool.execute(
      `SELECT 
        COALESCE(SUM(l.value), 0) as total_value,
        COALESCE(SUM(CASE WHEN l.status = 'Won' THEN l.value ELSE 0 END), 0) as converted_value,
        COALESCE(AVG(l.value), 0) as avg_value
       FROM leads l
       WHERE l.company_id = ? AND l.is_deleted = 0 ${dateFilter}`,
      [companyId, ...dateParams]
    );
    const revenue = revenueResult[0];

    res.json({
      success: true,
      data: {
        totals: {
          total_leads: totalLeads,
          new_leads: newLeads,
          converted_leads: convertedLeads,
          lost_leads: lostLeads,
        },
        sources: sourcesResult,
        statuses: statusResult,
        assigned_users: assignedUsersResult,
        follow_ups: {
          today: followUpToday,
          upcoming: followUpUpcoming,
        },
        revenue: {
          total_value: parseFloat(revenue.total_value) || 0,
          converted_value: parseFloat(revenue.converted_value) || 0,
          avg_value: parseFloat(revenue.avg_value) || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get leads overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leads overview',
    });
  }
};

/**
 * Update lead status (for Kanban drag-drop)
 * PUT /api/v1/leads/:id/update-status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, change_reason } = req.body;
    const companyId = req.companyId;
    const userId = req.userId;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    // Get current status
    const [leads] = await pool.execute(
      `SELECT status FROM leads WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, companyId]
    );

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    const oldStatus = leads[0].status;

    // Update status
    await pool.execute(
      `UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`,
      [status, id, companyId]
    );

    // Log status change
    await pool.execute(
      `INSERT INTO lead_status_history (company_id, lead_id, old_status, new_status, changed_by, change_reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, id, oldStatus, status, userId, change_reason || null]
    );

    // Get updated lead
    const [updatedLeads] = await pool.execute(
      `SELECT * FROM leads WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedLeads[0],
      message: 'Lead status updated successfully',
    });
  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update lead status',
    });
  }
};

/**
 * Bulk actions on leads
 * POST /api/v1/leads/bulk-action
 */
const bulkAction = async (req, res) => {
  try {
    const { lead_ids, action, data } = req.body;
    const companyId = req.companyId;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'lead_ids array is required',
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required',
      });
    }

    const placeholders = lead_ids.map(() => '?').join(',');
    let query = '';
    const params = [];

    switch (action) {
      case 'delete':
        query = `UPDATE leads SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id IN (${placeholders}) AND company_id = ?`;
        params.push(...lead_ids, companyId);
        break;

      case 'assign':
        if (!data || !data.owner_id) {
          return res.status(400).json({
            success: false,
            error: 'owner_id is required for assign action',
          });
        }
        query = `UPDATE leads SET owner_id = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id IN (${placeholders}) AND company_id = ?`;
        params.push(data.owner_id, ...lead_ids, companyId);
        break;

      case 'change_status':
        if (!data || !data.status) {
          return res.status(400).json({
            success: false,
            error: 'status is required for change_status action',
          });
        }
        query = `UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id IN (${placeholders}) AND company_id = ?`;
        params.push(data.status, ...lead_ids, companyId);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Supported: delete, assign, change_status',
        });
    }

    const [result] = await pool.execute(query, params);

    res.json({
      success: true,
      data: {
        affected_rows: result.affectedRows,
      },
      message: `Bulk action '${action}' completed successfully`,
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk action',
    });
  }
};

/**
 * Get all contacts (for Leads Contacts tab)
 * GET /api/v1/leads/contacts
 */
const getAllContacts = async (req, res) => {
  try {
    const { page, pageSize, limit, offset } = parsePagination(req.query);
    const companyId = req.companyId;
    const { contact_type, status, search, lead_id } = req.query;

    let whereClause = 'WHERE c.company_id = ? AND c.is_deleted = 0';
    const params = [companyId];

    if (contact_type) {
      whereClause += ' AND c.contact_type = ?';
      params.push(contact_type);
    }
    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }
    if (lead_id) {
      whereClause += ' AND c.lead_id = ?';
      params.push(lead_id);
    }
    if (search) {
      whereClause += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.company LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM contacts c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [contacts] = await pool.execute(
      `SELECT 
        c.*,
        u.name as assigned_user_name,
        u.email as assigned_user_email,
        l.person_name as lead_name,
        l.company_name as lead_company_name
       FROM contacts c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       LEFT JOIN leads l ON c.lead_id = l.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: contacts,
      pagination: getPaginationMeta(total, page, pageSize),
    });
  } catch (error) {
    console.error('Get all contacts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
    });
  }
};

/**
 * Get contact by ID
 * GET /api/v1/leads/contacts/:id
 */
const getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;

    const [contacts] = await pool.execute(
      `SELECT 
        c.*,
        u.name as assigned_user_name,
        u.email as assigned_user_email,
        l.person_name as lead_name,
        l.company_name as lead_company_name
       FROM contacts c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.id = ? AND c.company_id = ? AND c.is_deleted = 0`,
      [id, companyId]
    );

    if (contacts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    // Get activities for this contact
    const [activities] = await pool.execute(
      `SELECT * FROM lead_activities 
       WHERE lead_id = ? AND is_deleted = 0
       ORDER BY activity_date DESC
       LIMIT 20`,
      [contacts[0].lead_id || 0]
    );
    contacts[0].activities = activities || [];

    res.json({
      success: true,
      data: contacts[0],
    });
  } catch (error) {
    console.error('Get contact by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact',
    });
  }
};

/**
 * Create contact
 * POST /api/v1/leads/contacts
 */
const createContact = async (req, res) => {
  try {
    const {
      lead_id,
      name,
      company,
      company_id,
      email,
      phone,
      contact_type = 'Client',
      assigned_user_id,
      status = 'Active',
      notes,
    } = req.body;
    const companyId = req.companyId;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    // If company_id is provided, fetch company name from companies table
    let finalCompanyName = company || null;
    if (company_id) {
      try {
        const [companyData] = await pool.execute(
          'SELECT name FROM companies WHERE id = ? AND company_id = ?',
          [company_id, companyId]
        );
        if (companyData.length > 0) {
          finalCompanyName = companyData[0].name;
        }
      } catch (err) {
        console.error('Error fetching company name:', err);
        // Continue with provided company name or null
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts (
        company_id, lead_id, name, company, email, phone,
        contact_type, assigned_user_id, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        lead_id || null,
        name,
        finalCompanyName,
        email || null,
        phone || null,
        contact_type,
        assigned_user_id || null,
        status,
        notes || null,
      ]
    );

    const [newContact] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: newContact[0],
      message: 'Contact created successfully',
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contact',
    });
  }
};

/**
 * Update contact
 * PUT /api/v1/leads/contacts/:id
 */
const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    const companyId = req.companyId;

    const [existing] = await pool.execute(
      `SELECT id FROM contacts WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, companyId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    const allowedFields = [
      'name',
      'company',
      'email',
      'phone',
      'contact_type',
      'assigned_user_id',
      'status',
      'notes',
      'lead_id',
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        values.push(updateFields[field] === undefined ? null : updateFields[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, companyId);

    await pool.execute(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
      values
    );

    const [updatedContact] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: updatedContact[0],
      message: 'Contact updated successfully',
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contact',
    });
  }
};

/**
 * Delete contact (soft delete)
 * DELETE /api/v1/leads/contacts/:id
 */
const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;

    const [result] = await pool.execute(
      `UPDATE contacts SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully',
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contact',
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteLead,
  convertToClient,
  getOverview,
  updateStatus,
  bulkAction,
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};

