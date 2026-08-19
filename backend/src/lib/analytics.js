import { prisma } from '../db.js';

/**
 * Minimal event tracking — spec section 22. Deliberately fire-and-forget in
 * spirit but always awaited by callers: a failed analytics write should
 * never break the actual user-facing request, so this always swallows its
 * own errors (logged, not thrown). Metadata must stay small and
 * non-sensitive — no answer text, no emails, nothing that would make this
 * table a second copy of user data.
 */
export async function track(name, opts = {}) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        name,
        userId: opts.userId,
        interviewId: opts.interviewId,
        metadata: opts.metadata
      }
    });
  } catch (err) {
    console.error(`[analytics] failed to record "${name}":`, err);
  }
}
