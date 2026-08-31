const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');

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

// Safe User Query Builder (Handles ObjectId, String ID, and Username)
const buildUserFilter = (user) => {
  const rawId = user?.id || user?._id || user?.userId;
  const username = user?.username;
  const orList = [];

  if (rawId) {
    orList.push({ userId: rawId.toString() });
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      orList.push({ userId: new mongoose.Types.ObjectId(rawId) });
    }
  }

  if (username) {
    orList.push({ username: username });
  }

  return orList.length > 0 ? { $or: orList } : {};
};

// ==========================================
// GET USER UNIFIED TRANSACTION PASSBOOK
// ==========================================
router.get('/my-transactions', authMiddleware, async (req, res) => {
  try {
    const userFilter = buildUserFilter(req.user);

    // 1. Fetch explicit ledger transactions
    const ledgerTxns = await Transaction.find(userFilter).lean();

    // 2. Fetch Deposits
    const deposits = await Deposit.find(userFilter).lean();
    const formattedDeposits = deposits.map((d) => ({
      _id: d._id,
      type: 'DEPOSIT',
      category: 'CREDIT',
      amount: Number(d.amount),
      status: d.status === 'approved' ? 'SUCCESS' : d.status === 'pending' ? 'PENDING' : 'REJECTED',
      description: `Wallet Deposit (UTR: ${d.utrNumber || d.utr || 'N/A'})`,
      referenceId: d.utrNumber || d.utr || '',
      createdAt: d.createdAt
    }));

    // 3. Fetch Withdrawals
    const withdrawals = await Withdrawal.find(userFilter).lean();
    const formattedWithdrawals = withdrawals.map((w) => ({
      _id: w._id,
      type: 'WITHDRAWAL',
      category: 'DEBIT',
      amount: Number(w.amount),
      status: w.status === 'approved' ? 'SUCCESS' : w.status === 'pending' ? 'PENDING' : 'REJECTED',
      description: w.payoutMethod === 'BANK_TRANSFER'
        ? `Bank Payout (${w.bankDetails?.accountNumber ? 'A/C ••••' + w.bankDetails.accountNumber.slice(-4) : 'Bank'})`
        : `UPI Payout (${w.upiId || 'UPI'})`,
      referenceId: w.payoutRef || '',
      adminRemark: w.adminRemark || '',
      createdAt: w.createdAt
    }));

    // 4. Merge & Sort Newest First
    const allTransactions = [...ledgerTxns, ...formattedDeposits, ...formattedWithdrawals];
    allTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(allTransactions);
  } catch (err) {
    console.error('TRANSACTIONS FETCH ERROR:', err);
    res.status(500).json({ message: 'Error loading passbook transactions.' });
  }
});

// ==========================================
// GET USER MATCH & GAME HISTORY
// ==========================================
router.get('/game-history', authMiddleware, async (req, res) => {
  try {
    const userFilter = buildUserFilter(req.user);

    const transactions = await Transaction.find({
      $and: [
        userFilter,
        { type: { $in: ['GAME_FEE', 'GAME_WIN', 'REFUND'] } }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    const matchesMap = {};

    transactions.forEach((tx) => {
      const roomId = tx.referenceId || `MATCH_${tx._id}`;

      let detectedGameType = 'GAME';
      if (typeof roomId === 'string' && roomId.startsWith('ROOM_')) {
        detectedGameType = roomId.split('_')[1] || 'GAME';
      } else if (tx.description) {
        detectedGameType = tx.description.split(' ')[0] || 'GAME';
      }

      if (!matchesMap[roomId]) {
        matchesMap[roomId] = {
          roomId,
          date: tx.createdAt,
          gameType: detectedGameType.toUpperCase(),
          entryFee: 0,
          winnings: 0,
          status: 'LOST',
          description: tx.description || ''
        };
      }

      if (tx.type === 'GAME_FEE') {
        matchesMap[roomId].entryFee = Number(tx.amount) || 0;
      } else if (tx.type === 'GAME_WIN') {
        matchesMap[roomId].winnings = Number(tx.amount) || 0;
        matchesMap[roomId].status = 'WON';
      } else if (tx.type === 'REFUND') {
        matchesMap[roomId].status = 'REFUNDED';
      }
    });

    res.json({
      success: true,
      data: Object.values(matchesMap)
    });
  } catch (error) {
    console.error('GAME HISTORY FETCH ERROR:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch game history.' });
  }
});

// ==========================================
// SEED TEST HISTORY ROUTE (FOR DEBUGGING)
// ==========================================
router.post('/seed-test-history', authMiddleware, async (req, res) => {
  try {
    const rawId = req.user.id || req.user._id || req.user.userId;
    const testRoomId = `ROOM_FRUIT_${Date.now()}`;

    await Transaction.create({
      userId: rawId,
      username: req.user.username,
      type: 'GAME_FEE',
      category: 'DEBIT',
      amount: 50,
      description: 'FRUIT Ninja Entry Fee',
      referenceId: testRoomId,
      status: 'SUCCESS'
    });

    await Transaction.create({
      userId: rawId,
      username: req.user.username,
      type: 'GAME_WIN',
      category: 'CREDIT',
      amount: 90,
      description: 'FRUIT Ninja Victory Prize',
      referenceId: testRoomId,
      status: 'SUCCESS'
    });

    res.json({ success: true, message: 'Test game history generated! Check your Game History tab.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;