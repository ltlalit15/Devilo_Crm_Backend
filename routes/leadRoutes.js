// =====================================================
// Lead Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, leadController.getAll);
router.get('/:id', optionalAuth, leadController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), leadController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), leadController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), leadController.delete);
router.post('/:id/convert-to-client', optionalAuth, requireRole(['ADMIN']), leadController.convertToClient);

module.exports = router;

