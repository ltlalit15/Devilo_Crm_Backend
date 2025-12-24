// =====================================================
// Company Routes
// =====================================================

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, companyController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), companyController.create);
router.get('/:id', optionalAuth, companyController.getById);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), companyController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), companyController.deleteCompany);

module.exports = router;

