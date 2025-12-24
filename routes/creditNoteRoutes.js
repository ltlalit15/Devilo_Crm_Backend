// =====================================================
// Credit Note Routes
// =====================================================

const express = require('express');
const router = express.Router();
const creditNoteController = require('../controllers/creditNoteController');
const { optionalAuth, requireRole } = require('../middleware/auth');

router.get('/', optionalAuth, creditNoteController.getAll);
router.get('/:id', optionalAuth, creditNoteController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), creditNoteController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), creditNoteController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), creditNoteController.deleteCreditNote);

module.exports = router;

