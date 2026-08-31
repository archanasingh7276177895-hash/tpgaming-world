const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 10
    },
    upiId: {
      type: String,
      default: ''
    },
    bankDetails: {
      accountNumber: String,
      ifsc: String,
      accountHolderName: String
    },
    payoutMethod: {
      type: String,
      enum: ['UPI', 'BANK_TRANSFER'],
      default: 'UPI'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    payoutRef: {
      type: String,
      default: ''
    },
    adminRemark: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);