const express = require('express');
const pool = require('../db');
const { authenticateJWT, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// POST / - submit an application (authenticated users)
// Body: { full_name, email, phone, event_date, event_type, message }
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { full_name, email, phone, event_date, event_type, message } = req.body || {};
    if (!full_name || !email || !message) {
      return res.status(400).json({ error: 'full_name, email and message are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [result] = await pool.query(
      `INSERT INTO applications (user_id, full_name, email, phone, event_date, event_type, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, full_name.trim(), normalizedEmail, phone || null, event_date || null, event_type || null, message.trim(), 'pending']
    );

    const insertId = result.insertId;
    const [rows] = await pool.query('SELECT * FROM applications WHERE id = ?', [insertId]);
    return res.status(201).json({ application: rows[0] });
  } catch (err) {
    console.error('Create application error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / - list all applications (admin only)
// Supports pagination and optional ?status=pending
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status ? String(req.query.status).trim() : null;

    if (status) {
      const [rows] = await pool.query(
        `SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [status, limit, offset]
      );
      return res.json({ page, limit, applications: rows });
    }

    const [rows] = await pool.query(
      `SELECT * FROM applications ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.json({ page, limit, applications: rows });
  } catch (err) {
    console.error('List applications error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - view a single application (admin or owner)
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid application id' });

    const [rows] = await pool.query('SELECT * FROM applications WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Application not found' });

    const application = rows[0];
    const isOwner = application.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    return res.json({ application });
  } catch (err) {
    console.error('Get application error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/status - update status (admin only)
// Body: { status }
router.patch('/:id/status', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Invalid application id' });
    if (!status) return res.status(400).json({ error: 'status is required' });

    const [result] = await pool.query('UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [String(status).trim(), id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Application not found' });

    const [rows] = await pool.query('SELECT * FROM applications WHERE id = ?', [id]);
    return res.json({ application: rows[0] });
  } catch (err) {
    console.error('Update application status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
