const express = require('express');
const router = express.Router();
const financeTemplateController = require('../controllers/financeTemplateController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, financeTemplateController.getAll);
router.get('/:id', optionalAuth, financeTemplateController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN']), financeTemplateController.create);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), financeTemplateController.update);
router.delete('/:id', optionalAuth, requireRole(['ADMIN']), financeTemplateController.delete);

module.exports = router;

