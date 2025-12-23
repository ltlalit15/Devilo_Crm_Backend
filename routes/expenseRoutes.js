const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, expenseController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), expenseController.create);
router.post('/:id/approve', verifyToken, requireRole(['ADMIN']), expenseController.approve);
router.post('/:id/reject', verifyToken, requireRole(['ADMIN']), expenseController.reject);

module.exports = router;

