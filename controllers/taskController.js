// =====================================================
// Task Controller
// =====================================================

const pool = require('../config/db');

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

    // Admin must provide company_id - required for filtering
    const filterCompanyId = req.query.company_id || req.body.company_id || req.companyId;
    
    if (!filterCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'company_id is required'
      });
    }
    
    let whereClause = 'WHERE t.company_id = ? AND t.is_deleted = 0';
    const params = [filterCompanyId];

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

    // Get all tasks without pagination
    const [tasks] = await pool.execute(
      `SELECT t.*, p.project_name, p.short_code as project_code
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       ${whereClause}
       ORDER BY t.created_at DESC`,
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
      data: tasks
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
       WHERE t.id = ? AND t.is_deleted = 0`,
      [id]
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

    // Get comments
    const [comments] = await pool.execute(
      `SELECT tc.*, u.name as user_name, u.email as user_email, u.avatar
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = ? AND tc.is_deleted = 0
       ORDER BY tc.created_at ASC`,
      [task.id]
    );
    task.comments = comments;

    // Get files
    const [files] = await pool.execute(
      `SELECT tf.*, u.name as user_name
       FROM task_files tf
       JOIN users u ON tf.user_id = u.id
       WHERE tf.task_id = ? AND tf.is_deleted = 0
       ORDER BY tf.created_at DESC`,
      [task.id]
    );
    task.files = files;

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
    const companyId = req.body.company_id || req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "company_id is required"
      });
    }
    const code = await generateTaskCode(safeProjectId, companyId);

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
        companyId,
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
      `SELECT id FROM tasks WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Build update query
    const allowedFields = [
      'title', 'sub_description', 'task_category', 'project_id', 'company_id',
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
      values.push(id);

      await pool.execute(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
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
       WHERE id = ?`,
      [id]
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

/**
 * Add comment to task
 * POST /api/v1/tasks/:id/comments
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, file_path } = req.body;

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

    if (!comment) {
      return res.status(400).json({
        success: false,
        error: 'Comment is required'
      });
    }

    // Insert comment
    const [result] = await pool.execute(
      `INSERT INTO task_comments (task_id, user_id, comment, file_path)
       VALUES (?, ?, ?, ?)`,
      [id, req.userId, comment, file_path || null]
    );

    // Get created comment
    const [comments] = await pool.execute(
      `SELECT tc.*, u.name as user_name, u.email as user_email
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: comments[0],
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Add task comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
};

/**
 * Get task comments
 * GET /api/v1/tasks/:id/comments
 */
const getComments = async (req, res) => {
  try {
    const { id } = req.params;

    const [comments] = await pool.execute(
      `SELECT tc.*, u.name as user_name, u.email as user_email, u.avatar
       FROM task_comments tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = ? AND tc.is_deleted = 0
       ORDER BY tc.created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: comments
    });
  } catch (error) {
    console.error('Get task comments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments'
    });
  }
};

/**
 * Upload file to task
 * POST /api/v1/tasks/:id/files
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

    const path = require('path');
    const filePath = file.path;
    const fileName = file.originalname;
    const fileSize = file.size;
    const fileType = path.extname(fileName).toLowerCase();

    // Insert file
    const [result] = await pool.execute(
      `INSERT INTO task_files (task_id, user_id, file_path, file_name, file_size, file_type, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, filePath, fileName, fileSize, fileType, description || null]
    );

    // Get created file
    const [files] = await pool.execute(
      `SELECT tf.*, u.name as user_name
       FROM task_files tf
       JOIN users u ON tf.user_id = u.id
       WHERE tf.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: files[0],
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Upload task file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file'
    });
  }
};

/**
 * Get task files
 * GET /api/v1/tasks/:id/files
 */
const getFiles = async (req, res) => {
  try {
    const { id } = req.params;

    const [files] = await pool.execute(
      `SELECT tf.*, u.name as user_name
       FROM task_files tf
       JOIN users u ON tf.user_id = u.id
       WHERE tf.task_id = ? AND tf.is_deleted = 0
       ORDER BY tf.created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error('Get task files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch files'
    });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: deleteTask,
  addComment,
  getComments,
  uploadFile,
  getFiles
};

