require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_prod';

// Middleware: verify JWT and attach user info to req.user
async function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token missing' });
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Optional: fetch user from DB to ensure it still exists / is active
    const userId = payload.userId;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    const [rows] = await pool.query('SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = ?', [userId]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach sanitized user and token payload
    req.user = {
      id: user.id,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email
    };
    req.auth = { payload };

    return next();
  } catch (err) {
    console.error('Authentication middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Middleware: allow only admin users
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  return next();
}

module.exports = {
  authenticateJWT,
  requireAdmin
};
