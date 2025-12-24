const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { optionalAuth } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, attendanceController.getAll);
router.post('/check-in', optionalAuth, attendanceController.checkIn);
router.post('/check-out', optionalAuth, attendanceController.checkOut);

module.exports = router;

