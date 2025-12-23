// =====================================================
// Dashboard Routes
// =====================================================

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/admin', verifyToken, requireRole(['ADMIN']), dashboardController.getAdminDashboard);
router.get('/employee', verifyToken, requireRole(['EMPLOYEE']), dashboardController.getEmployeeDashboard);
router.get('/client', verifyToken, requireRole(['CLIENT']), dashboardController.getClientDashboard);

module.exports = router;

