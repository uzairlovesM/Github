// ── API Configuration ─────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/api';

// ── Token Management ──────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('gh_token'),
  setToken: (t) => localStorage.setItem('gh_token', t),
  removeToken: () => localStorage.removeItem('gh_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('gh_user')); } catch { return null; } },
  setUser: (u) => localStorage.setItem('gh_user', JSON.stringify(u)),
  removeUser: () => localStorage.removeItem('gh_user'),
  isLoggedIn: () => !!localStorage.getItem('gh_token'),
  logout: () => { Auth.removeToken(); Auth.removeUser(); window.location.href = '/pages/login.html'; }
};

// ── Base Fetch ────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw { status: res.status, message: data.error || 'Request failed', details: data.details };
  return data;
}

// ── Auth API ──────────────────────────────────────────────────────────
const AuthAPI = {
  register: (body) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiFetch('/auth/me'),
  updateProfile: (body) => apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (body) => apiFetch('/auth/password', { method: 'PUT', body: JSON.stringify(body) }),
};

// ── Repos API ─────────────────────────────────────────────────────────
const ReposAPI = {
  list: (params = {}) => apiFetch('/repos?' + new URLSearchParams(params)),
  create: (body) => apiFetch('/repos', { method: 'POST', body: JSON.stringify(body) }),
  get: (owner, repo) => apiFetch(`/repos/${owner}/${repo}`),
  update: (owner, repo, body) => apiFetch(`/repos/${owner}/${repo}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (owner, repo) => apiFetch(`/repos/${owner}/${repo}`, { method: 'DELETE' }),
  star: (owner, repo) => apiFetch(`/repos/${owner}/${repo}/star`, { method: 'POST' }),
  commits: (owner, repo) => apiFetch(`/repos/${owner}/${repo}/commits`),
  createCommit: (owner, repo, body) => apiFetch(`/repos/${owner}/${repo}/commits`, { method: 'POST', body: JSON.stringify(body) }),
  files: (owner, repo) => apiFetch(`/repos/${owner}/${repo}/files`),
  createFile: (owner, repo, body) => apiFetch(`/repos/${owner}/${repo}/files`, { method: 'POST', body: JSON.stringify(body) }),
};

// ── Users API ─────────────────────────────────────────────────────────
const UsersAPI = {
  get: (username) => apiFetch(`/users/${username}`),
  repos: (username) => apiFetch(`/users/${username}/repos`),
  starred: (username) => apiFetch(`/users/${username}/starred`),
  follow: (username) => apiFetch(`/users/${username}/follow`, { method: 'POST' }),
  followers: (username) => apiFetch(`/users/${username}/followers`),
  following: (username) => apiFetch(`/users/${username}/following`),
  activity: (username) => apiFetch(`/users/${username}/activity`),
};

// ── Issues API ────────────────────────────────────────────────────────
const IssuesAPI = {
  list: (owner, repo, params = {}) => apiFetch(`/${owner}/${repo}/issues?` + new URLSearchParams(params)),
  create: (owner, repo, body) => apiFetch(`/${owner}/${repo}/issues`, { method: 'POST', body: JSON.stringify(body) }),
  get: (owner, repo, id) => apiFetch(`/${owner}/${repo}/issues/${id}`),
  update: (owner, repo, id, body) => apiFetch(`/${owner}/${repo}/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// ── PRs API ───────────────────────────────────────────────────────────
const PRsAPI = {
  list: (owner, repo, params = {}) => apiFetch(`/${owner}/${repo}/pulls?` + new URLSearchParams(params)),
  create: (owner, repo, body) => apiFetch(`/${owner}/${repo}/pulls`, { method: 'POST', body: JSON.stringify(body) }),
  update: (owner, repo, id, body) => apiFetch(`/${owner}/${repo}/pulls/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// ── Comments API ──────────────────────────────────────────────────────
const CommentsAPI = {
  create: (body) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id) => apiFetch(`/comments/${id}`, { method: 'DELETE' }),
};

// ── Notifications API ─────────────────────────────────────────────────
const NotificationsAPI = {
  all: (params = {}) => apiFetch('/users/notifications/all?' + new URLSearchParams(params)),
  markRead: (id) => apiFetch(`/users/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/users/notifications/read-all', { method: 'PATCH' }),
  delete: (id) => apiFetch(`/users/notifications/${id}`, { method: 'DELETE' }),
};

// ── UI Helpers ────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.querySelector('.gh-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `gh-toast gh-toast--${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Loading...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return n.toString();
}

function langColor(lang) {
  const map = { JavaScript: '#f7df1e', TypeScript: '#2b7489', Python: '#3572A5', Rust: '#dea584', Go: '#00ADD8', Ruby: '#CC342D', Java: '#b07219', CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051', Swift: '#F05138', Kotlin: '#7F52FF', C: '#555555', 'C++': '#f34b7d', 'C#': '#239120' };
  return map[lang] || '#8b949e';
}

// ── Guard: redirect if not logged in ──────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = '/pages/login.html';
    return false;
  }
  return true;
}

// ── Load nav user info ────────────────────────────────────────────────
function initNav() {
  const user = Auth.getUser();
  const navAvatar = document.getElementById('nav-avatar');
  const navUsername = document.getElementById('nav-username');
  const logoutBtn = document.getElementById('logout-btn');
  const loginLink = document.getElementById('login-link');

  if (user && Auth.isLoggedIn()) {
    if (navAvatar) { navAvatar.src = user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}&background=0d1117&color=58a6ff`; navAvatar.style.display = 'block'; }
    if (navUsername) navUsername.textContent = user.username;
    if (loginLink) loginLink.style.display = 'none';
    if (logoutBtn) { logoutBtn.style.display = 'flex'; logoutBtn.onclick = () => Auth.logout(); }
  } else {
    if (navAvatar) navAvatar.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (loginLink) loginLink.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', initNav);
