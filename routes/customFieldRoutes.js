const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customFieldController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, customFieldController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), customFieldController.create);

module.exports = router;

