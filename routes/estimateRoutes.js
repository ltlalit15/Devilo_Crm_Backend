const express = require('express');
const router = express.Router();
const estimateController = require('../controllers/estimateController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, estimateController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), estimateController.create);
router.post('/:id/convert-to-invoice', optionalAuth, requireRole(['ADMIN']), estimateController.convertToInvoice);
router.post('/:id/send-email', optionalAuth, requireRole(['ADMIN']), estimateController.sendEmail);
router.get('/:id', optionalAuth, estimateController.getById);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), estimateController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), estimateController.delete);

module.exports = router;

