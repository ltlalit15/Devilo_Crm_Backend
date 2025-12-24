const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, contractController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), contractController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), contractController.updateStatus);

module.exports = router;

