// =====================================================
// Lead Routes
// =====================================================

const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { verifyToken, requireRole } = require('../middleware/auth');

// All routes require authentication
router.get('/', verifyToken, leadController.getAll);
router.get('/:id', verifyToken, leadController.getById);
router.post('/', verifyToken, requireRole(['ADMIN']), leadController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), leadController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), leadController.delete);
router.post('/:id/convert-to-client', verifyToken, requireRole(['ADMIN']), leadController.convertToClient);

module.exports = router;

