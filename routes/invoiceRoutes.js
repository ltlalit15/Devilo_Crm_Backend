// =====================================================
// Invoice Routes
// =====================================================

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All routes require authentication
router.get('/', verifyToken, invoiceController.getAll);
router.get('/:id', verifyToken, invoiceController.getById);
router.post('/', verifyToken, requireRole(['ADMIN']), invoiceController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), invoiceController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), invoiceController.delete);
router.post('/create-from-time-logs', verifyToken, requireRole(['ADMIN']), invoiceController.createFromTimeLogs);
router.post('/create-recurring', verifyToken, requireRole(['ADMIN']), invoiceController.createRecurring);

module.exports = router;

