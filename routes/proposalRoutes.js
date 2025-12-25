const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/filters', optionalAuth, proposalController.getFilters);
router.get('/', optionalAuth, proposalController.getAll);
router.get('/:id', optionalAuth, proposalController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), proposalController.create);
router.post('/:id/duplicate', optionalAuth, requireRole(['ADMIN']), proposalController.duplicate);
router.post('/:id/convert-to-invoice', optionalAuth, requireRole(['ADMIN']), proposalController.convertToInvoice);
router.post('/:id/send-email', optionalAuth, requireRole(['ADMIN']), proposalController.sendEmail);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), proposalController.update);
router.put('/:id/status', optionalAuth, requireRole(['ADMIN']), proposalController.updateStatus);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), proposalController.delete);

module.exports = router;

