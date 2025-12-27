// =====================================================
// Authentication Routes
// =====================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// No authentication required - all routes are public
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateCurrentUser);
router.put('/change-password', authController.changePassword);

module.exports = router;

