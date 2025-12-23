// =====================================================
// Task Routes
// =====================================================

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, taskController.getAll);
router.get('/:id', verifyToken, taskController.getById);
router.post('/', verifyToken, requireRole(['ADMIN', 'EMPLOYEE']), taskController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'EMPLOYEE']), taskController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), taskController.delete);

module.exports = router;

