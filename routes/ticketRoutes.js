const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// No authentication required - all routes are public
router.get('/', ticketController.getAll);
<<<<<<< HEAD
router.get('/:id', ticketController.getById);
router.post('/', ticketController.create);
router.put('/:id', ticketController.update);
router.delete('/:id', ticketController.delete);
=======
router.post('/', ticketController.create);
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
router.post('/:id/comments', ticketController.addComment);

module.exports = router;

