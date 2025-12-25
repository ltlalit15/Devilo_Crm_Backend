// =====================================================
// Leave Request Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leaveRequestController = require('../controllers/leaveRequestController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, leaveRequestController.getAll);
router.get('/:id', optionalAuth, leaveRequestController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leaveRequestController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leaveRequestController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leaveRequestController.delete);

module.exports = router;

