const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, departmentController.getAll);
router.get('/:id', optionalAuth, departmentController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), departmentController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), departmentController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), departmentController.deleteDept);

module.exports = router;

