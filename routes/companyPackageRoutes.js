// =====================================================
// Company Package Routes
// =====================================================

const express = require('express');
const router = express.Router();
const companyPackageController = require('../controllers/companyPackageController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, companyPackageController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), companyPackageController.create);
router.get('/:id', verifyToken, companyPackageController.getById);
router.put('/:id', verifyToken, requireRole(['ADMIN']), companyPackageController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), companyPackageController.deletePackage);

module.exports = router;

