// =====================================================
// Bank Account Routes
// =====================================================

const express = require('express');
const router = express.Router();
const bankAccountController = require('../controllers/bankAccountController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, bankAccountController.getAll);
router.get('/:id', optionalAuth, bankAccountController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), bankAccountController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), bankAccountController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), bankAccountController.delete);

module.exports = router;

