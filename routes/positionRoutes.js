const express = require('express');
const router = express.Router();
const positionController = require('../controllers/positionController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, positionController.getAll);
router.get('/:id', optionalAuth, positionController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), positionController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), positionController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), positionController.deletePosition);

module.exports = router;

