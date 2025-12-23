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
      `SELECT u.id, u.company_id, u.name, u.email, u.role, u.status, u.avatar, u.phone, u.address, u.created_at,
              e.department_id, e.position_id,
              d.name as department_name,
              p.name as position_name
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       WHERE u.id = ? AND u.is_deleted = 0`,
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];
    // Format response
    const userData = {
      id: user.id,
      company_id: user.company_id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      phone: user.phone,
      address: user.address,
      department_id: user.department_id,
      department: user.department_name,
      position_id: user.position_id,
      position: user.position_name,
      created_at: user.created_at
    };

    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
};

/**
 * Update current user profile
 * PUT /api/v1/auth/me
 */
const updateCurrentUser = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;

    // Build update fields
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email !== undefined) {
      // Check if email already exists for another user
      const [existingUsers] = await pool.execute(
        `SELECT id FROM users WHERE email = ? AND id != ? AND company_id = ?`,
        [email, req.userId, req.companyId]
      );
      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateValues.push(req.userId);

    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      updateValues
    );

    // Get updated user
    const [users] = await pool.execute(
      `SELECT u.id, u.company_id, u.name, u.email, u.role, u.status, u.avatar, u.phone, u.address, u.created_at,
              e.department_id, e.position_id,
              d.name as department_name,
              p.name as position_name
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN positions p ON e.position_id = p.id
       WHERE u.id = ? AND u.is_deleted = 0`,
      [req.userId]
    );

    const user = users[0];
    const userData = {
      id: user.id,
      company_id: user.company_id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      phone: user.phone,
      address: user.address,
      department_id: user.department_id,
      department: user.department_name,
      position_id: user.position_id,
      position: user.position_name,
      created_at: user.created_at
    };

    res.json({
      success: true,
      data: userData,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

module.exports = {
  login,
  logout,
  getCurrentUser,
  updateCurrentUser
};

