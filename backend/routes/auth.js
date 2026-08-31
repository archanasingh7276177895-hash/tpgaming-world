const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Inline Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'tp_gaming_secret_key_2026');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid or expired token.' });
  }
};

// ==========================================
// REGISTER ROUTE
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { username, userId, identifier, mobileNumber, password, role } = req.body;
    
    // Ensure both userId and mobileNumber are populated regardless of frontend payload naming
    const userIdentifier = userId || identifier || mobileNumber;
    const phone = mobileNumber || userIdentifier;

    if (!username || !userIdentifier || !password) {
      return res.status(400).json({ message: 'Username, Mobile/User ID, and Password are required.' });
    }

    if (username.length < 7) {
      return res.status(400).json({ message: 'Username must be at least 7 characters long.' });
    }

    // Check duplicate account
    const existingUser = await User.findOne({
      $or: [{ username }, { userId: userIdentifier }, { mobileNumber: phone }]
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: 'Username is already taken.' });
      }
      return res.status(400).json({ message: 'User ID / Mobile Number is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Auto-assign 'admin' role if specified or if username begins with 'admin'
    const assignedRole = role || (username.toLowerCase().startsWith('admin') ? 'admin' : 'user');

    // Save with both userId, mobileNumber, and assigned role
    const user = new User({
      username,
      userId: userIdentifier,
      mobileNumber: phone,
      password: hashedPassword,
      balance: 100, // Registration welcome bonus
      role: assignedRole
    });

    await user.save();
    res.status(201).json({ message: 'Registration successful!', role: assignedRole });

  } catch (err) {
    console.error('REGISTRATION ERROR:', err);

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(400).json({ message: `A user with this ${field} already exists.` });
    }

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: err.message || 'Server error during registration.' });
  }
});

// ==========================================
// LOGIN ROUTE
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { userId, identifier, username, password } = req.body;
    const loginInput = userId || identifier || username;

    if (!loginInput || !password) {
      return res.status(400).json({ message: 'Please enter User ID / Mobile / Username and Password.' });
    }

    // Search by username, userId, OR mobileNumber
    const user = await User.findOne({
      $or: [
        { username: loginInput },
        { userId: loginInput },
        { mobileNumber: loginInput }
      ]
    });

    if (!user) {
      return res.status(400).json({ message: 'Account not found.' });
    }

    // Check account status if blocked
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account has been temporarily disabled. Please contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    // Fallback role check: Assigns 'admin' if user.role is missing but username starts with 'admin'
    const userRole = user.role || (user.username.toLowerCase().startsWith('admin') ? 'admin' : 'user');

    const token = jwt.sign(
      { id: user._id, username: user.username, role: userRole },
      process.env.JWT_SECRET || 'tp_gaming_secret_key_2026',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        userId: user.userId || user.mobileNumber,
        mobileNumber: user.mobileNumber,
        walletBalance: user.balance ?? user.walletBalance ?? 0,
        role: userRole
      }
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ message: err.message || 'Server error during login.' });
  }
});

// ==========================================
// USER PROFILE ROUTE
// ==========================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const userObj = user.toObject();
    const userRole = user.role || (user.username.toLowerCase().startsWith('admin') ? 'admin' : 'user');

    res.json({
      ...userObj,
      walletBalance: user.balance ?? user.walletBalance ?? 0,
      role: userRole
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching profile.' });
  }
});

// ==========================================
// CHANGE PASSWORD ROUTE
// ==========================================
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password do not match.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Atomic update to bypass validation errors on legacy/missing fields
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    res.json({ message: 'Password updated successfully! Please log in with your new credentials next time.' });
  } catch (err) {
    console.error('CHANGE PASSWORD ERROR:', err);
    res.status(500).json({ message: err.message || 'Server error while updating password.' });
  }
});

module.exports = router;