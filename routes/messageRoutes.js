const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { optionalAuth, requireRole } = require('../middleware/auth');

router.get('/', optionalAuth, messageController.getAll);
router.get('/:id', optionalAuth, messageController.getById);
router.post('/', optionalAuth, messageController.create);
router.put('/:id', optionalAuth, messageController.update);
router.delete('/:id', optionalAuth, messageController.deleteMessage);

module.exports = router;

