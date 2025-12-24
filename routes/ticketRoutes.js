const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { optionalAuth } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, ticketController.getAll);
router.post('/', optionalAuth, ticketController.create);
router.post('/:id/comments', optionalAuth, ticketController.addComment);

module.exports = router;

