// =====================================================
// Dashboard Routes
// =====================================================

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// No authentication required - all routes are public
router.get('/admin', dashboardController.getAdminDashboard);
router.get('/employee', dashboardController.getEmployeeDashboard);
router.get('/client', dashboardController.getClientDashboard);
router.get('/client/work', dashboardController.getClientWork);
router.get('/client/finance', dashboardController.getClientFinance);

module.exports = router;

