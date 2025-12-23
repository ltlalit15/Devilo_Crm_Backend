const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, contractController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), contractController.create);
router.put('/:id', verifyToken, requireRole(['ADMIN']), contractController.updateStatus);

module.exports = router;

