// =====================================================
// Company Package Routes
// =====================================================

const express = require('express');
const router = express.Router();
const companyPackageController = require('../controllers/companyPackageController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, companyPackageController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), companyPackageController.create);
router.get('/:id', optionalAuth, companyPackageController.getById);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), companyPackageController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), companyPackageController.deletePackage);

module.exports = router;

