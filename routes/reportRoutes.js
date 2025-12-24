const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { optionalAuth } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/sales', optionalAuth, reportController.getSalesReport);
router.get('/revenue', optionalAuth, reportController.getRevenueReport);
router.get('/projects', optionalAuth, reportController.getProjectStatusReport);
router.get('/employees', optionalAuth, reportController.getEmployeePerformanceReport);
router.get('/summary', optionalAuth, reportController.getReportsSummary);

module.exports = router;

