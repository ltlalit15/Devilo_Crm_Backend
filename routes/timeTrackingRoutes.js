const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTrackingController');

// No authentication required - all routes are public
<<<<<<< HEAD
router.get('/stats', timeTrackingController.getStats);  // Must be before /:id
router.get('/', timeTrackingController.getAll);
router.get('/:id', timeTrackingController.getById);
=======
router.get('/', timeTrackingController.getAll);
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
router.post('/', timeTrackingController.create);
router.put('/:id', timeTrackingController.update);
router.delete('/:id', timeTrackingController.delete);

module.exports = router;

