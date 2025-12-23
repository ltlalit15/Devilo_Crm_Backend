const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, ticketController.getAll);
router.post('/', verifyToken, ticketController.create);
router.post('/:id/comments', verifyToken, ticketController.addComment);

module.exports = router;

