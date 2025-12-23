const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, messageController.getAll);
router.post('/', verifyToken, messageController.create);

module.exports = router;

