const router = require('express').Router();
const { body, param, query } = require('express-validator');
const db = require('../db/schema');
const { authRequired, authOptional } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const crypto = require('crypto');

// ── GET /api/repos  (explore/search) ──────────────────────────────────
router.get('/', authOptional, (req, res) => {
  const { q = '', lang, sort = 'updated', page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let where = 'r.is_private = 0';
  const params = [];

  if (q) {
    where += ' AND (r.name LIKE ? OR r.description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (lang) {
    where += ' AND r.language = ?';
    params.push(lang);
  }

  const orderMap = { updated: 'r.updated_at', stars: 'r.stars_count', forks: 'r.forks_count', created: 'r.created_at' };
  const orderBy = orderMap[sort] || 'r.updated_at';

  const repos = db.prepare(`
    SELECT r.*, u.username AS owner_username, u.avatar_url AS owner_avatar
    FROM repositories r
    JOIN users u ON r.owner_id = u.id
    WHERE ${where}
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), parseInt(offset));

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM repositories r JOIN users u ON r.owner_id=u.id WHERE ${where}`).get(...params);

  res.json({ repos: repos.map(r => ({ ...r, topics: JSON.parse(r.topics || '[]') })), total: total.cnt, page: parseInt(page) });
});

// ── POST /api/repos ────────────────────────────────────────────────────
router.post('/', authRequired, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Repo name required (max 100)')
    .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Repo name: letters, numbers, _, ., - only'),
  body('description').optional().trim().isLength({ max: 350 }),
  body('is_private').optional().isBoolean(),
  body('language').optional().trim(),
  body('license').optional().trim(),
  body('topics').optional().isArray(),
  body('readme').optional().trim(),
  body('auto_init').optional().isBoolean(),
  validate
], (req, res) => {
  const { name, description, is_private = false, language, license, topics = [], readme, auto_init = false } = req.body;

  // Check duplicate
  const existing = db.prepare('SELECT id FROM repositories WHERE owner_id=? AND name=?').get(req.user.id, name);
  if (existing) return res.status(409).json({ error: `Repository '${name}' already exists for this account` });

  const defaultReadme = readme || (auto_init ? `# ${name}\n\n${description || 'A new GitHub Clone repository.'}\n` : null);

  const result = db.prepare(`
    INSERT INTO repositories (owner_id, name, description, is_private, language, license, topics, readme)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, description, is_private ? 1 : 0, language, license, JSON.stringify(topics), defaultReadme);

  const repoId = result.lastInsertRowid;

  // Auto-init: add README file
  if (auto_init && defaultReadme) {
    db.prepare('INSERT INTO repo_files (repo_id, path, type, content, size) VALUES (?, ?, ?, ?, ?)').run(
      repoId, 'README.md', 'file', defaultReadme, Buffer.byteLength(defaultReadme)
    );
    // Create initial commit
    const sha = crypto.randomBytes(20).toString('hex');
    db.prepare(`INSERT INTO commits (repo_id, author_id, sha, message, branch, files_changed, additions)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(repoId, req.user.id, sha, 'Initial commit', 'main', 1, defaultReadme.split('\n').length);
  }

  // Activity
  db.prepare(`INSERT INTO activities (actor_id, type, repo_id, payload) VALUES (?, 'create_repo', ?, ?)`)
    .run(req.user.id, repoId, JSON.stringify({ name }));

  const repo = db.prepare('SELECT r.*, u.username AS owner_username FROM repositories r JOIN users u ON r.owner_id=u.id WHERE r.id=?').get(repoId);
  res.status(201).json({ message: 'Repository created', repo: { ...repo, topics: JSON.parse(repo.topics) } });
});

// ── GET /api/repos/:owner/:repo ────────────────────────────────────────
router.get('/:owner/:repo', authOptional, (req, res) => {
  const { owner, repo: repoName } = req.params;

  const repo = db.prepare(`
    SELECT r.*, u.username AS owner_username, u.avatar_url AS owner_avatar, u.name AS owner_name
    FROM repositories r
    JOIN users u ON r.owner_id = u.id
    WHERE u.username = ? AND r.name = ?
  `).get(owner, repoName);

  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  if (repo.is_private && (!req.user || req.user.id !== repo.owner_id)) {
    return res.status(403).json({ error: 'This repository is private' });
  }

  const isStarred = req.user ? !!db.prepare('SELECT 1 FROM stars WHERE user_id=? AND repo_id=?').get(req.user.id, repo.id) : false;

  res.json({ repo: { ...repo, topics: JSON.parse(repo.topics || '[]'), is_starred: isStarred } });
});

// ── PUT /api/repos/:owner/:repo ────────────────────────────────────────
router.put('/:owner/:repo', authRequired, [
  body('description').optional().trim().isLength({ max: 350 }),
  body('is_private').optional().isBoolean(),
  body('topics').optional().isArray(),
  body('language').optional().trim(),
  body('website').optional().trim(),
  validate
], (req, res) => {
  const repo = db.prepare(`
    SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id
    WHERE u.username=? AND r.name=?`).get(req.params.owner, req.params.repo);

  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your repository' });

  const { description, is_private, topics, language, website } = req.body;

  db.prepare(`
    UPDATE repositories SET
      description = COALESCE(?, description),
      is_private  = COALESCE(?, is_private),
      topics      = COALESCE(?, topics),
      language    = COALESCE(?, language),
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(description ?? null, is_private !== undefined ? (is_private ? 1 : 0) : null,
     topics ? JSON.stringify(topics) : null, language ?? null, repo.id);

  res.json({ message: 'Repository updated' });
});

// ── DELETE /api/repos/:owner/:repo ─────────────────────────────────────
router.delete('/:owner/:repo', authRequired, (req, res) => {
  const repo = db.prepare(`
    SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id
    WHERE u.username=? AND r.name=?`).get(req.params.owner, req.params.repo);

  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your repository' });

  db.prepare('DELETE FROM repositories WHERE id=?').run(repo.id);
  res.json({ message: 'Repository deleted' });
});

// ── POST /api/repos/:owner/:repo/star ─────────────────────────────────
router.post('/:owner/:repo/star', authRequired, (req, res) => {
  const repo = db.prepare(`SELECT r.id FROM repositories r JOIN users u ON r.owner_id=u.id WHERE u.username=? AND r.name=?`)
    .get(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });

  const existing = db.prepare('SELECT 1 FROM stars WHERE user_id=? AND repo_id=?').get(req.user.id, repo.id);

  if (existing) {
    db.prepare('DELETE FROM stars WHERE user_id=? AND repo_id=?').run(req.user.id, repo.id);
    db.prepare('UPDATE repositories SET stars_count = MAX(0, stars_count - 1) WHERE id=?').run(repo.id);
    return res.json({ starred: false, message: 'Unstarred' });
  }

  db.prepare('INSERT INTO stars (user_id, repo_id) VALUES (?, ?)').run(req.user.id, repo.id);
  db.prepare('UPDATE repositories SET stars_count = stars_count + 1 WHERE id=?').run(repo.id);

  // Activity
  db.prepare("INSERT INTO activities (actor_id, type, repo_id) VALUES (?, 'star', ?)").run(req.user.id, repo.id);
  res.json({ starred: true, message: 'Starred' });
});

// ── GET /api/repos/:owner/:repo/commits ───────────────────────────────
router.get('/:owner/:repo/commits', authOptional, (req, res) => {
  const repo = db.prepare(`SELECT r.id, r.is_private, r.owner_id FROM repositories r JOIN users u ON r.owner_id=u.id WHERE u.username=? AND r.name=?`)
    .get(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.is_private && (!req.user || req.user.id !== repo.owner_id)) return res.status(403).json({ error: 'Private' });

  const commits = db.prepare(`
    SELECT c.*, u.username AS author_username, u.avatar_url AS author_avatar
    FROM commits c JOIN users u ON c.author_id=u.id
    WHERE c.repo_id=? ORDER BY c.created_at DESC LIMIT 50
  `).all(repo.id);

  res.json({ commits });
});

// ── POST /api/repos/:owner/:repo/commits ──────────────────────────────
router.post('/:owner/:repo/commits', authRequired, [
  body('message').trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim(),
  body('branch').optional().trim(),
  body('files_changed').optional().isInt({ min: 0 }),
  body('additions').optional().isInt({ min: 0 }),
  body('deletions').optional().isInt({ min: 0 }),
  validate
], (req, res) => {
  const repo = db.prepare(`SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id WHERE u.username=? AND r.name=?`)
    .get(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const { message, description, branch = 'main', files_changed = 1, additions = 0, deletions = 0 } = req.body;
  const sha = crypto.randomBytes(20).toString('hex');

  db.prepare(`INSERT INTO commits (repo_id, author_id, sha, message, description, branch, files_changed, additions, deletions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(repo.id, req.user.id, sha, message, description, branch, files_changed, additions, deletions);

  db.prepare("UPDATE repositories SET updated_at=datetime('now') WHERE id=?").run(repo.id);
  res.status(201).json({ message: 'Commit created', sha });
});

// ── GET /api/repos/:owner/:repo/files ─────────────────────────────────
router.get('/:owner/:repo/files', authOptional, (req, res) => {
  const repo = db.prepare(`SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id WHERE u.username=? AND r.name=?`)
    .get(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.is_private && (!req.user || req.user.id !== repo.owner_id)) return res.status(403).json({ error: 'Private' });

  const files = db.prepare('SELECT id, path, type, size, created_at, updated_at FROM repo_files WHERE repo_id=? ORDER BY type DESC, path').all(repo.id);
  res.json({ files });
});

// ── POST /api/repos/:owner/:repo/files ────────────────────────────────
router.post('/:owner/:repo/files', authRequired, [
  body('path').trim().isLength({ min: 1 }),
  body('content').optional(),
  body('type').optional().isIn(['file', 'dir']),
  validate
], (req, res) => {
  const repo = db.prepare(`SELECT r.* FROM repositories r JOIN users u ON r.owner_id=u.id WHERE u.username=? AND r.name=?`)
    .get(req.params.owner, req.params.repo);
  if (!repo) return res.status(404).json({ error: 'Not found' });
  if (repo.owner_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  const { path: filePath, content = '', type = 'file' } = req.body;

  try {
    db.prepare('INSERT INTO repo_files (repo_id, path, type, content, size) VALUES (?, ?, ?, ?, ?)')
      .run(repo.id, filePath, type, content, Buffer.byteLength(content || ''));
    res.status(201).json({ message: 'File created' });
  } catch {
    res.status(409).json({ error: 'File already exists at this path' });
  }
});

module.exports = router;
