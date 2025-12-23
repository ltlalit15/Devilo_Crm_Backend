// =====================================================
// Payment Routes
// =====================================================

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, paymentController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), paymentController.create);
router.post('/bulk', verifyToken, requireRole(['ADMIN']), paymentController.createBulk);
router.get('/:id', verifyToken, paymentController.getById);
router.put('/:id', verifyToken, requireRole(['ADMIN']), paymentController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), paymentController.delete);

module.exports = router;

