const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { optionalAuth } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, documentController.getAll);
router.get('/:id', optionalAuth, documentController.getById);
router.post('/', optionalAuth, uploadSingle('file'), handleUploadError, documentController.create);
router.delete('/:id', optionalAuth, documentController.deleteDocument);
router.get('/:id/download', optionalAuth, documentController.download);

module.exports = router;

