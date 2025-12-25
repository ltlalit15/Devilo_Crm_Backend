// =====================================================
// Notification Routes
// =====================================================

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { optionalAuth, requireRole } = require('../middleware/auth');

// GET routes don't require token - faster API calls
router.get('/', optionalAuth, notificationController.getAll);
router.get('/unread-count', optionalAuth, notificationController.getUnreadCount);
router.get('/:id', optionalAuth, notificationController.getById);
router.post('/', optionalAuth, requireRole(['ADMIN', 'SUPERADMIN']), notificationController.create);
router.put('/:id/read', optionalAuth, notificationController.markAsRead);
router.put('/mark-all-read', optionalAuth, notificationController.markAllAsRead);
router.delete('/:id', optionalAuth, notificationController.delete);

module.exports = router;

