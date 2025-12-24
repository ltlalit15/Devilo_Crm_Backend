// =====================================================
// Client Controller
// =====================================================

const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all clients
 * GET /api/v1/clients
 */
const getAll = async (req, res) => {
  try {
    const { status, search } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    let whereClause = 'WHERE c.company_id = ? AND c.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }
    if (search) {
      whereClause += ' AND (c.company_name LIKE ? OR c.phone_number LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM clients c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated clients - LIMIT and OFFSET as template literals (not placeholders)
    const [clients] = await pool.execute(
      `SELECT c.*, u.name as owner_name
       FROM clients c
       LEFT JOIN users u ON c.owner_id = u.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Get contacts, groups, and labels for each client
    for (let client of clients) {
      const [contacts] = await pool.execute(
        `SELECT * FROM client_contacts WHERE client_id = ? AND is_deleted = 0`,
        [client.id]
      );
      client.contacts = contacts;

      const [groups] = await pool.execute(
        `SELECT group_name FROM client_groups WHERE client_id = ?`,
        [client.id]
      );
      client.groups = groups.map(g => g.group_name);

      const [labels] = await pool.execute(
        `SELECT label FROM client_labels WHERE client_id = ?`,
        [client.id]
      );
      client.labels = labels.map(l => l.label);
    }

    res.json({
      success: true,
      data: clients,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients'
    });
  }
};

/**
 * Get client by ID
 * GET /api/v1/clients/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [clients] = await pool.execute(
      `SELECT c.*, u.name as owner_name
       FROM clients c
       LEFT JOIN users u ON c.owner_id = u.id
       WHERE c.id = ? AND c.company_id = ? AND c.is_deleted = 0`,
      [id, req.companyId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    const client = clients[0];

    // Get contacts
    const [contacts] = await pool.execute(
      `SELECT * FROM client_contacts WHERE client_id = ? AND is_deleted = 0`,
      [client.id]
    );
    client.contacts = contacts;

    // Get groups
    const [groups] = await pool.execute(
      `SELECT group_name FROM client_groups WHERE client_id = ?`,
      [client.id]
    );
    client.groups = groups.map(g => g.group_name);

    // Get labels
    const [labels] = await pool.execute(
      `SELECT label FROM client_labels WHERE client_id = ?`,
      [client.id]
    );
    client.labels = labels.map(l => l.label);

    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client'
    });
  }
};

/**
 * Create client
 * POST /api/v1/clients
 */
const create = async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    const {
      company_name, email, password, address, city, state, zip,
      country, phone_country_code, phone_number, website, vat_number,
      gst_number, currency, currency_symbol, disable_online_payment,
      status, groups = [], labels = []
    } = req.body;

    // Validation
    if (!company_name || !email || !password) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'company_name, email, and password are required'
      });
    }

    // Check if user already exists
    const [existingUsers] = await connection.execute(
      `SELECT id FROM users WHERE email = ? AND company_id = ?`,
      [email, req.companyId]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create user account first
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.execute(
      `INSERT INTO users (company_id, name, email, password, role, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.companyId ?? null,
        company_name, // Use company name as user name
        email,
        hashedPassword,
        'CLIENT', // Auto-set role to CLIENT
        status || 'Active'
      ]
    );

    const ownerId = userResult.insertId;

    // Insert client
    const [result] = await connection.execute(
      `INSERT INTO clients (
        company_id, company_name, owner_id, address, city, state, zip, country,
        phone_country_code, phone_number, website, vat_number, gst_number,
        currency, currency_symbol, disable_online_payment, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId, company_name, ownerId, address, city, state, zip,
        country || 'United States', phone_country_code || '+1', phone_number,
        website, vat_number, gst_number, currency || 'USD',
        currency_symbol || '$', disable_online_payment || 0, status || 'Active'
      ]
    );

    const clientId = result.insertId;

    // Insert groups
    if (groups.length > 0) {
      for (const groupName of groups) {
        await connection.execute(
          `INSERT INTO client_groups (client_id, group_name) VALUES (?, ?)`,
          [clientId, groupName]
        );
      }
    }

    // Insert labels
    if (labels.length > 0) {
      for (const label of labels) {
        await connection.execute(
          `INSERT INTO client_labels (client_id, label) VALUES (?, ?)`,
          [clientId, label]
        );
      }
    }

    await connection.commit();
    connection.release();

    // Get created client with user details (use pool after transaction is committed)
    const [clients] = await pool.execute(
      `SELECT c.*, u.email, u.name as owner_name
       FROM clients c
       JOIN users u ON c.owner_id = u.id
       WHERE c.id = ?`,
      [clientId]
    );

    res.status(201).json({
      success: true,
      data: clients[0],
      message: 'Client created successfully'
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Create client error:', error);
    console.error('Error details:', {
      message: error.message,
      sqlMessage: error.sqlMessage,
      code: error.code,
      errno: error.errno,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.sqlMessage || error.message || 'Failed to create client'
    });
  }
};

/**
 * Update client
 * PUT /api/v1/clients/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if client exists
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Build update query
    const allowedFields = [
      'company_name', 'owner_id', 'address', 'city', 'state', 'zip', 'country',
      'phone_country_code', 'phone_number', 'website', 'vat_number', 'gst_number',
      'currency', 'currency_symbol', 'disable_online_payment', 'status'
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (updateFields.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        values.push(updateFields[field]);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, req.companyId);

      await pool.execute(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
        values
      );
    }

    // Update groups if provided
    if (updateFields.groups) {
      await pool.execute(`DELETE FROM client_groups WHERE client_id = ?`, [id]);
      if (updateFields.groups.length > 0) {
        const groupValues = updateFields.groups.map(groupName => [id, groupName]);
        await pool.query(
          `INSERT INTO client_groups (client_id, group_name) VALUES ?`,
          [groupValues]
        );
      }
    }

    // Update labels if provided
    if (updateFields.labels) {
      await pool.execute(`DELETE FROM client_labels WHERE client_id = ?`, [id]);
      if (updateFields.labels.length > 0) {
        const labelValues = updateFields.labels.map(label => [id, label]);
        await pool.query(
          `INSERT INTO client_labels (client_id, label) VALUES ?`,
          [labelValues]
        );
      }
    }

    // Get updated client
    const [updatedClients] = await pool.execute(
      `SELECT * FROM clients WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedClients[0],
      message: 'Client updated successfully'
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update client'
    });
  }
};

/**
 * Delete client (soft delete)
 * DELETE /api/v1/clients/:id
 */
const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE clients SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete client'
    });
  }
};

/**
 * Add client contact
 * POST /api/v1/clients/:id/contacts
 */
const addContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, job_title, email, phone, is_primary } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'name and email are required'
      });
    }

    // Check if client exists
    const [clients] = await pool.execute(
      `SELECT id FROM clients WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // If setting as primary, unset other primary contacts
    if (is_primary) {
      await pool.execute(
        `UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?`,
        [id]
      );
    }

    // Insert contact
    const [result] = await pool.execute(
      `INSERT INTO client_contacts (
        client_id, name, job_title, email, phone, is_primary
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, job_title, email, phone, is_primary || 0]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: 'Contact added successfully'
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add contact'
    });
  }
};

/**
 * Get client contacts
 * GET /api/v1/clients/:id/contacts
 */
const getContacts = async (req, res) => {
  try {
    const { id } = req.params;

    const [contacts] = await pool.execute(
      `SELECT * FROM client_contacts
       WHERE client_id = ? AND is_deleted = 0
       ORDER BY is_primary DESC, created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteClient,
  addContact,
  getContacts
};

