const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, proposalController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), proposalController.create);
router.post('/:id/convert-to-invoice', optionalAuth, requireRole(['ADMIN']), proposalController.convertToInvoice);
router.get('/:id', optionalAuth, proposalController.getById);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), proposalController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), proposalController.delete);

module.exports = router;

