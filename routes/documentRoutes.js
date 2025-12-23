const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { verifyToken } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

router.get('/', verifyToken, documentController.getAll);
router.get('/:id', verifyToken, documentController.getById);
router.post('/', verifyToken, uploadSingle('file'), handleUploadError, documentController.create);
router.delete('/:id', verifyToken, documentController.deleteDocument);
router.get('/:id/download', verifyToken, documentController.download);

module.exports = router;

