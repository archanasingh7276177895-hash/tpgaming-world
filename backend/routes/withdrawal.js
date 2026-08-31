const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
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
// 1. SUBMIT WITHDRAWAL REQUEST (Blocked for Admins)
// ==========================================
router.post('/request', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ message: 'Admins cannot create personal withdrawal requests.' });
    }

    const { amount, upiId, payoutMethod, bankDetails } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is ₹10.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    const currentBalance = user.balance ?? user.walletBalance ?? 0;
    if (currentBalance < numAmount) {
      return res.status(400).json({ message: `Insufficient balance. Available: ₹${currentBalance}` });
    }

    // Deduct wallet balance immediately
    const updatedBalance = currentBalance - numAmount;
    await User.updateOne(
      { _id: user._id },
      { $inc: { balance: -numAmount, walletBalance: -numAmount } }
    );

    const withdrawal = new Withdrawal({
      userId: user._id,
      username: user.username,
      amount: numAmount,
      upiId: upiId ? upiId.trim() : '',
      payoutMethod: payoutMethod || 'UPI',
      bankDetails: {
        accountHolderName: bankDetails?.accountHolderName || '',
        accountNumber: bankDetails?.accountNumber || '',
        ifsc: bankDetails?.ifsc || ''
      },
      status: 'pending'
    });

    await withdrawal.save();

    res.status(201).json({
      message: 'Withdrawal request submitted successfully!',
      newBalance: updatedBalance,
      withdrawal
    });
  } catch (err) {
    console.error('WITHDRAWAL REQUEST ERROR:', err);
    res.status(500).json({ message: err.message || 'Server error creating withdrawal.' });
  }
});

// ==========================================
// 2. GET USER WITHDRAWAL HISTORY
// ==========================================
router.get('/my-history', authMiddleware, async (req, res) => {
  try {
    const history = await Withdrawal.find({
      $or: [
        { userId: mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null },
        { username: req.user.username }
      ]
    }).sort({ createdAt: -1 });

    res.json(history);
  } catch (err) {
    console.error('WITHDRAWAL HISTORY ERROR:', err);
    res.status(500).json({ message: 'Error fetching withdrawal history.' });
  }
});

module.exports = router;