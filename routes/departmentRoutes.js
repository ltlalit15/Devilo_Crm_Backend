const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, departmentController.getAll);
router.get('/:id', verifyToken, departmentController.getById);
router.post('/', verifyToken, requireRole(['ADMIN']), departmentController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), departmentController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), departmentController.deleteDept);

module.exports = router;

