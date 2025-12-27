// =====================================================
// Authentication Routes
// =====================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
<<<<<<< HEAD
const { optionalAuth } = require('../middleware/auth');

// Public routes - no authentication required
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Routes that use optionalAuth - will get userId from JWT if token provided
router.get('/me', optionalAuth, authController.getCurrentUser);
router.put('/me', optionalAuth, authController.updateCurrentUser);
router.put('/change-password', optionalAuth, authController.changePassword);
=======

// No authentication required - all routes are public
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateCurrentUser);
router.put('/change-password', authController.changePassword);
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e

module.exports = router;

