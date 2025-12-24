// =====================================================
// Client Routes
// =====================================================

const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, clientController.getAll);
router.get('/:id', optionalAuth, clientController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), clientController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), clientController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), clientController.delete);
router.post('/:id/contacts', optionalAuth, requireRole(['ADMIN']), clientController.addContact);
router.get('/:id/contacts', optionalAuth, clientController.getContacts);
router.put('/:id/contacts/:contactId', optionalAuth, requireRole(['ADMIN']), clientController.updateContact);
router.delete('/:id/contacts/:contactId', optionalAuth, requireRole(['ADMIN']), clientController.deleteContact);

module.exports = router;

