// =====================================================
// Project Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all projects
 * GET /api/v1/projects
 */
const getAll = async (req, res) => {
  try {
    const { status, client_id, company_id } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    // Only filter by company_id if explicitly provided in query params
    // Don't use req.companyId automatically - show all projects by default
    const filterCompanyId = company_id;
    
    let whereClause = 'WHERE p.is_deleted = 0';
    const params = [];

    // Add company filter only if explicitly requested via query param
    if (filterCompanyId) {
      whereClause += ' AND p.company_id = ?';
      params.push(filterCompanyId);
    }

    if (status) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }
    if (client_id) {
      whereClause += ' AND p.client_id = ?';
      params.push(client_id);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM projects p ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated projects with joins - LIMIT and OFFSET as template literals (not placeholders)
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
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
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
      data: projects,
      pagination: getPaginationMeta(total, page, pageSize)
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
       WHERE p.id = ? AND p.is_deleted = 0`,
      [id]
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

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteProject
};

