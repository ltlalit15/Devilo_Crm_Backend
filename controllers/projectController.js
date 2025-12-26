// =====================================================
// Project Controller
// =====================================================

const pool = require('../config/db');

/**
 * Get all projects
 * GET /api/v1/projects
 * Supports: search, status, client_id, company_id, priority (label), project_type (category), 
 *           assigned_user_id, start_date, end_date, sort_by, sort_order
 */
const getAll = async (req, res) => {
  try {
    const { 
      status, 
      client_id, 
      company_id,
      search,
      priority,
      project_type,
      project_category,
      assigned_user_id,
      project_manager_id,
      start_date,
      end_date,
      sort_by = 'created_at',
      sort_order = 'DESC',
      upcoming,
      progress_min,
      progress_max
    } = req.query;

    // Admin must provide company_id - required for filtering
    const filterCompanyId = company_id || req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'company_id is required'
      });
    }
    
    let whereClause = 'WHERE p.company_id = ? AND p.is_deleted = 0';
    const params = [filterCompanyId];

    // Status filter
    if (status && status !== 'All Projects' && status !== 'all') {
      if (status === 'Open Projects') {
        whereClause += ' AND (p.status = ? OR p.status = ?)';
        params.push('in progress', 'open');
      } else if (status === 'Completed') {
        whereClause += ' AND p.status = ?';
        params.push('completed');
      } else {
        whereClause += ' AND p.status = ?';
        params.push(status.toLowerCase());
      }
    }

    // Client filter
    if (client_id) {
      whereClause += ' AND p.client_id = ?';
      params.push(client_id);
    }

    // Priority filter (label)
    if (priority) {
      whereClause += ' AND p.label = ?';
      params.push(priority);
    }

    // Project type/category filter
    if (project_type || project_category) {
      whereClause += ' AND (p.project_category = ? OR p.project_sub_category = ?)';
      params.push(project_type || project_category, project_type || project_category);
    }

    // Assigned user filter (project manager or team member)
    if (assigned_user_id || project_manager_id) {
      const userId = assigned_user_id || project_manager_id;
      whereClause += ` AND (p.project_manager_id = ? OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?
      ))`;
      params.push(userId, userId);
    }

    // Date range filters
    if (start_date) {
      whereClause += ' AND DATE(p.start_date) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND DATE(p.deadline) <= ?';
      params.push(end_date);
    }

    // Upcoming filter (future start dates)
    if (upcoming === 'true' || upcoming === true) {
      whereClause += ' AND DATE(p.start_date) > CURDATE()';
    }

    // Progress range filters
    if (progress_min !== undefined) {
      whereClause += ' AND p.progress >= ?';
      params.push(progress_min);
    }
    if (progress_max !== undefined) {
      whereClause += ' AND p.progress <= ?';
      params.push(progress_max);
    }

    // Search filter (project name, code, client name)
    if (search) {
      whereClause += ` AND (
        p.project_name LIKE ? OR 
        p.short_code LIKE ? OR 
        c.company_name LIKE ? OR
        p.description LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Validate and set sort column
    const allowedSortColumns = {
      'id': 'p.id',
      'project_name': 'p.project_name',
      'short_code': 'p.short_code',
      'status': 'p.status',
      'start_date': 'p.start_date',
      'deadline': 'p.deadline',
      'progress': 'p.progress',
      'budget': 'p.budget',
      'created_at': 'p.created_at',
      'client_name': 'c.company_name',
      'company_name': 'comp.name'
    };
    
    const sortColumn = allowedSortColumns[sort_by] || 'p.created_at';
    const sortDirection = (sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get all projects without pagination
    const [projects] = await pool.execute(
      `SELECT p.*, 
              c.company_name as client_name,
              comp.name as company_name,
              d.name as department_name,
              pm_user.name as project_manager_name,
              pm_user.email as project_manager_email
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN companies comp ON p.company_id = comp.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN users pm_user ON p.project_manager_id = pm_user.id
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}`,
      params
    );

    // Get members for each project
    for (let project of projects) {
      const [members] = await pool.execute(
        `SELECT u.id, u.name, u.email FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = ?`,
        [project.id]
      );
      project.members = members;
    }

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
};

/**
 * Get project by ID
 * GET /api/v1/projects/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Admin must provide company_id - required for filtering
    const companyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'company_id is required'
      });
    }

    const [projects] = await pool.execute(
      `SELECT p.*, 
              c.company_name as client_name,
              comp.name as company_name,
              d.name as department_name,
              pm_user.name as project_manager_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN companies comp ON p.company_id = comp.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN users pm_user ON p.project_manager_id = pm_user.id
       WHERE p.id = ? AND p.company_id = ? AND p.is_deleted = 0`,
      [id, companyId]
    );

    if (projects.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const project = projects[0];

    // Get members
    const [members] = await pool.execute(
      `SELECT u.id, u.name, u.email FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
      [project.id]
    );
    project.members = members;

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project'
    });
  }
};

/**
 * Create project
 * POST /api/v1/projects
 */
const create = async (req, res) => {
  try {
    const {
      company_id, short_code, project_name, description, start_date, deadline, no_deadline,
      budget, project_category, project_sub_category, department_id, client_id,
      project_manager_id, project_summary, notes, public_gantt_chart, public_task_board,
      task_approval, label, project_members = [], status, progress
    } = req.body;

    // Validation
    if (!company_id || !short_code || !project_name || !start_date || !client_id || !project_manager_id) {
      return res.status(400).json({
        success: false,
        error: 'company_id, short_code, project_name, start_date, client_id, and project_manager_id are required'
      });
    }

    // Insert project
    const [result] = await pool.execute(
      `INSERT INTO projects (
        company_id, short_code, project_name, description, start_date, deadline, no_deadline,
        budget, project_category, project_sub_category, department_id, client_id,
        project_manager_id, project_summary, notes, public_gantt_chart, public_task_board,
        task_approval, label, status, progress, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, short_code, project_name, description || null, start_date, deadline,
        no_deadline || 0, budget || null, project_category || null, project_sub_category || null,
        department_id || null, client_id, project_manager_id, project_summary || null, notes || null,
        public_gantt_chart || 'enable', public_task_board || 'enable',
        task_approval || 'disable', label || null, status || 'in progress',
        progress || 0, req.userId || req.user?.id || 1
      ]
    );

    const projectId = result.insertId;

    // Insert members
    if (project_members.length > 0) {
      const memberValues = project_members.map(userId => [projectId, userId]);
      await pool.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ?`,
        [memberValues]
      );
    }

    // Get created project with joins
    const [projects] = await pool.execute(
      `SELECT p.*, 
              c.company_name as client_name,
              comp.name as company_name,
              d.name as department_name,
              pm_user.name as project_manager_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN companies comp ON p.company_id = comp.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN users pm_user ON p.project_manager_id = pm_user.id
       WHERE p.id = ?`,
      [projectId]
    );

    res.status(201).json({
      success: true,
      data: projects[0],
      message: 'Project created successfully'
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project'
    });
  }
};

/**
 * Update project
 * PUT /api/v1/projects/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if project exists
    const [projects] = await pool.execute(
      `SELECT id FROM projects WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (projects.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Build update query
    const allowedFields = [
      'company_id', 'project_name', 'description', 'start_date', 'deadline', 'no_deadline',
      'budget', 'project_category', 'project_sub_category', 'department_id', 'client_id',
      'project_manager_id', 'project_summary', 'notes', 'public_gantt_chart', 'public_task_board',
      'task_approval', 'label', 'status', 'progress'
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
      values.push(id);

      await pool.execute(
        `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Update members if provided
    if (updateFields.project_members) {
      await pool.execute(`DELETE FROM project_members WHERE project_id = ?`, [id]);
      if (updateFields.project_members.length > 0) {
        const memberValues = updateFields.project_members.map(userId => [id, userId]);
        await pool.query(
          `INSERT INTO project_members (project_id, user_id) VALUES ?`,
          [memberValues]
        );
      }
    }

    // Get updated project with joins
    const [updatedProjects] = await pool.execute(
      `SELECT p.*, 
              c.company_name as client_name,
              comp.name as company_name,
              d.name as department_name,
              pm_user.name as project_manager_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN companies comp ON p.company_id = comp.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN users pm_user ON p.project_manager_id = pm_user.id
       WHERE p.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedProjects[0],
      message: 'Project updated successfully'
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update project'
    });
  }
};

/**
 * Delete project (soft delete)
 * DELETE /api/v1/projects/:id
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE projects SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete project'
    });
  }
};

/**
 * Get filter options for projects
 * GET /api/v1/projects/filters
 */
const getFilters = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.companyId;
    
    let whereClause = 'WHERE p.is_deleted = 0';
    const params = [];
    
    if (companyId) {
      whereClause += ' AND p.company_id = ?';
      params.push(companyId);
    }

    // Get unique statuses
    const [statuses] = await pool.execute(
      `SELECT DISTINCT p.status FROM projects p ${whereClause} ORDER BY p.status`,
      params
    );

    // Get unique priorities/labels
    const [priorities] = await pool.execute(
      `SELECT DISTINCT p.label FROM projects p ${whereClause} AND p.label IS NOT NULL AND p.label != '' ORDER BY p.label`,
      params
    );

    // Get unique project categories
    const [categories] = await pool.execute(
      `SELECT DISTINCT p.project_category FROM projects p ${whereClause} AND p.project_category IS NOT NULL AND p.project_category != '' ORDER BY p.project_category`,
      params
    );

    // Get clients
    const [clients] = await pool.execute(
      `SELECT DISTINCT c.id, c.company_name 
       FROM clients c
       INNER JOIN projects p ON c.id = p.client_id
       ${whereClause}
       ORDER BY c.company_name`,
      params
    );

    // Get assigned users (project managers and team members)
    const [users] = await pool.execute(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       WHERE u.id IN (
         SELECT DISTINCT p.project_manager_id FROM projects p ${whereClause}
         UNION
         SELECT DISTINCT pm.user_id FROM project_members pm
         INNER JOIN projects p ON pm.project_id = p.id ${whereClause}
       )
       ORDER BY u.name`,
      params
    );

    res.json({
      success: true,
      data: {
        statuses: statuses.map(s => s.status),
        priorities: priorities.map(p => p.label),
        categories: categories.map(c => c.project_category),
        clients: clients,
        assigned_users: users
      }
    });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filter options'
    });
  }
};

/**
 * Upload file to project
 * POST /api/v1/projects/:id/upload
 */
const uploadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const { description } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    // Check if project exists
    const [projects] = await pool.execute(
      `SELECT id FROM projects WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (projects.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const path = require('path');
    const filePath = `/uploads/${file.filename}`;
    const fileName = file.originalname;
    const fileSize = file.size;
    const fileType = path.extname(fileName).toLowerCase();

    // Check if project_files table exists, if not create entry in documents table
    try {
      // Try to insert into project_files table
      const [result] = await pool.execute(
        `INSERT INTO project_files (project_id, user_id, file_path, file_name, file_size, file_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.userId || req.user?.id || 1, filePath, fileName, fileSize, fileType, description || null]
      );

      // Get created file
      const [files] = await pool.execute(
        `SELECT pf.*, u.name as user_name
         FROM project_files pf
         LEFT JOIN users u ON pf.user_id = u.id
         WHERE pf.id = ?`,
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        data: files[0],
        message: 'File uploaded successfully'
      });
    } catch (tableError) {
      // If project_files table doesn't exist, use documents table
      if (tableError.code === 'ER_NO_SUCH_TABLE') {
        const [result] = await pool.execute(
          `INSERT INTO documents (company_id, document_name, file_path, file_size, file_type, document_type, related_id, related_type, created_by, description)
           VALUES (?, ?, ?, ?, ?, 'project', ?, 'project', ?, ?)`,
          [
            req.companyId || 1,
            fileName,
            filePath,
            fileSize,
            fileType,
            id,
            req.userId || req.user?.id || 1,
            description || null
          ]
        );

        res.status(201).json({
          success: true,
          data: {
            id: result.insertId,
            file_path: filePath,
            file_name: fileName,
            file_size: fileSize,
            file_type: fileType
          },
          message: 'File uploaded successfully'
        });
      } else {
        throw tableError;
      }
    }
  } catch (error) {
    console.error('Upload project file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteProject,
  getFilters,
  uploadFile
};

