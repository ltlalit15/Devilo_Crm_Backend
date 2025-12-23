const express = require('express');
const router = express.Router();
const timeTrackingController = require('../controllers/timeTrackingController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, timeTrackingController.getAll);
router.post('/', verifyToken, timeTrackingController.create);

module.exports = router;

