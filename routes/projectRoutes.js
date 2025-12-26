// =====================================================
// Project Routes
// =====================================================

const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');

// No authentication required - all routes are public
router.get('/filters', projectController.getFilters);
router.get('/', projectController.getAll);
router.get('/:id', projectController.getById);
router.post('/', projectController.create);
router.post('/:id/upload', uploadMultiple('file', 10), handleUploadError, projectController.uploadFile);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.delete);

module.exports = router;

