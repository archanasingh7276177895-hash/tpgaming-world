const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'GAME_FEE', 'GAME_WIN', 'ADMIN_ADJUST', 'REFUND'],
      required: true
    },
    category: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    previousBalance: {
      type: Number,
      default: 0
    },
    newBalance: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'PENDING', 'FAILED', 'REJECTED'],
      default: 'SUCCESS'
    },
    description: {
      type: String,
      required: true
    },
    referenceId: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);