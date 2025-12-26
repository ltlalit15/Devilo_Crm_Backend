// =====================================================
// Task Routes
// =====================================================

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

// No authentication required - all routes are public
router.get('/', taskController.getAll);
router.get('/:id', taskController.getById);
router.post('/', taskController.create);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.delete);

// Task comments routes
router.get('/:id/comments', taskController.getComments);
router.post('/:id/comments', taskController.addComment);

// Task files routes
router.get('/:id/files', taskController.getFiles);
router.post('/:id/files', uploadSingle('file'), handleUploadError, taskController.uploadFile);

module.exports = router;

