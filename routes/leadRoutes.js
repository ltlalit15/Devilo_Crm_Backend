// =====================================================
// Lead Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// No authentication required - all routes are public

// IMPORTANT: Specific routes must come BEFORE parameterized routes (/:id)
// Otherwise Express will match /contacts as /:id with id="contacts"

// Contacts routes (for Leads Contacts tab) - MUST come before /:id routes
router.get('/contacts', leadController.getAllContacts);
router.get('/contacts/:id', leadController.getContactById);
router.post('/contacts', leadController.createContact);
router.put('/contacts/:id', leadController.updateContact);
router.delete('/contacts/:id', leadController.deleteContact);

<<<<<<< HEAD
// Labels routes - MUST come before /:id routes
router.get('/labels', leadController.getAllLabels);
router.post('/labels', leadController.createLabel);
router.delete('/labels/:label', leadController.deleteLabel);

=======
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
// Other specific routes
router.get('/overview', leadController.getOverview);
router.post('/bulk-action', leadController.bulkAction);

// Parameterized routes (must come after specific routes)
router.get('/', leadController.getAll);
router.get('/:id', leadController.getById);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.put('/:id/update-status', leadController.updateStatus);
<<<<<<< HEAD
router.put('/:id/labels', leadController.updateLeadLabels);
=======
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
router.delete('/:id', leadController.delete);
router.post('/:id/convert-to-client', leadController.convertToClient);

module.exports = router;

