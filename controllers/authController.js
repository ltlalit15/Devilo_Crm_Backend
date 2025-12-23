// =====================================================
// Authentication Controller
// =====================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Login user
 * POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        error: 'Role is required (ADMIN, EMPLOYEE, or CLIENT)'
      });
    }

    // Normalize role to uppercase for comparison
    const normalizedRole = role.toUpperCase();

    // Get user from database
    const [users] = await pool.execute(
      `SELECT id, company_id, name, email, password, role, status 
       FROM users 
       WHERE email = ? AND UPPER(role) = ? AND is_deleted = 0`,
      [email, normalizedRole]
    );

    if (users.length === 0) {
      // Check if user exists but with different role
      const [checkUser] = await pool.execute(
        `SELECT role FROM users WHERE email = ? AND is_deleted = 0`,
        [email]
      );
      
      if (checkUser.length > 0) {
        return res.status(401).json({
          success: false,
          error: `User exists but role mismatch. Expected: ${normalizedRole}, Found: ${checkUser[0].role}`
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Invalid email, password, or role'
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email, password, or role'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        companyId: user.company_id,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    // Remove password from response
    delete user.password;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        company_id: user.company_id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

/**
 * Logout user (optional - mainly for token blacklisting in future)
 * POST /api/v1/auth/logout
 */
const logout = async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token here
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};

/**
 * Get current user
 * GET /api/v1/auth/me
 */
const getCurrentUser = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, company_id, name, email, role, status, avatar, phone, address, created_at 
       FROM users 
       WHERE id = ? AND is_deleted = 0`,
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
};

module.exports = {
  login,
  logout,
  getCurrentUser
};

