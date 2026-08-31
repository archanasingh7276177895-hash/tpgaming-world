const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_123!';

const verifyToken = (req, res, next) => {
  // Extract Authorization header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  // Handle "Bearer <token>" format
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : authHeader;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. Token missing.' });
  }

  try {
    // Added clockTolerance: 30 seconds buffer to prevent false-positive expiration
    const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 30 });
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user && (req.user.role === 'admin' || req.user.isAdmin === true)) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Admin privileges required.'
      });
    }
  });
};

module.exports = {
  verifyToken,
  verifyAdmin
};
