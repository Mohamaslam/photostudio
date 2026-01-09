// Admin dashboard helpers
// Requires user to be admin (checks localStorage.auth_user.role)
// Provides functions to fetch users, applications, comments and manage photos/comments

const API_BASE = window.API_BASE || '';
const AUTH_TOKEN_KEY = 'auth_token';

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch (e) { return null; } }

function authFetch(url, opts = {}) {
  const token = getToken();
  opts.headers = opts.headers || {};
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, opts).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, body };
    return body;
  });
}

function ensureAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    alert('Admin access required');
    window.location.href = '/login.html';
    throw new Error('Not admin');
  }
}

// Fetch users
async function loadUsers(containerId = 'adminUsers') {
  ensureAdmin();
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<p>Loading users...</p>';
  try {
    const body = await authFetch(`${API_BASE}/api/admin/users`);
    el.innerHTML = '';
    if (!body.users || body.users.length === 0) {
      el.innerHTML = '<p>No users</p>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th></tr>';
    body.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.id}</td><td>${u.first_name} ${u.last_name || ''}</td><td>${u.email}</td><td>${u.role}</td>`;
      table.appendChild(tr);
    });
    el.appendChild(table);
  } catch (err) {
    console.error('Load users error', err);
    el.innerHTML = '<p>Failed to load users.</p>';
  }
}

// Fetch applications
async function loadApplications(containerId = 'adminApplications') {
  ensureAdmin();
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<p>Loading applications...</p>';
  try {
    const body = await authFetch(`${API_BASE}/api/applications`);
    el.innerHTML = '';
    if (!body.applications || body.applications.length === 0) {
      el.innerHTML = '<p>No applications</p>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<tr><th>ID</th><th>Name</th><th>Email</th><th>Event</th><th>Status</th><th>Actions</th></tr>';
    body.applications.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${a.id}</td><td>${a.full_name}</td><td>${a.email}</td><td>${a.event_type || ''}</td><td>${a.status}</td>`;
      const actionsTd = document.createElement('td');
      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => alert(JSON.stringify(a, null, 2)));
      actionsTd.appendChild(viewBtn);
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Confirm';
      confirmBtn.addEventListener('click', async () => {
        try {
          const res = await authFetch(`${API_BASE}/api/applications/${a.id}/status`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: 'confirmed'}) });
          alert('Status updated'); loadApplications(containerId);
        } catch (err) { alert('Failed to update status'); }
      });
      actionsTd.appendChild(confirmBtn);
      tr.appendChild(actionsTd);
      table.appendChild(tr);
    });
    el.appendChild(table);
  } catch (err) {
    console.error('Load applications error', err);
    el.innerHTML = '<p>Failed to load applications.</p>';
  }
}

// Fetch comments (admin)
async function loadComments(containerId = 'adminComments') {
  ensureAdmin();
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<p>Loading comments...</p>';
  try {
    const body = await authFetch(`${API_BASE}/api/admin/comments`);
    el.innerHTML = '';
    if (!body.comments || body.comments.length === 0) { el.innerHTML = '<p>No comments</p>'; return; }
    const ul = document.createElement('ul');
    body.comments.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${c.first_name || 'Anonymous'}</strong> (${c.created_at}): ${c.content}`;
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete comment?')) return;
        try {
          await authFetch(`${API_BASE}/api/comments/${c.id}`, { method: 'DELETE' });
          loadComments(containerId);
        } catch (err) { alert('Failed to delete'); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    el.appendChild(ul);
  } catch (err) {
    console.error('Load comments error', err);
    el.innerHTML = '<p>Failed to load comments.</p>';
  }
}

// Fetch photos for management (and allow adding new photos)
async function loadPhotos(containerId = 'adminPhotos') {
  ensureAdmin();
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<p>Loading photos...</p>';
  try {
    el.innerHTML = '';

    // Add photo form
    const addForm = document.createElement('form');
    addForm.className = 'admin-add-photo';
    addForm.style.marginBottom = '1rem';
    addForm.innerHTML = `
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
        <input name="title" placeholder="Title" style="padding:.4rem;border:1px solid #ddd;border-radius:6px;" />
        <input name="file_path" placeholder="Image URL (required)" required style="padding:.4rem;border:1px solid #ddd;border-radius:6px;min-width:260px;" />
        <input name="thumbnail_path" placeholder="Thumbnail URL (optional)" style="padding:.4rem;border:1px solid #ddd;border-radius:6px;" />
        <label style="display:flex;align-items:center;gap:.25rem;margin-left:.5rem;"><input type="checkbox" name="is_public" checked /> Public</label>
        <button type="submit" class="btn">Add photo</button>
      </div>
    `;
    el.appendChild(addForm);

    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addForm);
      const title = (fd.get('title') || '').trim();
      const file_path = (fd.get('file_path') || '').trim();
      const thumbnail_path = (fd.get('thumbnail_path') || '').trim();
      const is_public = fd.get('is_public') ? 1 : 0;
      if (!file_path) return alert('file_path is required');
      try {
        await authFetch(`${API_BASE}/api/gallery/photos`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, file_path, thumbnail_path: thumbnail_path || null, is_public }) });
        alert('Photo added');
        addForm.reset();
        loadPhotos(containerId);
      } catch (err) {
        console.error('Add photo error', err);
        const msg = (err && err.body && (err.body.error || err.body.message)) || 'Failed to add photo';
        alert(msg);
      }
    });

    // Fetch existing photos
    const body = await authFetch(`${API_BASE}/api/gallery?limit=200`);
    if (!body.photos || body.photos.length === 0) { el.appendChild(document.createElement('div')).innerHTML = '<p>No photos</p>'; return; }
    const grid = document.createElement('div'); grid.className = 'admin-photo-grid';
    body.photos.forEach(p => {
      const card = document.createElement('div'); card.className = 'admin-photo-card';
      card.innerHTML = `<img src="${p.thumbnail_path||p.file_path}" alt="${p.title||''}" style="max-width:160px;height:100px;object-fit:cover;border-radius:6px;"/><div>${p.title||''}</div>`;
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete photo?')) return;
        try { await authFetch(`${API_BASE}/api/gallery/${p.id}`, { method: 'DELETE' }); loadPhotos(containerId); } catch (err) { console.error('Delete photo error', err); alert('Failed to delete'); }
      });
      card.appendChild(del);
      grid.appendChild(card);
    });
    el.appendChild(grid);
  } catch (err) {
    console.error('Load photos error', err);
    el.innerHTML = '<p>Failed to load photos.</p>';
  }
}

// Auto init: call all loaders if on admin page
document.addEventListener('DOMContentLoaded', () => {
  try {
    ensureAdmin();
    loadUsers();
    loadApplications();
    loadComments();
    loadPhotos();
  } catch (e) { console.warn('Admin init aborted', e); }
});