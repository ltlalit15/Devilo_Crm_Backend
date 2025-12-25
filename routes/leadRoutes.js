// =====================================================
// Lead Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/overview', optionalAuth, leadController.getOverview);
router.get('/', optionalAuth, leadController.getAll);
router.get('/:id', optionalAuth, leadController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), leadController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), leadController.update);
router.put('/:id/update-status', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leadController.updateStatus);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), leadController.delete);
router.post('/:id/convert-to-client', optionalAuth, requireRole(['ADMIN']), leadController.convertToClient);
router.post('/bulk-action', optionalAuth, requireRole(['ADMIN']), leadController.bulkAction);

// Contacts routes (for Leads Contacts tab)
router.get('/contacts', optionalAuth, leadController.getAllContacts);
router.get('/contacts/:id', optionalAuth, leadController.getContactById);
router.post('/contacts', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leadController.createContact);
router.put('/contacts/:id', optionalAuth, requireRole(['ADMIN', 'EMPLOYEE']), leadController.updateContact);
router.delete('/contacts/:id', optionalAuth, requireRole(['ADMIN']), leadController.deleteContact);

module.exports = router;

