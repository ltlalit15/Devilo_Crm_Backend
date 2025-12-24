const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTrackingController');
const { optionalAuth } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, timeTrackingController.getAll);
router.post('/', optionalAuth, timeTrackingController.create);

module.exports = router;

