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
      minlength: 7,
      match: /^[a-zA-Z0-9_]+$/
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
    },
    isBlocked: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);