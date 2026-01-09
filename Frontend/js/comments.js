// Comments UI: load comments for a photo and allow logged-in users to post/delete
// Expects a container with data-photo-id attribute, e.g. <div id="commentsSection" data-photo-id="123"></div>
// Optional form with id #commentForm and textarea name="content"

const API_BASE = window.API_BASE || '';
const AUTH_TOKEN_KEY = 'auth_token';

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('auth_user') || 'null');
  } catch (e) {
    return null;
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

async function fetchComments(photoId, page = 1, limit = 100) {
  const res = await fetch(`${API_BASE}/api/comments/${photoId}?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load comments');
  return await res.json();
}

function sanitizeText(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function renderCommentsList(container, comments) {
  container.innerHTML = '';

  if (!comments || comments.length === 0) {
    container.innerHTML = '<p>No comments yet.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'comments-list';

  const currentUser = getUser();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const currentUserId = currentUser && currentUser.id;

  comments.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'comment-item';

    const header = document.createElement('div');
    header.className = 'comment-header';
    const author = document.createElement('strong');
    author.innerHTML = sanitizeText(((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Anonymous');
    header.appendChild(author);

    const when = document.createElement('span');
    when.className = 'comment-date';
    when.textContent = formatDate(c.created_at);
    header.appendChild(when);

    li.appendChild(header);

    const body = document.createElement('div');
    body.className = 'comment-body';
    body.innerHTML = sanitizeText(c.content);
    li.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    // Delete if admin only
    if (isAdmin) {
      const del = document.createElement('button');
      del.className = 'comment-delete';
      del.textContent = 'Delete';
      del.dataset.commentId = c.id;
      del.addEventListener('click', async (e) => {
        if (!confirm('Delete this comment?')) return;
        try {
          const token = getToken();
          const resp = await fetch(`${API_BASE}/api/comments/${c.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
          });
          if (resp.ok) {
            li.remove();
          } else {
            const body = await resp.json().catch(() => ({}));
            alert(body.error || 'Failed to delete comment');
          }
        } catch (err) {
          console.error('Delete comment error', err);
          alert('Failed to delete comment');
        }
      });
      actions.appendChild(del);
    }

    li.appendChild(actions);
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

async function postComment(photoId, content, parent_comment_id = null) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ photo_id: photoId, content, parent_comment_id })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body;
  }

  return await res.json();
}

// Initialize comments UI for a container element
async function initCommentsFor(container) {
  const photoId = container && container.dataset && container.dataset.photoId;
  if (!photoId) return;

  const commentsListContainer = container.querySelector('.comments-list-container') || document.createElement('div');
  commentsListContainer.className = 'comments-list-container';
  container.appendChild(commentsListContainer);

  const form = container.querySelector('.commentForm');

  // Show login prompt if no token and no form available
  if (!getToken() && !form) {
    const msg = document.createElement('p');
    msg.innerHTML = 'Please <a href="/login.html">log in</a> to post comments.';
    container.appendChild(msg);
  }

  async function loadAndRender() {
    commentsListContainer.innerHTML = '<p>Loading comments...</p>';
    try {
      const body = await fetchComments(photoId);
      renderCommentsList(commentsListContainer, body.comments || []);
    } catch (err) {
      console.error('Load comments failed', err);
      commentsListContainer.innerHTML = '<p>Failed to load comments.</p>';
    }
  }

  // Wire form submission if present
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const content = (fd.get('content') || '').trim();
      const parent_comment_id = fd.get('parent_comment_id') || null;
      if (!content) return alert('Please enter a comment');

      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn && (submitBtn.disabled = true);
      try {
        await postComment(photoId, content, parent_comment_id);
        form.reset();
        await loadAndRender();
      } catch (err) {
        console.error('Post comment error', err);
        const message = (err && (err.error || err.message)) || 'Failed to post comment';
        alert(message);
      } finally {
        submitBtn && (submitBtn.disabled = false);
      }
    });
  }

  // Initial load
  await loadAndRender();
}

// Auto-init for any element with data-photo-id on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-photo-id]').forEach((el) => {
    initCommentsFor(el);
  });
});

// Expose init function for dynamic use (e.g., gallery cards created after DOMContentLoaded)
window.initCommentsFor = initCommentsFor;
