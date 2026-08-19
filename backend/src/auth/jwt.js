import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '30d';
export const COOKIE_NAME = 'token';

if (!SECRET) {
  // Fail loudly at startup rather than silently signing tokens with `undefined` as the
  // secret, which would make every token trivially forgeable.
  throw new Error('JWT_SECRET is not set. Add it to backend/.env before starting the server.');
}

export function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.userId;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // 'none' needed cross-site in production (different domains); 'lax' works for localhost dev
    secure: isProduction, // 'none' requires secure in modern browsers, so these two go together
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}
