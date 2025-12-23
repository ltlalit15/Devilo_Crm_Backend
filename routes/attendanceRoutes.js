const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, attendanceController.getAll);
router.post('/check-in', verifyToken, attendanceController.checkIn);
router.post('/check-out', verifyToken, attendanceController.checkOut);

module.exports = router;

