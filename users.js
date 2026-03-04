const router = require('express').Router();
const db = require('../db/schema');
const { authRequired, authOptional } = require('../middleware/auth');

// ── GET /api/users/:username ───────────────────────────────────────────
router.get('/:username', authOptional, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url, u.website, u.location,
           u.company, u.twitter, u.created_at,
           (SELECT COUNT(*) FROM repositories WHERE owner_id=u.id AND is_private=0) AS public_repos,
           (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
           (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
           (SELECT COUNT(*) FROM stars s JOIN repositories r ON s.repo_id=r.id WHERE r.owner_id=u.id) AS total_stars
    FROM users u WHERE u.username=?
  `).get(req.params.username);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const isFollowing = req.user
    ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id, user.id)
    : false;

  res.json({ user: { ...user, is_following: isFollowing } });
});

// ── GET /api/users/:username/repos ────────────────────────────────────
router.get('/:username/repos', authOptional, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const showPrivate = req.user && req.user.id === user.id;
  const where = showPrivate ? 'owner_id=?' : 'owner_id=? AND is_private=0';

  const repos = db.prepare(`
    SELECT * FROM repositories WHERE ${where} ORDER BY updated_at DESC
  `).all(user.id);

  res.json({ repos: repos.map(r => ({ ...r, topics: JSON.parse(r.topics || '[]') })) });
});

// ── GET /api/users/:username/starred ──────────────────────────────────
router.get('/:username/starred', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const repos = db.prepare(`
    SELECT r.*, u.username AS owner_username, u.avatar_url AS owner_avatar
    FROM stars s
    JOIN repositories r ON s.repo_id=r.id
    JOIN users u ON r.owner_id=u.id
    WHERE s.user_id=? AND r.is_private=0
    ORDER BY s.created_at DESC LIMIT 50
  `).all(user.id);

  res.json({ repos: repos.map(r => ({ ...r, topics: JSON.parse(r.topics || '[]') })) });
});

// ── POST /api/users/:username/follow ──────────────────────────────────
router.post('/:username/follow', authRequired, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't follow yourself" });

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id, target.id);

  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?').run(req.user.id, target.id);
    return res.json({ following: false, message: 'Unfollowed' });
  }

  db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, target.id);

  // Notify
  db.prepare(`INSERT INTO notifications (user_id, type, title, body)
    VALUES (?, 'follow', 'New follower', ?)`).run(target.id, `${req.user.username} started following you`);

  res.json({ following: true, message: 'Following' });
});

// ── GET /api/users/:username/followers ────────────────────────────────
router.get('/:username/followers', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const followers = db.prepare(`
    SELECT u.id, u.username, u.name, u.avatar_url, u.bio
    FROM follows f JOIN users u ON f.follower_id=u.id
    WHERE f.following_id=? ORDER BY f.created_at DESC LIMIT 50
  `).all(user.id);

  res.json({ followers });
});

// ── GET /api/users/:username/following ────────────────────────────────
router.get('/:username/following', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const following = db.prepare(`
    SELECT u.id, u.username, u.name, u.avatar_url, u.bio
    FROM follows f JOIN users u ON f.following_id=u.id
    WHERE f.follower_id=? ORDER BY f.created_at DESC LIMIT 50
  `).all(user.id);

  res.json({ following });
});

// ── GET /api/users/:username/activity ─────────────────────────────────
router.get('/:username/activity', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const activity = db.prepare(`
    SELECT a.*, r.name AS repo_name, u.username AS owner_username
    FROM activities a
    LEFT JOIN repositories r ON a.repo_id=r.id
    LEFT JOIN users u ON r.owner_id=u.id
    WHERE a.actor_id=? ORDER BY a.created_at DESC LIMIT 30
  `).all(user.id);

  res.json({ activity: activity.map(a => ({ ...a, payload: JSON.parse(a.payload || '{}') })) });
});

// ── NOTIFICATIONS ──────────────────────────────────────────────────────

// GET /api/notifications
router.get('/notifications/all', authRequired, (req, res) => {
  const { unread_only = false } = req.query;
  let where = 'user_id=?';
  const params = [req.user.id];

  if (unread_only === 'true') {
    where += ' AND is_read=0';
  }

  const notifications = db.prepare(`
    SELECT n.*, r.name AS repo_name, u.username AS repo_owner
    FROM notifications n
    LEFT JOIN repositories r ON n.repo_id=r.id
    LEFT JOIN users u ON r.owner_id=u.id
    WHERE ${where} ORDER BY n.created_at DESC LIMIT 50
  `).all(...params);

  const unreadCount = db.prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id=? AND is_read=0').get(req.user.id);

  res.json({ notifications, unread_count: unreadCount.cnt });
});

// PATCH /api/notifications/:id/read
router.patch('/notifications/:id/read', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ message: 'Marked as read' });
});

// PATCH /api/notifications/read-all
router.patch('/notifications/read-all', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ message: 'All notifications marked as read' });
});

// DELETE /api/notifications/:id
router.delete('/notifications/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ message: 'Notification deleted' });
});

module.exports = router;
