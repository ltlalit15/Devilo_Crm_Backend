const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// No authentication required - all routes are public
router.get('/', ticketController.getAll);
router.post('/', ticketController.create);
router.post('/:id/comments', ticketController.addComment);

module.exports = router;

