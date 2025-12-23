const express = require('express');
const router = express.Router();
const estimateController = require('../controllers/estimateController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, estimateController.getAll);
router.post('/', verifyToken, requireRole(['ADMIN']), estimateController.create);
router.post('/:id/convert-to-invoice', verifyToken, requireRole(['ADMIN']), estimateController.convertToInvoice);
router.get('/:id', verifyToken, estimateController.getById);
router.put('/:id', verifyToken, requireRole(['ADMIN']), estimateController.update);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), estimateController.delete);

module.exports = router;

