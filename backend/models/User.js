// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      unique: true,
      minlength: 7, // Must be > 6 characters
      match: /^[a-zA-Z0-9_]+$/ // Fixed: Allows letters, numbers, and underscores
    },
    password: {
      type: String,
      required: true
    },
    balance: {
      type: Number,
      default: 0
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    isAdmin: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);