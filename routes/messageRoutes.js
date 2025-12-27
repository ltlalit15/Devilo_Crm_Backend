const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// No authentication required - all routes are public
<<<<<<< HEAD
router.get('/available-users', messageController.getAvailableUsers); // Must come before /:id
=======
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
router.get('/', messageController.getAll);
router.get('/:id', messageController.getById);
router.post('/', messageController.create);
router.put('/:id', messageController.update);
router.delete('/:id', messageController.deleteMessage);

module.exports = router;

