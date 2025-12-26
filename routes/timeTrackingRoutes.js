const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTrackingController');

// No authentication required - all routes are public
router.get('/', timeTrackingController.getAll);
router.post('/', timeTrackingController.create);
router.put('/:id', timeTrackingController.update);
router.delete('/:id', timeTrackingController.delete);

module.exports = router;

