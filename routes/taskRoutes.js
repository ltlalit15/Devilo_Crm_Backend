// =====================================================
// Task Routes
// =====================================================

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, taskController.getAll);
router.get('/:id', optionalAuth, taskController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), taskController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), taskController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), taskController.delete);

// Task comments routes
router.get('/:id/comments', optionalAuth, taskController.getComments);
router.post('/:id/comments', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), taskController.addComment);

// Task files routes
router.get('/:id/files', optionalAuth, taskController.getFiles);
router.post('/:id/files', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), uploadSingle('file'), handleUploadError, taskController.uploadFile);

module.exports = router;

