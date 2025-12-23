// =====================================================
// Client Routes
// =====================================================

const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All routes require authentication
router.get('/', verifyToken, clientController.getAll);
router.get('/:id', verifyToken, clientController.getById);
router.post('/', verifyToken, requireRole(['ADMIN']), clientController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), clientController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), clientController.delete);
router.post('/:id/contacts', verifyToken, requireRole(['ADMIN']), clientController.addContact);
router.get('/:id/contacts', verifyToken, clientController.getContacts);

module.exports = router;

