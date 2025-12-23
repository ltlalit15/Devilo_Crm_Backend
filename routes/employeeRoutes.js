const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, employeeController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), employeeController.create);

module.exports = router;

