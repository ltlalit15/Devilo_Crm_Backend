const express = require('express');
const router = express.Router();
const socialMediaIntegrationController = require('../controllers/socialMediaIntegrationController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, socialMediaIntegrationController.getAll);
router.get('/:id', optionalAuth, socialMediaIntegrationController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), socialMediaIntegrationController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), socialMediaIntegrationController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), socialMediaIntegrationController.delete);
router.post('/:id/connect', optionalAuth, requireRole(['ADMIN']), socialMediaIntegrationController.connect);
router.post('/:id/disconnect', optionalAuth, requireRole(['ADMIN']), socialMediaIntegrationController.disconnect);

module.exports = router;

