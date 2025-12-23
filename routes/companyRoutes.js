// =====================================================
// Company Routes
// =====================================================

const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, companyController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), companyController.create);
router.get('/:id', verifyToken, companyController.getById);
router.put('/:id', verifyToken, requireRole(['ADMIN']), companyController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), companyController.deleteCompany);

module.exports = router;

