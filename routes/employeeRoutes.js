const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, employeeController.getAll);
router.get('/:id', optionalAuth, employeeController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), employeeController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), employeeController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), employeeController.deleteEmployee);

module.exports = router;

