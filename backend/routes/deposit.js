const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const Deposit = require('../models/Deposit');
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

// Multer Configuration for Screenshots
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `deposit_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ==========================================
// 1. SUBMIT DEPOSIT REQUEST (Blocked for Admins)
// ==========================================
router.post('/request', authMiddleware, upload.single('screenshot'), async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ message: 'Admins cannot create personal deposit requests.' });
    }

    const { amount, utrNumber, utr } = req.body;
    const cleanUtr = (utrNumber || utr || '').trim();
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ message: 'Minimum deposit amount is ₹10.' });
    }

    if (!cleanUtr || cleanUtr.length < 6) {
      return res.status(400).json({ message: 'Please enter a valid UTR / Transaction Reference Number.' });
    }

    const existingDeposit = await Deposit.findOne({
      $or: [{ utrNumber: cleanUtr }, { utr: cleanUtr }]
    });
    if (existingDeposit) {
      return res.status(400).json({ message: 'This UTR number has already been submitted.' });
    }

    const screenshotUrl = req.file ? `/uploads/${req.file.filename}` : '';

    const deposit = new Deposit({
      userId: req.user.id,
      userObjId: req.user.id,
      username: req.user.username,
      amount: numAmount,
      utrNumber: cleanUtr,
      utr: cleanUtr,
      screenshotUrl: screenshotUrl,
      screenshot: screenshotUrl,
      status: 'pending'
    });

    await deposit.save();

    // ⚡ Real-Time Socket.io Notification to Admin
    const io = req.app.get('io');
    if (io) {
      io.emit('new_deposit_request', {
        depositId: deposit._id,
        username: req.user.username,
        amount: numAmount,
        utr: cleanUtr,
        createdAt: deposit.createdAt
      });
      console.log(`📡 [Socket.io] Broadcasted new_deposit_request for user: ${req.user.username}`);
    }

    res.status(201).json({ message: 'Deposit request submitted! Admin will verify and credit your wallet.', deposit });

  } catch (err) {
    console.error('DEPOSIT SUBMIT ERROR:', err);
    res.status(500).json({ message: err.message || 'Server error submitting deposit request.' });
  }
});

// ==========================================
// 2. GET USER'S DEPOSIT HISTORY
// ==========================================
router.get('/my-history', authMiddleware, async (req, res) => {
  try {
    const deposits = await Deposit.find({
      $or: [{ userId: req.user.id }, { userObjId: req.user.id }, { username: req.user.username }]
    }).sort({ createdAt: -1 });
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching deposit history.' });
  }
});

module.exports = router;