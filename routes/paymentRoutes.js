// =====================================================
// Payment Routes
// =====================================================

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, paymentController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), paymentController.create);
router.post('/bulk', optionalAuth, requireRole(['ADMIN']), paymentController.createBulk);
router.get('/:id', optionalAuth, paymentController.getById);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), paymentController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), paymentController.delete);

module.exports = router;

