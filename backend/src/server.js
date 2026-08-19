import 'dotenv/config';
import 'express-async-errors'; // must load before any router that uses async handlers
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './auth/routes.js';
import interviewRoutes from './routes/interviews.js';
import uploadRoutes from './routes/uploads.js';

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// credentials: true is required for the httpOnly JWT cookie to be sent/received cross-origin
// (frontend on :5173, backend on :4000 in dev) — without it the browser silently drops the
// cookie and every authenticated request looks like a fresh, logged-out session.
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // headroom for pasted JD/resume text

app.use('/api/auth', authRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/uploads', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Centralized error handler — anything thrown/rejected in a route that isn't already caught
// lands here instead of crashing the process or leaking a raw stack trace to the client.
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`DevInterview AI backend listening on http://localhost:${PORT}`);
});
