// =====================================================
// Task Routes
// =====================================================

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, taskController.getAll);
router.get('/:id', optionalAuth, taskController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), taskController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), taskController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), taskController.delete);

module.exports = router;

