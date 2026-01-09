// Simple gallery loader
// Expects container with id #gallery and optional paging controls

const API_BASE = window.API_BASE || '';

async function fetchPhotos(page = 1, limit = 20) {
  const res = await fetch(`${API_BASE}/api/gallery?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  const body = await res.json();
  return body.photos || [];
}

function createPhotoCard(photo) {
  const div = document.createElement('div');
  div.className = 'photo-card';

  const img = document.createElement('img');
  img.src = photo.thumbnail_path || photo.file_path;
  img.alt = photo.title || 'Photo';
  img.loading = 'lazy';
  div.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'photo-meta';
  const title = document.createElement('h3');
  title.textContent = photo.title || '';
  meta.appendChild(title);
  if (photo.description) {
    const p = document.createElement('p');
    p.textContent = photo.description;
    meta.appendChild(p);
  }
  div.appendChild(meta);

  return div;
}

async function renderGallery(containerId = 'gallery', page = 1, limit = 20) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p>Loading...</p>';
  try {
    const photos = await fetchPhotos(page, limit);
    container.innerHTML = '';
    if (photos.length === 0) {
      container.innerHTML = '<p>No photos yet.</p>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'photo-grid';
    photos.forEach((p) => {
      grid.appendChild(createPhotoCard(p));
    });
    container.appendChild(grid);
  } catch (err) {
    console.error('Gallery load error', err);
    container.innerHTML = '<p>Error loading photos.</p>';
  }
}

// Auto init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  renderGallery();
});
