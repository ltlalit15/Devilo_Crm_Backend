// =====================================================
// Task Controller
// =====================================================

const pool = require('../config/db');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Generate task code
 */
const generateTaskCode = async (projectId, companyId) => {
  if (!projectId) {
    const [result] = await pool.execute(
      `SELECT COUNT(*) as count FROM tasks WHERE company_id = ? AND project_id IS NULL`,
      [companyId]
    );
    const nextNum = (result[0].count || 0) + 1;
    return `TASK-${String(nextNum).padStart(4, '0')}`;
  }

  // Get project code
  const [projects] = await pool.execute(
    `SELECT short_code FROM projects WHERE id = ?`,
    [projectId]
  );

  if (projects.length === 0) {
    return `TASK-${Date.now()}`;
  }

  const projectCode = projects[0].short_code;

  // Get task count for this project
  const [result] = await pool.execute(
    `SELECT COUNT(*) as count FROM tasks WHERE project_id = ?`,
    [projectId]
  );

  const nextNum = (result[0].count || 0) + 1;
  return `${projectCode}-${nextNum}`;
};

/**
 * Get all tasks
 * GET /api/v1/tasks
 */
const getAll = async (req, res) => {
  try {
    const { status, project_id, assigned_to } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    let whereClause = 'WHERE t.company_id = ? AND t.is_deleted = 0';
    const params = [req.companyId];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }
    if (project_id) {
      whereClause += ' AND t.project_id = ?';
      params.push(project_id);
    }
    if (assigned_to) {
      whereClause += ` AND t.id IN (
        SELECT task_id FROM task_assignees WHERE user_id = ?
      )`;
      params.push(assigned_to);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated tasks - LIMIT and OFFSET as template literals (not placeholders)
    const [tasks] = await pool.execute(
      `SELECT t.*, p.project_name, p.short_code as project_code
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Get assignees and tags for each task
    for (let task of tasks) {
      const [assignees] = await pool.execute(
        `SELECT u.id, u.name, u.email FROM task_assignees ta
         JOIN users u ON ta.user_id = u.id
         WHERE ta.task_id = ?`,
        [task.id]
      );
      task.assigned_to = assignees;

      const [tags] = await pool.execute(
        `SELECT tag FROM task_tags WHERE task_id = ?`,
        [task.id]
      );
      task.tags = tags.map(t => t.tag);
    }

    res.json({
      success: true,
      data: tasks,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks'
    });
  }
};

/**
 * Get task by ID
 * GET /api/v1/tasks/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const [tasks] = await pool.execute(
      `SELECT t.*, p.project_name, p.short_code as project_code
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = ? AND t.company_id = ? AND t.is_deleted = 0`,
      [id, req.companyId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const task = tasks[0];

    // Get assignees
    const [assignees] = await pool.execute(
      `SELECT u.id, u.name, u.email FROM task_assignees ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.task_id = ?`,
      [task.id]
    );
    task.assigned_to = assignees;

    // Get tags
    const [tags] = await pool.execute(
      `SELECT tag FROM task_tags WHERE task_id = ?`,
      [task.id]
    );
    task.tags = tags.map(t => t.tag);

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task'
    });
  }
};

/**
 * Create task
 * POST /api/v1/tasks
 */
const create = async (req, res) => {
  try {
    const {
      title,
      sub_description,
      task_category,
      project_id,
      start_date,
      due_date,
      status,
      priority,
      estimated_time,
      description,
      assigned_to = [],
      tags = []
    } = req.body;

    // ===============================
    // VALIDATION
    // ===============================
    if (!title) {
      return res.status(400).json({
        success: false,
        error: "title is required"
      });
    }

    // ===============================
    // SAFE NULL HANDLING
    // ===============================
    const safeSubDescription = sub_description ?? null;
    const safeTaskCategory = task_category ?? null;
    const safeProjectId = project_id ?? null;
    const safeStartDate = start_date ?? null;
    const safeDueDate = due_date ?? null;
    const safePriority = priority ?? null;
    const safeEstimatedTime = estimated_time ?? null;
    const safeDescription = description ?? null;
    const safeStatus = status || "Incomplete";

    // ===============================
    // GENERATE TASK CODE
    // ===============================
    const code = await generateTaskCode(safeProjectId, req.companyId);

    // ===============================
    // INSERT TASK
    // ===============================
    const [result] = await pool.execute(
      `
      INSERT INTO tasks (
        company_id,
        code,
        title,
        sub_description,
        task_category,
        project_id,
        start_date,
        due_date,
        status,
        priority,
        estimated_time,
        description,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.companyId,
        code,
        title,
        safeSubDescription,
        safeTaskCategory,
        safeProjectId,
        safeStartDate,
        safeDueDate,
        safeStatus,
        safePriority,
        safeEstimatedTime,
        safeDescription,
        req.userId
      ]
    );

    const taskId = result.insertId;

    // ===============================
    // INSERT ASSIGNEES
    // ===============================
    if (Array.isArray(assigned_to) && assigned_to.length > 0) {
      const assigneeValues = assigned_to.map(userId => [taskId, userId]);

      await pool.query(
        `INSERT INTO task_assignees (task_id, user_id) VALUES ?`,
        [assigneeValues]
      );
    }

    // ===============================
    // INSERT TAGS
    // ===============================
    if (Array.isArray(tags) && tags.length > 0) {
      const tagValues = tags.map(tag => [taskId, tag]);

      await pool.query(
        `INSERT INTO task_tags (task_id, tag) VALUES ?`,
        [tagValues]
      );
    }

    // ===============================
    // FETCH CREATED TASK
    // ===============================
    const [tasks] = await pool.execute(
      `SELECT * FROM tasks WHERE id = ?`,
      [taskId]
    );

    res.status(201).json({
      success: true,
      data: tasks[0],
      message: "Task created successfully"
    });

  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create task"
    });
  }
};

/**
 * Update task
 * PUT /api/v1/tasks/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if task exists
    const [tasks] = await pool.execute(
      `SELECT id FROM tasks WHERE id = ? AND company_id = ? AND is_deleted = 0`,
      [id, req.companyId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Build update query
    const allowedFields = [
      'title', 'sub_description', 'task_category', 'project_id',
      'start_date', 'due_date', 'status', 'priority', 'estimated_time',
      'description', 'completed_on'
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
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`,
        values
      );
    }

    // Update assignees if provided
    if (updateFields.assigned_to) {
      await pool.execute(`DELETE FROM task_assignees WHERE task_id = ?`, [id]);
      if (updateFields.assigned_to.length > 0) {
        const assigneeValues = updateFields.assigned_to.map(userId => [id, userId]);
        await pool.query(
          `INSERT INTO task_assignees (task_id, user_id) VALUES ?`,
          [assigneeValues]
        );
      }
    }

    // Update tags if provided
    if (updateFields.tags) {
      await pool.execute(`DELETE FROM task_tags WHERE task_id = ?`, [id]);
      if (updateFields.tags.length > 0) {
        const tagValues = updateFields.tags.map(tag => [id, tag]);
        await pool.query(
          `INSERT INTO task_tags (task_id, tag) VALUES ?`,
          [tagValues]
        );
      }
    }

    // Get updated task
    const [updatedTasks] = await pool.execute(
      `SELECT * FROM tasks WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: updatedTasks[0],
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task'
    });
  }
};

/**
 * Delete task (soft delete)
 * DELETE /api/v1/tasks/:id
 */
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      `UPDATE tasks SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [id, req.companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete task'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteTask
};

