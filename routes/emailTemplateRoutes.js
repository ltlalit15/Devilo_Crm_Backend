const express = require('express');
const router = express.Router();
const emailTemplateController = require('../controllers/emailTemplateController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, emailTemplateController.getAll);
router.get('/:id', optionalAuth, emailTemplateController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), emailTemplateController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), emailTemplateController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), emailTemplateController.delete);

module.exports = router;

