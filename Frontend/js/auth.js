// Frontend auth helpers: register and login
// Expects forms with IDs: #registerForm and #loginForm
// Stores JWT in localStorage under key 'auth_token'

const API_BASE = window.API_BASE || '';
const AUTH_TOKEN_KEY = 'auth_token';

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, body };
  return body;
}

// Register handler
async function handleRegister(e) {
  e && e.preventDefault();
  const form = document.getElementById('registerForm');
  if (!form) return;

  const formData = new FormData(form);
  const first_name = (formData.get('first_name') || '').trim();
  const last_name = (formData.get('last_name') || '').trim();
  const email = (formData.get('email') || '').trim().toLowerCase();
  const phone = (formData.get('phone') || '').trim();
  const password = (formData.get('password') || '');
  const passwordConfirm = (formData.get('passwordConfirm') || '');

  // Basic validation
  if (!first_name) return alert('First name is required');
  if (!validateEmail(email)) return alert('Invalid email');
  if (!password || password.length < 6) return alert('Password must be at least 6 characters');
  if (password !== passwordConfirm) return alert('Passwords do not match');

  try {
    const body = await postJson(API_BASE + '/api/auth/register', {
      first_name, last_name, email, phone, password
    });
    alert('Registration successful');
    // Optionally auto-login: if backend returns user only, redirect to login
    window.location.href = '/login.html';
  } catch (err) {
    console.error('Register error', err);
    const msg = (err && err.body && (err.body.error || err.body.message)) || 'Registration failed';
    alert(msg);
  }
}

// Login handler
async function handleLogin(e) {
  e && e.preventDefault();
  const form = document.getElementById('loginForm');
  if (!form) return;

  const formData = new FormData(form);
  const email = (formData.get('email') || '').trim().toLowerCase();
  const password = (formData.get('password') || '');

  if (!validateEmail(email)) return alert('Invalid email');
  if (!password) return alert('Password is required');

  try {
    const body = await postJson(API_BASE + '/api/auth/login', { email, password });
    if (body && body.token) {
      setToken(body.token);
      // Store user info and redirect based on role
      localStorage.setItem('auth_user', JSON.stringify(body.user || {}));
      const role = (body.user && body.user.role) || 'customer';
      if (role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/gallery.html';
      }
    } else {
      // show inline error if available
      const errEl = document.getElementById('loginError');
      const msg = 'Login succeeded but no token returned';
      if (errEl) errEl.textContent = msg; else alert(msg);
    }
  } catch (err) {
    console.error('Login error', err);
    const msg = (err && err.body && (err.body.error || err.body.message)) || 'Login failed';
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = msg; else alert(msg);
  }
}

// Attach event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const regForm = document.getElementById('registerForm');
  if (regForm) regForm.addEventListener('submit', handleRegister);

  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
});
