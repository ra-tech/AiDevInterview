import { COOKIE_NAME, verifyToken } from './jwt.js';

/**
 * Attaches req.userId if the request carries a valid session cookie, otherwise responds 401.
 * This is the direct replacement for the Next.js version's requireUserId() — every route that
 * used to start with `const userId = await requireUserId(); if (!userId) return 401` now just
 * declares this as middleware and reads req.userId.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const userId = token ? verifyToken(token) : null;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.userId = userId;
  next();
}
