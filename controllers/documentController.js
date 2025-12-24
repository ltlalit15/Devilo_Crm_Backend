const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const { parsePagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Get all documents for current user
 * GET /api/v1/documents
 */
const getAll = async (req, res) => {
  try {
    const { category } = req.query;
    
    // Parse pagination parameters
    const { page, pageSize, limit, offset } = parsePagination(req.query);

    let whereClause = 'WHERE d.company_id = ? AND d.is_deleted = 0';
    const params = [req.companyId];

    // For employees, only show their own documents
    if (req.user.role === 'EMPLOYEE') {
      whereClause += ' AND d.user_id = ?';
      params.push(req.userId);
    } else if (req.user.role === 'CLIENT') {
      whereClause += ' AND d.user_id = ?';
      params.push(req.userId);
    }
    // Admin can see all company documents

    if (category) {
      whereClause += ' AND d.category = ?';
      params.push(category);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM documents d ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated documents - LIMIT and OFFSET as template literals (not placeholders)
    const [documents] = await pool.execute(
      `SELECT d.*, u.name as user_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Format file size
    const formattedDocuments = documents.map(doc => ({
      ...doc,
      size: doc.file_size ? formatFileSize(doc.file_size) : '-',
      date: formatDate(doc.created_at),
    }));

    res.json({
      success: true,
      data: formattedDocuments,
      pagination: getPaginationMeta(total, page, pageSize)
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
};

/**
 * Get document by ID
 * GET /api/v1/documents/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    let whereClause = 'WHERE d.id = ? AND d.company_id = ? AND d.is_deleted = 0';
    const params = [id, req.companyId];

    // For employees/clients, only allow access to their own documents
    if (req.user.role === 'EMPLOYEE' || req.user.role === 'CLIENT') {
      whereClause += ' AND d.user_id = ?';
      params.push(req.userId);
    }

    const [documents] = await pool.execute(
      `SELECT d.*, u.name as user_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       ${whereClause}`,
      params
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const doc = documents[0];
    res.json({
      success: true,
      data: {
        ...doc,
        size: doc.file_size ? formatFileSize(doc.file_size) : '-',
        date: formatDate(doc.created_at),
      }
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document'
    });
  }
};

/**
 * Create/Upload document
 * POST /api/v1/documents
 */
const create = async (req, res) => {
  try {
    const { title, category, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    // Get file info
    const filePath = file.path;
    const fileName = file.originalname;
    const fileSize = file.size;
    const fileType = path.extname(fileName).toLowerCase();

    const [result] = await pool.execute(
      `INSERT INTO documents (
        company_id, user_id, title, category, file_path, file_name, file_size, file_type, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.companyId,
        req.userId, // Current user's documents
        title,
        category || null,
        filePath,
        fileName,
        fileSize,
        fileType,
        description || null
      ]
    );

    const [documents] = await pool.execute(
      `SELECT d.*, u.name as user_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [result.insertId]
    );

    const doc = documents[0];
    res.status(201).json({
      success: true,
      data: {
        ...doc,
        size: doc.file_size ? formatFileSize(doc.file_size) : '-',
        date: formatDate(doc.created_at),
      },
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload document'
    });
  }
};

/**
 * Delete document
 * DELETE /api/v1/documents/:id
 */
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Get document first to check permissions and file path
    let whereClause = 'WHERE d.id = ? AND d.company_id = ? AND d.is_deleted = 0';
    const params = [id, req.companyId];

    // For employees/clients, only allow deletion of their own documents
    if (req.user.role === 'EMPLOYEE' || req.user.role === 'CLIENT') {
      whereClause += ' AND d.user_id = ?';
      params.push(req.userId);
    }

    const [documents] = await pool.execute(
      `SELECT d.* FROM documents d ${whereClause}`,
      params
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const doc = documents[0];

    // Soft delete
    await pool.execute(
      `UPDATE documents SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    // Optionally delete physical file
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try {
        fs.unlinkSync(doc.file_path);
      } catch (err) {
        console.error('Error deleting file:', err);
        // Continue even if file deletion fails
      }
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document'
    });
  }
};

/**
 * Download document
 * GET /api/v1/documents/:id/download
 */
const download = async (req, res) => {
  try {
    const { id } = req.params;

    let whereClause = 'WHERE d.id = ? AND d.company_id = ? AND d.is_deleted = 0';
    const params = [id, req.companyId];

    // For employees/clients, only allow download of their own documents
    if (req.user.role === 'EMPLOYEE' || req.user.role === 'CLIENT') {
      whereClause += ' AND d.user_id = ?';
      params.push(req.userId);
    }

    const [documents] = await pool.execute(
      `SELECT d.* FROM documents d ${whereClause}`,
      params
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const doc = documents[0];

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({
        success: false,
        error: 'File not found on server'
      });
    }

    res.download(doc.file_path, doc.file_name);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download document'
    });
  }
};

// Helper functions
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

module.exports = {
  getAll,
  getById,
  create,
  deleteDocument,
  download
};

