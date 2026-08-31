const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// ==========================================
// ADMIN AUTH MIDDLEWARE
// ==========================================
const adminAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const jwt = require('jsonwebtoken');
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'tp_gaming_secret_key_2026');
    if (verified.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// ==========================================
// 1. STATS & ANALYTICS OVERVIEW
// ==========================================
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      pendingDeposits,
      pendingWithdrawals,
      totalUsers,
      users,
      todayApprovedDeposits,
      todayApprovedWithdrawals
    ] = await Promise.all([
      Deposit.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      User.countDocuments(),
      User.find({}, 'balance walletBalance'),
      Deposit.find({ status: 'approved', updatedAt: { $gte: startOfToday } }, 'amount'),
      Withdrawal.find({ status: 'approved', updatedAt: { $gte: startOfToday } }, 'amount')
    ]);

    const totalPlatformBalance = users.reduce((sum, u) => sum + (u.balance || u.walletBalance || 0), 0);
    const depositVolume = todayApprovedDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const withdrawalVolume = todayApprovedWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    const todayVolume = depositVolume + withdrawalVolume;

    res.json({
      totalUsers,
      pendingDeposits,
      pendingWithdrawals,
      totalPlatformBalance,
      todayVolume
    });
  } catch (err) {
    console.error('STATS ERROR:', err);
    res.status(500).json({ message: 'Error fetching stats.' });
  }
});

// ==========================================
// 2. USER MANAGEMENT
// ==========================================
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

// Adjust User Balance
router.post('/users/:id/balance', adminAuth, async (req, res) => {
  try {
    const { amount, type } = req.body; // type: 'add' or 'set'
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let updatedBalance = Number(amount);
    if (type === 'add') {
      updatedBalance = (user.balance || user.walletBalance || 0) + Number(amount);
    }

    user.balance = Math.max(0, updatedBalance);
    user.walletBalance = Math.max(0, updatedBalance);
    await user.save();

    res.json({ message: `Updated balance for ${user.username} to ₹${user.balance}`, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user balance.' });
  }
});

// Toggle User Block/Unblock Status
router.post('/users/:id/toggle-block', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      message: `User ${user.username} is now ${user.isBlocked ? 'Blocked' : 'Active'}.`,
      isBlocked: user.isBlocked
    });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling user block status.' });
  }
});

// ==========================================
// 3. DEPOSIT MANAGEMENT
// ==========================================
router.get('/deposits', adminAuth, async (req, res) => {
  try {
    const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
    const deposits = await Deposit.find(filter).sort({ createdAt: -1 });
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching deposits.' });
  }
});

router.post('/deposits/approve/:id', adminAuth, async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ message: 'Deposit request not found.' });
    if (deposit.status !== 'pending') return res.status(400).json({ message: 'Request already processed.' });

    const targetId = deposit.userId || deposit.userObjId;
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null },
        { username: targetId },
        { userId: targetId }
      ]
    });

    if (!user) return res.status(404).json({ message: 'User account not found.' });

    deposit.status = 'approved';
    await deposit.save();

    const creditAmount = Number(deposit.amount);
    await User.updateOne(
      { _id: user._id },
      { $inc: { balance: creditAmount, walletBalance: creditAmount } }
    );

    res.json({ message: `Approved ₹${creditAmount} for ${user.username}!`, deposit });
  } catch (err) {
    res.status(500).json({ message: 'Error approving deposit.' });
  }
});

router.post('/deposits/reject/:id', adminAuth, async (req, res) => {
  try {
    const { remark } = req.body;
    const deposit = await Deposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ message: 'Deposit request not found.' });
    if (deposit.status !== 'pending') return res.status(400).json({ message: 'Request already processed.' });

    deposit.status = 'rejected';
    deposit.adminRemark = remark || 'Payment verification failed.';
    await deposit.save();

    res.json({ message: 'Deposit rejected.', deposit });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting deposit.' });
  }
});

// ==========================================
// 4. WITHDRAWAL MANAGEMENT
// ==========================================
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
    const withdrawals = await Withdrawal.find(filter).sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching withdrawals.' });
  }
});

router.post('/withdrawals/approve/:id', adminAuth, async (req, res) => {
  try {
    const { payoutRef } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found.' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Withdrawal already processed.' });

    withdrawal.status = 'approved';
    withdrawal.payoutRef = payoutRef || `PAY_${Date.now()}`;
    await withdrawal.save();

    res.json({ message: `Approved ₹${withdrawal.amount} for ${withdrawal.username}.`, withdrawal });
  } catch (err) {
    res.status(500).json({ message: 'Error approving withdrawal.' });
  }
});

router.post('/withdrawals/reject/:id', adminAuth, async (req, res) => {
  try {
    const { remark } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found.' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Withdrawal already processed.' });

    withdrawal.status = 'rejected';
    withdrawal.adminRemark = remark || 'Withdrawal rejected by administrator.';
    await withdrawal.save();

    const targetId = withdrawal.userId || withdrawal.userObjId;
    const refundAmount = Number(withdrawal.amount);

    if (targetId) {
      await User.updateOne(
        {
          $or: [
            { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null },
            { username: targetId },
            { userId: targetId }
          ]
        },
        { $inc: { balance: refundAmount, walletBalance: refundAmount } }
      );
    }

    res.json({ message: `Withdrawal rejected. ₹${refundAmount} refunded to player.`, withdrawal });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting withdrawal.' });
  }
});

module.exports = router;