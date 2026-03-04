const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../db/schema');
const { authRequired } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ── Helper: generate JWT ───────────────────────────────────────────────
const signToken = (user) => jwt.sign(
  { id: user.id, username: user.username },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// ── POST /api/auth/register ────────────────────────────────────────────
router.post('/register', [
  body('username')
    .trim()
    .isLength({ min: 3, max: 39 }).withMessage('Username must be 3–39 characters')
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/).withMessage('Username can only contain alphanumeric characters and hyphens'),
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/(?=.*[A-Z])(?=.*[0-9])/).withMessage('Password must contain at least one uppercase letter and one number'),
  body('name').optional().trim().isLength({ max: 60 }),
  validate
], async (req, res) => {
  try {
    const { username, email, password, name } = req.body;

    // Check existing
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (username, email, password, name)
      VALUES (?, ?, ?, ?)
    `).run(username, email, hashedPassword, name || username);

    const user = db.prepare('SELECT id, username, email, name, avatar_url, bio, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Seed welcome notification
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, body)
      VALUES (?, 'welcome', 'Welcome to GitHub Clone!', 'Start by creating your first repository.')
    `).run(user.id);

    const token = signToken(user);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, username: user.username, email: user.email, name: user.name, avatar_url: user.avatar_url }
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────
router.post('/login', [
  body('login').notEmpty().withMessage('Username or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? OR email = ?
    `).get(login, login);

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio
      }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.email, u.name, u.avatar_url, u.bio, u.website,
           u.location, u.company, u.twitter, u.created_at,
           (SELECT COUNT(*) FROM repositories WHERE owner_id = u.id AND is_private = 0) AS public_repos,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following
    FROM users u WHERE u.id = ?
  `).get(req.user.id);

  res.json({ user });
});

// ── PUT /api/auth/profile ──────────────────────────────────────────────
router.put('/profile', authRequired, [
  body('name').optional().trim().isLength({ max: 60 }),
  body('bio').optional().trim().isLength({ max: 160 }).withMessage('Bio max 160 chars'),
  body('website').optional().trim().isURL().withMessage('Valid URL required'),
  body('location').optional().trim().isLength({ max: 60 }),
  body('company').optional().trim().isLength({ max: 60 }),
  body('twitter').optional().trim(),
  validate
], (req, res) => {
  const { name, bio, website, location, company, twitter } = req.body;

  db.prepare(`
    UPDATE users SET name=?, bio=?, website=?, location=?, company=?, twitter=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, bio, website, location, company, twitter, req.user.id);

  const updated = db.prepare('SELECT id, username, email, name, bio, website, location, company, twitter, avatar_url FROM users WHERE id=?').get(req.user.id);
  res.json({ message: 'Profile updated', user: updated });
});

// ── PUT /api/auth/password ─────────────────────────────────────────────
router.put('/password', authRequired, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/(?=.*[A-Z])(?=.*[0-9])/),
  validate
], async (req, res) => {
  const user = db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
  const valid = await bcrypt.compare(req.body.currentPassword, user.password);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(req.body.newPassword, 12);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, req.user.id);
  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
