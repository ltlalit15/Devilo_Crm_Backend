// =====================================================
// Project Routes
// =====================================================

const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, projectController.getAll);
router.get('/:id', optionalAuth, projectController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), projectController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), projectController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), projectController.delete);

module.exports = router;

