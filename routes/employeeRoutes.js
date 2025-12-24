const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, employeeController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), employeeController.create);

module.exports = router;

