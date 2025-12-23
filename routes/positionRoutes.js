const express = require('express');
const router = express.Router();
const positionController = require('../controllers/positionController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, positionController.getAll);

module.exports = router;

