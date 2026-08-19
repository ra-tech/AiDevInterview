import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { COOKIE_NAME, cookieOptions, signToken } from './jwt.js';
import { requireAuth } from './middleware.js';

const router = Router();

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional()
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/signup', async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, profile: { create: {} } }
  });

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.status(201).json({ id: user.id, email: user.email, name: user.name });
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ id: user.id, email: user.email, name: user.name });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
});

// Lets the frontend check "am I logged in?" on load without guessing from cookie presence
// alone (a cookie could be present but expired/invalid).
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true }
  });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(user);
});

export default router;
