const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { optionalAuth } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, messageController.getAll);
router.post('/', optionalAuth, messageController.create);

module.exports = router;

