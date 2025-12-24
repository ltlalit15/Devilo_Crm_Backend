const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, contractController.getAll);
router.get('/:id', optionalAuth, contractController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), contractController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), contractController.update);
router.put('/:id/status', optionalAuth, requireRole(['ADMIN']), contractController.updateStatus);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), contractController.delete);

module.exports = router;

