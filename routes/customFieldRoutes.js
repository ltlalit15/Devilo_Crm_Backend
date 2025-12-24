const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customFieldController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, customFieldController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), customFieldController.create);

module.exports = router;

