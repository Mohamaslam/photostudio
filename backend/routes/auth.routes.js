const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

// Helper: remove sensitive fields before sending user back
function sanitizeUser(userRow) {
  const { password_hash, ...u } = userRow;
  return u;
}

// Register: create a new user (customer by default)
// Body: { name OR first_name, last_name?, email, phone, password, role? }
router.post('/register', async (req, res) => {
  try {
    const { name, first_name, last_name, email, phone, password, role = 'customer' } = req.body || {};

    // Support 'name' as a single field or first_name + last_name
    let fName = first_name && String(first_name).trim();
    let lName = last_name && String(last_name).trim();
    if (!fName && name) {
      const parts = String(name).trim().split(/\s+/);
      fName = parts.shift() || null;
      lName = parts.length ? parts.join(' ') : lName || null;
    }

    if (!fName || !email || !password) {
      return res.status(400).json({ error: 'name (or first_name), email and password are required' });
    }

    // Basic validation
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check email uniqueness
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const [result] = await pool.query(
      'INSERT INTO users (role, first_name, last_name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [role, fName, lName || null, normalizedEmail, passwordHash, phone || null]
    );

    const userId = result.insertId;
    const [rows] = await pool.query('SELECT id, role, first_name, last_name, email, phone, is_active, created_at FROM users WHERE id = ?', [userId]);

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login: validate credentials and return JWT
// Body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query('SELECT id, role, first_name, last_name, email, password_hash, is_active FROM users WHERE email = ?', [normalizedEmail]);

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenPayload = { userId: user.id, role: user.role };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const sanitized = {
      id: user.id,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email
    };

    return res.json({ token, user: sanitized });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
