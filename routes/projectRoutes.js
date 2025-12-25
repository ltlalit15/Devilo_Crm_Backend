// =====================================================
// Project Routes
// =====================================================

const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');

// GET routes don't require token - faster API calls
router.get('/filters', optionalAuth, projectController.getFilters);
router.get('/', optionalAuth, projectController.getAll);
router.get('/:id', optionalAuth, projectController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), projectController.create);
router.post('/:id/upload', optionalAuth, requireRole(['ADMIN']), uploadMultiple('file', 10), handleUploadError, projectController.uploadFile);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), projectController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), projectController.delete);

module.exports = router;

