// Client-side handler for /apply.html
const API_BASE = window.API_BASE || '';
const AUTH_TOKEN_KEY = 'auth_token';

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch (e) { return null; } }

function setMessage(msg, type = 'success') {
  const el = document.getElementById('applyMessage');
  if (!el) return;
  el.className = `message ${type === 'error' ? 'error' : 'success'}`;
  el.textContent = msg;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function submitApplication(data) {
  const token = getToken();
  if (!token) throw { status: 401, message: 'Not authenticated' };

  const res = await fetch(`${API_BASE}/api/applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, body };
  return body;
}

// Wire form
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('applyForm');
  const user = getUser();

  if (!getToken()) {
    // Not logged in: disable form and show prompt
    const formEl = document.getElementById('applyForm');
    if (formEl) {
      Array.from(formEl.elements).forEach((el) => el.disabled = true);
      const msg = document.createElement('div');
      msg.className = 'message error';
      msg.innerHTML = 'You must <a href="/login.html">log in</a> to submit an application.';
      formEl.parentNode.insertBefore(msg, formEl);
    }
    return;
  }

  // Prefill name and email if available
  if (user) {
    const nameEl = document.getElementById('full_name');
    const emailEl = document.getElementById('email');
    if (nameEl && (!nameEl.value || nameEl.value.trim() === '')) nameEl.value = (user.first_name ? user.first_name + (user.last_name ? ' ' + user.last_name : '') : '');
    if (emailEl && (!emailEl.value || emailEl.value.trim() === '')) emailEl.value = user.email || '';
  }

  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('', '');

    const fd = new FormData(form);
    const full_name = (fd.get('full_name') || '').trim();
    const email = (fd.get('email') || '').trim().toLowerCase();
    const phone = (fd.get('phone') || '').trim();
    const event_type = (fd.get('event_type') || '').trim();
    const message = (fd.get('message') || '').trim();

    if (!full_name) return setMessage('Full name is required', 'error');
    if (!validateEmail(email)) return setMessage('Valid email is required', 'error');
    if (!message) return setMessage('Please provide a message or requirements', 'error');

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn && (submitBtn.disabled = true);

    try {
      await submitApplication({ full_name, email, phone: phone || null, event_type: event_type || null, message });
      setMessage('Application submitted successfully. We will contact you soon.', 'success');
      form.reset();
    } catch (err) {
      console.error('Submit application error', err);
      if (err && err.status === 401) {
        setMessage('Authentication required. Please log in again.', 'error');
        // optionally redirect to login
        // window.location.href = '/login.html';
      } else {
        const msg = (err && err.body && (err.body.error || err.body.message)) || 'Failed to submit application';
        setMessage(msg, 'error');
      }
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  });
});