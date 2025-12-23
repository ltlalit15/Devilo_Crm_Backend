const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, requireRole(['ADMIN']), userController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), userController.create);
router.post('/:id/reset-password', verifyToken, requireRole(['ADMIN']), userController.resetPassword);

module.exports = router;

