const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, userController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), userController.create);
router.post('/:id/reset-password', optionalAuth, requireRole(['ADMIN']), userController.resetPassword);

module.exports = router;

