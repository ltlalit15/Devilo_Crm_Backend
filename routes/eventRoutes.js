const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, eventController.getAll);
router.post('/', optionalAuth, eventController.create);

module.exports = router;

