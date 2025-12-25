// =====================================================
// Super Admin Routes
// =====================================================

const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All routes require SUPERADMIN role
router.use(verifyToken);
router.use(requireRole('SUPERADMIN'));

// Companies Management
router.get('/companies', superAdminController.getAllCompanies);
router.get('/companies/:id', superAdminController.getCompanyById);
router.post('/companies', superAdminController.createCompany);
router.put('/companies/:id', superAdminController.updateCompany);
router.delete('/companies/:id', superAdminController.deleteCompany);

// System Statistics
router.get('/stats', superAdminController.getSystemStats);

// Users Management (across all companies)
router.get('/users', superAdminController.getAllUsers);

// Packages Management
router.get('/packages', superAdminController.getAllPackages);
router.get('/packages/:id', superAdminController.getPackageById);
router.post('/packages', superAdminController.createPackage);
router.put('/packages/:id', superAdminController.updatePackage);
router.delete('/packages/:id', superAdminController.deletePackage);

// Billing
router.get('/billing', superAdminController.getBillingInfo);

// Offline Requests
router.get('/offline-requests', superAdminController.getOfflineRequests);
router.get('/offline-requests/:id', superAdminController.getOfflineRequestById);
router.post('/offline-requests', superAdminController.createOfflineRequest);
router.put('/offline-requests/:id', superAdminController.updateOfflineRequest);
router.delete('/offline-requests/:id', superAdminController.deleteOfflineRequest);

// Support Tickets
router.get('/support-tickets', superAdminController.getSupportTickets);

// System Settings
router.get('/settings', superAdminController.getSystemSettings);
router.put('/settings', superAdminController.updateSystemSettings);

module.exports = router;

