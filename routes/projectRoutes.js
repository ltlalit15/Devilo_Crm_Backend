// =====================================================
// Project Routes
// =====================================================

const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, projectController.getAll);
router.get('/:id', verifyToken, projectController.getById);
router.post('/', verifyToken, requireRole(['ADMIN']), projectController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), projectController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), projectController.delete);

module.exports = router;

