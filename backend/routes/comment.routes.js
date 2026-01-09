const express = require('express');
const pool = require('../db');
const { authenticateJWT, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// Helper: fetch comments for a photo with pagination
async function fetchComments(photoId, page = 1, limit = 100) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT c.id, c.photo_id, c.user_id, u.first_name, u.last_name, c.parent_comment_id, c.content, c.is_flagged, c.created_at, c.updated_at
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.photo_id = ?
     ORDER BY c.created_at ASC
     LIMIT ? OFFSET ?`,
    [photoId, limit, offset]
  );
  return rows;
}

// GET /:photoId - list comments for a photo (pagination support)
async function handleGetComments(req, res) {
  try {
    const photoId = Number(req.params.photoId);
    if (!photoId) return res.status(400).json({ error: 'Invalid photo id' });

    // Check photo exists
    const [photos] = await pool.query('SELECT id FROM photos WHERE id = ?', [photoId]);
    if (!photos || photos.length === 0) return res.status(404).json({ error: 'Photo not found' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 100);

    const comments = await fetchComments(photoId, page, limit);
    return res.json({ page, limit, comments });
  } catch (err) {
    console.error('Fetch comments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.get('/:photoId', handleGetComments);
// Backwards-compatible path
router.get('/photo/:photoId', handleGetComments);

// Create comment helper
async function createComment({ photoId, userId, content, parentId = null, ip = null }) {
  // Ensure photo exists
  const [photos] = await pool.query('SELECT id FROM photos WHERE id = ?', [photoId]);
  if (!photos || photos.length === 0) throw { status: 404, error: 'Photo not found' };

  // If parent_comment_id provided, validate it belongs to same photo
  if (parentId) {
    const [parents] = await pool.query('SELECT id, photo_id FROM comments WHERE id = ?', [parentId]);
    if (!parents || parents.length === 0) throw { status: 400, error: 'Parent comment not found' };
    if (parents[0].photo_id !== photoId) throw { status: 400, error: 'Parent comment does not belong to this photo' };
  }

  const [result] = await pool.query(
    `INSERT INTO comments (photo_id, user_id, parent_comment_id, content, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [photoId, userId, parentId, content.trim(), ip]
  );

  const insertId = result.insertId;
  const [rows] = await pool.query(
    `SELECT c.id, c.photo_id, c.user_id, u.first_name, u.last_name, c.parent_comment_id, c.content, c.is_flagged, c.created_at
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [insertId]
  );

  return rows[0];
}

// POST / - create a comment (authenticated users)
// Body: { photo_id, content, parent_comment_id }
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { photo_id, content, parent_comment_id } = req.body || {};
    const photoId = Number(photo_id);
    if (!photoId) return res.status(400).json({ error: 'photo_id is required' });
    if (!content || String(content).trim().length === 0) return res.status(400).json({ error: 'content is required' });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0,45) || null;
    const parentId = parent_comment_id ? Number(parent_comment_id) : null;

    const comment = await createComment({ photoId, userId: req.user.id, content, parentId, ip });
    return res.status(201).json({ comment });
  } catch (err) {
    console.error('Create comment error:', err);
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Backwards-compatible route: POST /photo/:photoId
router.post('/photo/:photoId', authenticateJWT, async (req, res) => {
  try {
    const photoId = Number(req.params.photoId);
    if (!photoId) return res.status(400).json({ error: 'Invalid photo id' });

    const { content, parent_comment_id } = req.body || {};
    if (!content || String(content).trim().length === 0) return res.status(400).json({ error: 'content is required' });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0,45) || null;
    const parentId = parent_comment_id ? Number(parent_comment_id) : null;

    const comment = await createComment({ photoId, userId: req.user.id, content, parentId, ip });
    return res.status(201).json({ comment });
  } catch (err) {
    console.error('Deprecated create comment error:', err);
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id - delete a comment (admin only)
router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid comment id' });

    const [rows] = await pool.query('SELECT id FROM comments WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Comment not found' });

    await pool.query('DELETE FROM comments WHERE id = ?', [id]);

    return res.status(204).send();
  } catch (err) {
    console.error('Delete comment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
