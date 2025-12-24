const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, expenseController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), expenseController.create);
router.post('/:id/approve', optionalAuth, requireRole(['ADMIN']), expenseController.approve);
router.post('/:id/reject', optionalAuth, requireRole(['ADMIN']), expenseController.reject);

module.exports = router;

