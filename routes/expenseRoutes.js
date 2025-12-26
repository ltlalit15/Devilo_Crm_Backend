const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');

// No authentication required - all routes are public
router.get('/', expenseController.getAll);
router.post('/', expenseController.create);
router.post('/:id/approve', expenseController.approve);
router.post('/:id/reject', expenseController.reject);

module.exports = router;

