const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');

// No authentication required - all routes are public
<<<<<<< HEAD

// Profile routes (must come before /:id to avoid conflicts)
router.get('/profile', employeeController.getProfile);
router.put('/profile', employeeController.updateProfile);
router.get('/dashboard', employeeController.getDashboardStats);

// CRUD routes
=======
>>>>>>> 49d0b025c5d5a9b044a11e35aa3d5df4392e718e
router.get('/', employeeController.getAll);
router.get('/:id', employeeController.getById);
router.post('/', employeeController.create);
router.put('/:id', employeeController.update);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;

