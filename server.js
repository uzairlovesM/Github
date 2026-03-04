require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure upload dir ─────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Security & Middleware ──────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Static Files ───────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Rate Limiting ──────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  message: { error: 'Too many requests, please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, try again in 15 minutes.' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Initialize DB ──────────────────────────────────────────────────────
require('./db/schema');

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/repos', require('./routes/repos'));
app.use('/api/users', require('./routes/users'));
app.use('/api', require('./routes/issues'));  // /api/:owner/:repo/issues etc.

// ── Health Check ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV
  });
});

// ── API Docs stub ─────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'GitHub Clone API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login',
        'GET /api/auth/me': 'Get current user (auth required)',
        'PUT /api/auth/profile': 'Update profile (auth required)',
        'PUT /api/auth/password': 'Change password (auth required)',
      },
      repos: {
        'GET /api/repos': 'List/search public repos',
        'POST /api/repos': 'Create repo (auth required)',
        'GET /api/repos/:owner/:repo': 'Get repo details',
        'PUT /api/repos/:owner/:repo': 'Update repo (owner only)',
        'DELETE /api/repos/:owner/:repo': 'Delete repo (owner only)',
        'POST /api/repos/:owner/:repo/star': 'Star/unstar (auth required)',
        'GET /api/repos/:owner/:repo/commits': 'List commits',
        'POST /api/repos/:owner/:repo/commits': 'Add commit (owner only)',
        'GET /api/repos/:owner/:repo/files': 'List files',
        'POST /api/repos/:owner/:repo/files': 'Add file (owner only)',
      },
      users: {
        'GET /api/users/:username': 'Get user profile',
        'GET /api/users/:username/repos': 'User repositories',
        'GET /api/users/:username/starred': 'Starred repos',
        'POST /api/users/:username/follow': 'Follow/unfollow (auth required)',
        'GET /api/users/:username/followers': 'List followers',
        'GET /api/users/:username/following': 'List following',
        'GET /api/users/:username/activity': 'Activity feed',
      },
      issues: {
        'GET /api/:owner/:repo/issues': 'List issues',
        'POST /api/:owner/:repo/issues': 'Create issue (auth required)',
        'GET /api/:owner/:repo/issues/:id': 'Get issue + comments',
        'PATCH /api/:owner/:repo/issues/:id': 'Close/reopen issue (owner only)',
      },
      pullRequests: {
        'GET /api/:owner/:repo/pulls': 'List PRs',
        'POST /api/:owner/:repo/pulls': 'Open PR (auth required)',
        'PATCH /api/:owner/:repo/pulls/:id': 'Merge/close PR (owner only)',
      },
      comments: {
        'POST /api/comments': 'Post comment (auth required)',
        'DELETE /api/comments/:id': 'Delete comment (author only)',
      },
      notifications: {
        'GET /api/users/notifications/all': 'Get notifications (auth required)',
        'PATCH /api/users/notifications/:id/read': 'Mark read',
        'PATCH /api/users/notifications/read-all': 'Mark all read',
        'DELETE /api/users/notifications/:id': 'Delete notification',
      }
    }
  });
});

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 GitHub Clone API running at http://localhost:${PORT}`);
  console.log(`📖 API docs: http://localhost:${PORT}/api`);
  console.log(`🏥 Health:   http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
