const express = require('express');
const pool = require('../db');
const { authenticateJWT, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// GET / - list public photos (supports pagination: ?page=1&limit=20)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at
       FROM photos
       WHERE is_public = 1
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.json({ page, limit, photos: rows });
  } catch (err) {
    console.error('Get photos error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - get a single photo; public if is_public OR admin
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid photo id' });

    const [rows] = await pool.query('SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at FROM photos WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Photo not found' });

    const photo = rows[0];
    if (!photo.is_public && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({ photo });
  } catch (err) {
    console.error('Get photo error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / - create a photo (admin only)
// Body: { title, description, file_path (required), thumbnail_path, width, height, taken_at, is_public }
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { title, description, file_path, thumbnail_path, width, height, taken_at, is_public = 1 } = req.body || {};

    if (!file_path) return res.status(400).json({ error: 'file_path is required' });

    const [result] = await pool.query(
      `INSERT INTO photos (user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title || null, description || null, file_path, thumbnail_path || null, width || null, height || null, taken_at || null, is_public ? 1 : 0]
    );

    const insertId = result.insertId;
    const [rows] = await pool.query('SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at FROM photos WHERE id = ?', [insertId]);

    return res.status(201).json({ photo: rows[0] });
  } catch (err) {
    console.error('Create photo error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id - delete a photo (admin only)
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid photo id' });

    const [result] = await pool.query('DELETE FROM photos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Photo not found' });

    return res.status(204).send();
  } catch (err) {
    console.error('Delete photo error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Additional endpoints matching /photos contract ---

// GET /photos - list public photos (or all for admins)
router.get('/photos', async (req, res) => {
  try {
    // If caller provides a valid admin token, they may see all photos. Otherwise only public.
    let isAdmin = false;
    try {
      const authHeader = (req.headers.authorization || '').toString();
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_in_prod');
        if (payload && payload.role === 'admin') isAdmin = true;
      }
    } catch (e) {
      // ignore token errors and fall back to non-admin view
      isAdmin = false;
    }

    let rows;
    if (isAdmin) {
      const [r] = await pool.query(
        `SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at
         FROM photos
         ORDER BY created_at DESC`
      );
      rows = r;
    } else {
      const [r] = await pool.query(
        `SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at
         FROM photos
         WHERE is_public = 1
         ORDER BY created_at DESC`
      );
      rows = r;
    }

    return res.json({ photos: rows });
  } catch (err) {
    console.error('Get /photos error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /photos - create a photo (admin only)
router.post('/photos', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { title, description, file_path, thumbnail_path, width, height, taken_at, is_public = 1 } = req.body || {};

    if (!file_path) return res.status(400).json({ error: 'file_path is required' });

    const [result] = await pool.query(
      `INSERT INTO photos (user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title || null, description || null, file_path, thumbnail_path || null, width || null, height || null, taken_at || null, is_public ? 1 : 0]
    );

    const insertId = result.insertId;
    const [rows] = await pool.query('SELECT id, user_id, title, description, file_path, thumbnail_path, width, height, taken_at, is_public, created_at FROM photos WHERE id = ?', [insertId]);

    return res.status(201).json({ photo: rows[0] });
  } catch (err) {
    console.error('Create photo error (POST /photos):', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /photos/:id - delete photo by id (admin only)
router.delete('/photos/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid photo id' });

    const [result] = await pool.query('DELETE FROM photos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Photo not found' });

    return res.status(204).send();
  } catch (err) {
    console.error('Delete photo error (DELETE /photos/:id):', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
