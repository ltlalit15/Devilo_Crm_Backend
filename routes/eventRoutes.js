const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');

// No authentication required - all routes are public
router.get('/', eventController.getAll);
router.post('/', eventController.create);

module.exports = router;

