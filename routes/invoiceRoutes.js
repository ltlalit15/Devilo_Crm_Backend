// =====================================================
// Invoice Routes
// =====================================================

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, invoiceController.getAll);
router.get('/:id', optionalAuth, invoiceController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), invoiceController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), invoiceController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), invoiceController.delete);
router.post('/create-from-time-logs', optionalAuth, requireRole(['ADMIN']), invoiceController.createFromTimeLogs);
router.post('/create-recurring', optionalAuth, requireRole(['ADMIN']), invoiceController.createRecurring);

module.exports = router;

