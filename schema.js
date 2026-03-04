const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './db/github_clone.db';

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──────────────────────────────────────────────────────────────
db.exec(`
  -- USERS
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT,
    bio         TEXT,
    avatar_url  TEXT DEFAULT '/uploads/default-avatar.png',
    website     TEXT,
    location    TEXT,
    company     TEXT,
    twitter     TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- REPOSITORIES
  CREATE TABLE IF NOT EXISTS repositories (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    language     TEXT,
    is_private   INTEGER DEFAULT 0,
    is_forked    INTEGER DEFAULT 0,
    fork_of      INTEGER REFERENCES repositories(id),
    default_branch TEXT DEFAULT 'main',
    stars_count  INTEGER DEFAULT 0,
    forks_count  INTEGER DEFAULT 0,
    watchers_count INTEGER DEFAULT 0,
    issues_count INTEGER DEFAULT 0,
    readme       TEXT,
    topics       TEXT DEFAULT '[]',
    license      TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(owner_id, name)
  );

  -- FILES (Repo file tree)
  CREATE TABLE IF NOT EXISTS repo_files (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    path         TEXT NOT NULL,
    type         TEXT CHECK(type IN ('file','dir')) DEFAULT 'file',
    content      TEXT,
    size         INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(repo_id, path)
  );

  -- COMMITS
  CREATE TABLE IF NOT EXISTS commits (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    author_id    INTEGER NOT NULL REFERENCES users(id),
    sha          TEXT UNIQUE NOT NULL,
    message      TEXT NOT NULL,
    description  TEXT,
    branch       TEXT DEFAULT 'main',
    files_changed INTEGER DEFAULT 0,
    additions    INTEGER DEFAULT 0,
    deletions    INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  -- STARS
  CREATE TABLE IF NOT EXISTS stars (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_id   INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, repo_id)
  );

  -- FORKS
  CREATE TABLE IF NOT EXISTS forks (
    original_id INTEGER NOT NULL REFERENCES repositories(id),
    forked_id   INTEGER NOT NULL REFERENCES repositories(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (original_id, forked_id)
  );

  -- FOLLOWS
  CREATE TABLE IF NOT EXISTS follows (
    follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );

  -- ISSUES
  CREATE TABLE IF NOT EXISTS issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    author_id   INTEGER NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    body        TEXT,
    status      TEXT CHECK(status IN ('open','closed')) DEFAULT 'open',
    labels      TEXT DEFAULT '[]',
    assignee_id INTEGER REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    closed_at   TEXT
  );

  -- PULL REQUESTS
  CREATE TABLE IF NOT EXISTS pull_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    author_id    INTEGER NOT NULL REFERENCES users(id),
    title        TEXT NOT NULL,
    body         TEXT,
    status       TEXT CHECK(status IN ('open','closed','merged')) DEFAULT 'open',
    from_branch  TEXT NOT NULL,
    to_branch    TEXT DEFAULT 'main',
    reviewers    TEXT DEFAULT '[]',
    labels       TEXT DEFAULT '[]',
    merged_at    TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  -- COMMENTS (Issues + PRs)
  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT CHECK(target_type IN ('issue','pr','commit')) NOT NULL,
    target_id   INTEGER NOT NULL,
    author_id   INTEGER NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- NOTIFICATIONS
  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    repo_id     INTEGER REFERENCES repositories(id),
    link        TEXT,
    is_read     INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ACTIVITY FEED
  CREATE TABLE IF NOT EXISTS activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER NOT NULL REFERENCES users(id),
    type        TEXT NOT NULL,
    repo_id     INTEGER REFERENCES repositories(id),
    target_id   INTEGER,
    payload     TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- SESSIONS (optional, for logout)
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    token_hash  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✅ Database initialized at', DB_PATH);

module.exports = db;
