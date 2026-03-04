const router = require('express').Router();
const { body } = require('express-validator');
const db = require('../db/schema');
const { authRequired, authOptional } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Helper: get repo
const getRepo = (owner, repoName) => db.prepare(`
  SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id
  WHERE u.username=? AND r.name=?`).get(owner, repoName);

// ═══════════════════════════════════════════════════════════════
//  ISSUES
// ═══════════════════════════════════════════════════════════════

// GET /api/issues/:owner/:repo
router.get('/:owner/:repo/issues', authOptional, (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  if (repo.is_private && (!req.user || req.user.id !== repo.owner_id)) return res.status(403).json({ error: 'Private' });

  const { status = 'open', page = 1 } = req.query;
  const offset = (page - 1) * 20;

  const issues = db.prepare(`
    SELECT i.*, u.username AS author_username, u.avatar_url AS author_avatar
    FROM issues i JOIN users u ON i.author_id=u.id
    WHERE i.repo_id=? AND i.status=?
    ORDER BY i.created_at DESC LIMIT 20 OFFSET ?
  `).all(repo.id, status, offset);

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM issues WHERE repo_id=? AND status=?').get(repo.id, status);

  res.json({ issues: issues.map(i => ({ ...i, labels: JSON.parse(i.labels || '[]') })), total: total.cnt });
});

// POST /api/issues/:owner/:repo
router.post('/:owner/:repo/issues', authRequired, [
  body('title').trim().isLength({ min: 1, max: 256 }).withMessage('Title required (max 256)'),
  body('body').optional().trim(),
  body('labels').optional().isArray(),
  validate
], (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });

  const { title, body: issueBody, labels = [] } = req.body;

  const result = db.prepare(`
    INSERT INTO issues (repo_id, author_id, title, body, labels) VALUES (?, ?, ?, ?, ?)
  `).run(repo.id, req.user.id, title, issueBody, JSON.stringify(labels));

  db.prepare('UPDATE repositories SET issues_count = issues_count + 1 WHERE id=?').run(repo.id);

  // Notify repo owner
  if (repo.owner_id !== req.user.id) {
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, repo_id)
      VALUES (?, 'issue', ?, ?, ?)`).run(repo.owner_id, `New issue: ${title}`, `${req.user.username} opened a new issue`, repo.id);
  }

  res.status(201).json({ message: 'Issue created', id: result.lastInsertRowid });
});

// GET /api/issues/:owner/:repo/:id
router.get('/:owner/:repo/issues/:id', authOptional, (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });

  const issue = db.prepare(`
    SELECT i.*, u.username AS author_username, u.avatar_url AS author_avatar
    FROM issues i JOIN users u ON i.author_id=u.id
    WHERE i.id=? AND i.repo_id=?`).get(req.params.id, repo.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON c.author_id=u.id
    WHERE c.target_type='issue' AND c.target_id=? ORDER BY c.created_at ASC`).all(issue.id);

  res.json({ issue: { ...issue, labels: JSON.parse(issue.labels || '[]') }, comments });
});

// PATCH /api/issues/:owner/:repo/:id (close/reopen)
router.patch('/:owner/:repo/issues/:id', authRequired, [
  body('status').isIn(['open', 'closed']),
  validate
], (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Only repo owner can do this' });

  const { status } = req.body;
  const closedAt = status === 'closed' ? "datetime('now')" : null;

  db.prepare(`UPDATE issues SET status=?, closed_at=${closedAt ? "datetime('now')" : 'NULL'}, updated_at=datetime('now') WHERE id=? AND repo_id=?`)
    .run(status, req.params.id, repo.id);

  if (status === 'closed') {
    db.prepare('UPDATE repositories SET issues_count = MAX(0, issues_count - 1) WHERE id=?').run(repo.id);
  } else {
    db.prepare('UPDATE repositories SET issues_count = issues_count + 1 WHERE id=?').run(repo.id);
  }

  res.json({ message: `Issue ${status}` });
});

// ═══════════════════════════════════════════════════════════════
//  PULL REQUESTS
// ═══════════════════════════════════════════════════════════════

// GET /api/prs/:owner/:repo
router.get('/:owner/:repo/pulls', authOptional, (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });

  const { status = 'open' } = req.query;
  const prs = db.prepare(`
    SELECT pr.*, u.username AS author_username, u.avatar_url AS author_avatar
    FROM pull_requests pr JOIN users u ON pr.author_id=u.id
    WHERE pr.repo_id=? AND pr.status=?
    ORDER BY pr.created_at DESC LIMIT 30
  `).all(repo.id, status);

  res.json({ pull_requests: prs.map(p => ({ ...p, labels: JSON.parse(p.labels || '[]') })) });
});

// POST /api/prs/:owner/:repo
router.post('/:owner/:repo/pulls', authRequired, [
  body('title').trim().isLength({ min: 1, max: 256 }),
  body('body').optional().trim(),
  body('from_branch').trim().isLength({ min: 1 }),
  body('to_branch').optional().trim(),
  body('labels').optional().isArray(),
  validate
], (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });

  const { title, body: prBody, from_branch, to_branch = 'main', labels = [] } = req.body;

  const result = db.prepare(`
    INSERT INTO pull_requests (repo_id, author_id, title, body, from_branch, to_branch, labels)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(repo.id, req.user.id, title, prBody, from_branch, to_branch, JSON.stringify(labels));

  // Notify
  if (repo.owner_id !== req.user.id) {
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, repo_id)
      VALUES (?, 'pr', ?, ?, ?)`).run(repo.owner_id, `New PR: ${title}`, `${req.user.username} opened a pull request`, repo.id);
  }

  res.status(201).json({ message: 'Pull request opened', id: result.lastInsertRowid });
});

// PATCH /api/prs/:owner/:repo/:id
router.patch('/:owner/:repo/pulls/:id', authRequired, [
  body('status').isIn(['open', 'closed', 'merged']),
  validate
], (req, res) => {
  const repo = getRepo(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Only repo owner' });

  const { status } = req.body;
  const mergedAt = status === 'merged' ? "datetime('now')" : null;

  db.prepare(`UPDATE pull_requests SET status=?, merged_at=${mergedAt ? "datetime('now')" : 'NULL'}, updated_at=datetime('now') WHERE id=? AND repo_id=?`)
    .run(status, req.params.id, repo.id);

  res.json({ message: `PR ${status}` });
});

// ═══════════════════════════════════════════════════════════════
//  COMMENTS (shared for issues + PRs)
// ═══════════════════════════════════════════════════════════════

// POST /api/comments
router.post('/comments', authRequired, [
  body('target_type').isIn(['issue', 'pr', 'commit']),
  body('target_id').isInt({ min: 1 }),
  body('body').trim().isLength({ min: 1, max: 65536 }),
  validate
], (req, res) => {
  const { target_type, target_id, body: commentBody } = req.body;

  const result = db.prepare(`INSERT INTO comments (target_type, target_id, author_id, body) VALUES (?, ?, ?, ?)`)
    .run(target_type, target_id, req.user.id, commentBody);

  res.status(201).json({ message: 'Comment posted', id: result.lastInsertRowid });
});

// DELETE /api/comments/:id
router.delete('/comments/:id', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id=?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.author_id !== req.user.id) return res.status(403).json({ error: 'Not your comment' });

  db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
  res.json({ message: 'Comment deleted' });
});

module.exports = router;
