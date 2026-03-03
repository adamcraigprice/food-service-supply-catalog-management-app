# Catalog Manager — Full-Stack Application

A food service supply catalog management app. The backend is a Node/Express API backed by SQLite; the frontend is React + Tailwind served by Vite.

---

## Quick Start

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Clone the repo
git clone <REPO_URL> && cd catalog-manager-takehome

# 2. Install everything (root + backend + frontend)
npm install

# 3. Start both servers
npm run dev
```

| Service  | URL                        |
| -------- | -------------------------- |
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:3001      |
| Health   | http://localhost:3001/health |

> If you ever need a fresh database, run `npm run db:reset`.
> To inspect the database directly, run `npm run db:console` (opens the SQLite CLI).

---

## Project Structure

```
├── frontend/          React + Tailwind (Vite)
│   └── src/
│       ├── pages/     Page-level components
│       ├── components/Shared UI components
│       ├── lib/       API helpers & utilities
│       └── types.ts   TypeScript interfaces
├── backend/           Express + TypeScript API
│   └── src/
│       ├── routes/    Route handlers
│       ├── app.ts     Express app setup
│       ├── db.ts      SQLite connection
│       └── seed.ts    Seed script
├── backend/dev.db     SQLite database (committed with seed data)
└── package.json       Root scripts (dev, test, db:reset, db:console)
```

---

## Available Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start backend + frontend concurrently          |
| `npm test`          | Run backend tests (task tests will fail until you implement them) |
| `npm run db:reset`  | Drop & re-seed the database                    |
| `npm run db:console`| Open SQLite CLI on `dev.db`                    |

---

## Database

The app uses a **SQLite** database (`backend/dev.db`) committed to the repo with realistic seed data.

No schema diagram is provided — you can inspect the database yourself:

```bash
npm run db:console

# then inside SQLite:
.tables
.schema products
SELECT * FROM products LIMIT 5;
```
## Tests

A test suite is included in `backend/__tests__/tasks.test.ts`.

```bash
npm test
```
