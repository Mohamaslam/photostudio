require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth.routes');
const galleryRoutes = require('./routes/gallery.routes');
const commentRoutes = require('./routes/comment.routes');
const customerRoutes = require('./routes/customer.routes');
const { authenticateJWT, requireAdmin } = require('./middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
const frontendDir = path.join(__dirname, '..', 'Frontend');
app.use(express.static(frontendDir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/comments', commentRoutes);
// Mount customer/application routes at both paths for compatibility
app.use('/api/applications', customerRoutes);
app.use('/api/customers', customerRoutes);

// Admin endpoints (minimal admin APIs used by admin UI)
app.get('/api/admin/users', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, role, first_name, last_name, email, phone, is_active, created_at FROM users ORDER BY created_at DESC');
    return res.json({ users: rows });
  } catch (err) {
    console.error('Admin users error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/comments', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.photo_id, c.user_id, u.first_name, u.last_name, c.content, c.is_flagged, c.created_at
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC LIMIT 1000`
    );
    return res.json({ comments: rows });
  } catch (err) {
    console.error('Admin comments error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Aliases for simpler public endpoints
// POST /apply - logged-in users submit application (same as POST /api/applications/)
app.post('/apply', authenticateJWT, async (req, res) => {
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
    console.error('Apply alias error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /applications - admin-only list of applications (same as GET /api/applications)
app.get('/applications', authenticateJWT, requireAdmin, async (req, res) => {
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
    console.error('Applications alias error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

// Error handler (fallback)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  server.close(async () => {
    try {
      await pool.end();
      console.log('DB pool closed');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown', err);
      process.exit(1);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
