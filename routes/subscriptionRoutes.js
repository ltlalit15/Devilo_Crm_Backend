const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, subscriptionController.getAll);
router.post('/', optionalAuth, requireRole(['ADMIN']), subscriptionController.create);
router.put('/:id/cancel', optionalAuth, requireRole(['ADMIN']), subscriptionController.cancel);
router.put('/:id', optionalAuth, requireRole(['ADMIN']), subscriptionController.update);

module.exports = router;

