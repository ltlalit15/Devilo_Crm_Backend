const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, subscriptionController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), subscriptionController.create);
router.put('/:id/cancel', verifyToken, requireRole(['ADMIN']), subscriptionController.cancel);
router.put('/:id', verifyToken, requireRole(['ADMIN']), subscriptionController.update);

module.exports = router;

