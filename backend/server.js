require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize Express App
const app = express();
const server = http.createServer(app);

// ==========================================
// ENSURE UPLOADS DIRECTORY EXISTS
// ==========================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ==========================================
// ALLOWED ORIGINS CONFIGURATION
// ==========================================
const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://tpgaming-frontend.onrender.com' // Your Render static site domain
];

// ==========================================
// MIDDLEWARES & CORS
// ==========================================
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl requests) or if origin is in allowed list
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded static files
app.use('/uploads', express.static(uploadsDir));

// ==========================================
// CONNECT TO MONGODB
// ==========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tpgaming-world';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ==========================================
// IMPORT ROUTES
// ==========================================
const depositRoutes = require('./routes/deposit');
const withdrawalRoutes = require('./routes/withdrawal');
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transaction'); 
const adminRoutes = require('./routes/adminRoutes');

// ==========================================
// MOUNT ROUTES
// ==========================================
// Auth Routes
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// Deposit Routes
app.use('/api/deposit', depositRoutes);
app.use('/deposit', depositRoutes);

// Withdrawal Routes
app.use('/api/withdraw', withdrawalRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/withdraw', withdrawalRoutes);
app.use('/withdrawal', withdrawalRoutes);

// Transaction Routes
app.use('/api/transaction', transactionRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/transaction', transactionRoutes);
app.use('/transactions', transactionRoutes);
app.use('/api/user', transactionRoutes);

// Admin Routes
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

// Root route check
app.get('/', (req, res) => {
  res.send('TP Gaming World API is running...');
});

// ==========================================
// SOCKET.IO & MATCHMAKING ENGINE SETUP
// ==========================================
try {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: { 
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.onrender.com')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  app.set('io', io);
  
  try {
    const gameSocket = require('./socket/gameSocket');
    gameSocket(io);
    console.log('🎮 Live Game Matchmaking Socket initialized');
  } catch (mErr) {
    console.warn('⚠️ Matchmaking socket initialization note:', mErr.message);
  }
} catch (e) {
  console.error('❌ Socket.io failed to initialize:', e.message);
}

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});