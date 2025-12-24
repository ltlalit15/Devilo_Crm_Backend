// =====================================================
// Dashboard Routes
// =====================================================

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/admin', optionalAuth, dashboardController.getAdminDashboard);
router.get('/employee', optionalAuth, dashboardController.getEmployeeDashboard);
router.get('/client', optionalAuth, dashboardController.getClientDashboard);

module.exports = router;

