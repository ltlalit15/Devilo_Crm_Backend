const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, eventController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), eventController.create);

module.exports = router;

