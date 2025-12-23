const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, eventController.getAll);
router.post('/', verifyToken, eventController.create); // Allow all authenticated users to create events

module.exports = router;

