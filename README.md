# 🐙 GitHub Clone — Full Stack Mobile App

A complete GitHub-inspired mobile web app with **real backend**, **authentication**, **forms**, and **database**.

---

## 📁 Project Structure

```
github-clone/
├── index.html                    ← Landing page
├── frontend/
│   ├── css/
│   │   └── styles.css           ← Shared styles (dark theme)
│   ├── js/
│   │   └── api.js               ← API client + auth helpers
│   └── pages/
│       ├── login.html           ← Login form
│       ├── register.html        ← Registration form
│       ├── feed.html            ← Activity feed
│       ├── explore.html         ← Search & browse repos
│       ├── new-repo.html        ← Create repository form
│       ├── profile.html         ← User profile + settings
│       └── notifications.html   ← Notifications inbox
└── backend/
    ├── server.js                ← Express.js server
    ├── package.json
    ├── .env                     ← Environment config
    ├── db/
    │   └── schema.js            ← SQLite database + all tables
    ├── middleware/
    │   ├── auth.js              ← JWT middleware
    │   └── validate.js          ← Input validation
    └── routes/
        ├── auth.js              ← Register, login, profile
        ├── repos.js             ← Repo CRUD, stars, commits, files
        ├── issues.js            ← Issues, PRs, comments
        └── users.js             ← Users, follows, notifications
```

---

## 🚀 Setup & Run

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:
```env
PORT=3000
JWT_SECRET=your_secret_key_here_minimum_32_characters
JWT_EXPIRES_IN=7d
DB_PATH=./db/github_clone.db
FRONTEND_URL=http://localhost:5500
```

### 3. Start the Backend

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Backend runs at: `http://localhost:3000`
API docs: `http://localhost:3000/api`

### 4. Serve the Frontend

Open `index.html` with any static server:

```bash
# Option A: VS Code Live Server (port 5500)
# Option B: Python
python3 -m http.server 5500

# Option C: Node
npx serve . -p 5500
```

Open: `http://localhost:5500`

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in → returns JWT |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/profile` | Update profile |
| PUT | `/api/auth/password` | Change password |

### Repositories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos` | List/search public repos |
| POST | `/api/repos` | Create repository |
| GET | `/api/repos/:owner/:repo` | Repo details |
| PUT | `/api/repos/:owner/:repo` | Update repo |
| DELETE | `/api/repos/:owner/:repo` | Delete repo |
| POST | `/api/repos/:owner/:repo/star` | Star/unstar |
| GET | `/api/repos/:owner/:repo/commits` | Commit history |
| GET | `/api/repos/:owner/:repo/files` | File tree |

### Issues & PRs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/:owner/:repo/issues` | List/create issues |
| PATCH | `/api/:owner/:repo/issues/:id` | Close/reopen issue |
| GET/POST | `/api/:owner/:repo/pulls` | List/create PRs |
| PATCH | `/api/:owner/:repo/pulls/:id` | Merge/close PR |
| POST | `/api/comments` | Post comment |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:username` | User profile |
| GET | `/api/users/:username/repos` | User's repos |
| POST | `/api/users/:username/follow` | Follow/unfollow |
| GET | `/api/users/notifications/all` | Notifications |
| PATCH | `/api/users/notifications/read-all` | Mark all read |

---

## 🗄️ Database Tables

- `users` — Accounts with hashed passwords
- `repositories` — Repos with metadata, stars, topics
- `repo_files` — File tree per repo
- `commits` — Commit history
- `stars` — User ↔ repo stars
- `follows` — User ↔ user follows
- `issues` — Issues with labels, status
- `pull_requests` — PRs with merge state
- `comments` — Comments on issues/PRs/commits
- `notifications` — User notifications
- `activities` — Activity feed events
- `sessions` — JWT session tracking

---

## 🛡️ Security Features

- ✅ Passwords hashed with bcrypt (12 rounds)
- ✅ JWT authentication (7 day expiry)
- ✅ Input validation on all forms
- ✅ Rate limiting (300 req/15min general, 20 req/15min auth)
- ✅ Helmet.js security headers
- ✅ CORS restricted to frontend origin
- ✅ SQL injection prevention (parameterized queries)
- ✅ Private repo access control

---

## 📱 Frontend Pages

| Page | URL | Auth Required |
|------|-----|---------------|
| Landing | `index.html` | No |
| Login | `pages/login.html` | No |
| Register | `pages/register.html` | No |
| Feed | `pages/feed.html` | Optional |
| Explore | `pages/explore.html` | Optional |
| New Repo | `pages/new-repo.html` | ✅ Yes |
| Profile | `pages/profile.html` | ✅ Yes |
| Notifications | `pages/notifications.html` | ✅ Yes |
