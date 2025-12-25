// =====================================================
// Audit Log Routes
// =====================================================

const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), auditLogController.getAll);
router.get('/:id', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), auditLogController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), auditLogController.create);

module.exports = router;

