# DevInterview AI — Vite + React + Express

This is the split-architecture rewrite of DevInterview AI: a Vite/React/JavaScript frontend
talking to a separate Express/Node backend, instead of the original single Next.js full-stack
app. See `PORTING_NOTES.md` for what changed and why.

```
devinterview-ai-vite/
  backend/     Express API — Prisma, the AI provider abstraction, Judge0, JWT auth
  frontend/    Vite + React (plain JS) — react-router-dom, fetches the backend over HTTP
```

## Local setup

You need **two terminals** — the frontend and backend run as separate processes.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, and an AI provider key
npx prisma generate
npx prisma db push
npm run dev             # http://localhost:4000
```

Generate `JWT_SECRET` with `openssl rand -base64 32`. Everything else in `.env.example` works
the same way it did in the Next.js version (AI_PROVIDER, CODE_RUNNER, etc.) — see that file's
comments for the full rundown on each provider's free tier.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

No `.env` needed for local dev — it defaults to talking to `http://localhost:4000`. To point at
a different backend URL, create `frontend/.env` with `VITE_API_URL=https://your-backend-url`.

### 3. Demo data (optional)

```bash
cd backend
npm run db:seed
```

Same as before: seeds `demo@devinterview.ai` / `demo1234` with sample interview history.

## Why this structure (and why separate frontend/backend is not optional)

Vite is a frontend build tool only — it has no server runtime. Everything that used to live in
`src/app/api/*/route.ts` (Prisma queries, secret AI API keys, Judge0 orchestration, auth) cannot
move into a Vite bundle without shipping your database credentials and API keys to the browser.
So this is a genuine two-service architecture: the backend is the only thing that talks to
Postgres, the AI providers, and Judge0; the frontend is a pure client that only ever talks to
the backend's HTTP API.

### Auth

NextAuth is deeply Next.js-specific and doesn't run in Express. Replaced with a straightforward
JWT-in-httpOnly-cookie setup (`backend/src/auth/`):

- `POST /api/auth/signup` / `/login` — sign or verify a password, set an httpOnly cookie
  containing a signed JWT.
- `POST /api/auth/logout` — clear the cookie.
- `GET /api/auth/me` — the frontend calls this on load to check "am I logged in?"
  (`frontend/src/context/AuthContext.jsx`).
- Every request from the frontend uses `credentials: 'include'` so the cookie round-trips
  correctly across the frontend/backend origin split in dev.

### Routing

Next's file-based App Router routing became explicit `react-router-dom` routes in
`frontend/src/App.jsx`, with a `ProtectedRoute` wrapper component replacing the old
`middleware.ts` route-protection logic.

### Server components → client fetching

Every page that used to be a Next.js Server Component doing `await prisma.interview.findMany()`
directly is now a plain client component that `fetch`es from the backend on mount. The
dashboard's aggregation logic (average score, topic averages, trend, role-readiness heuristic)
moved to a dedicated `GET /api/interviews/meta/dashboard` endpoint, since there's no more
server-side context to compute it in ahead of render.

## What's identical to the Next.js version

The actual product logic didn't change — only the framework plumbing around it:

- The adaptive interview loop (`backend/src/lib/interview/orchestrator.js`)
- The AI provider abstraction — Anthropic/Gemini/Groq/Mock, all the retry/backoff/quota
  handling, all 8 prompt builders, JD/resume grounding (`backend/src/lib/ai/`)
- The Judge0 code execution harness and runner (`backend/src/lib/coderunner/`)
- The Prisma schema (minus NextAuth's `Account`/`Session`/`VerificationToken` tables, which
  aren't needed anymore)
- Every fix from the original build's debugging history — the zero-answer-report guard, the
  history-filter clear bug, the progress-panel timing bug, the timer-reset-on-refresh bug, the
  coding-follow-up surfacing — all carried over intact.

## Known limitations (unchanged from the Next.js version)

- Java/C++ coding challenges aren't executable — see `backend/src/lib/coderunner/harness.js`.
- No true token-level streaming of interviewer responses.
- No aggregate study recommendations across a candidate's full history (only per-interview).

## Deployment

Two separate deployments now, not one:

- **Backend**: any Node host (Railway, Render, Fly.io, a VPS) — needs `DATABASE_URL`,
  `JWT_SECRET`, `FRONTEND_URL` (set to your deployed frontend's origin), and an AI provider key.
- **Frontend**: any static host (Vercel, Netlify, Cloudflare Pages) — `npm run build` produces
  a static `dist/` folder. Set `VITE_API_URL` to your deployed backend's URL at build time.
- In production, set `NODE_ENV=production` on the backend so the auth cookie gets
  `sameSite: 'none'; secure: true` (required for a cross-domain cookie to work at all in
  modern browsers) — see `backend/src/auth/jwt.js`.
