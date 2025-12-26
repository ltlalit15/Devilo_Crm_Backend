// =====================================================
// Lead Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// No authentication required - all routes are public
router.get('/overview', leadController.getOverview);
router.get('/', leadController.getAll);
router.get('/:id', leadController.getById);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.put('/:id/update-status', leadController.updateStatus);
router.delete('/:id', leadController.delete);
router.post('/:id/convert-to-client', leadController.convertToClient);
router.post('/bulk-action', leadController.bulkAction);

// Contacts routes (for Leads Contacts tab)
router.get('/contacts', leadController.getAllContacts);
router.get('/contacts/:id', leadController.getContactById);
router.post('/contacts', leadController.createContact);
router.put('/contacts/:id', leadController.updateContact);
router.delete('/contacts/:id', leadController.deleteContact);

module.exports = router;

