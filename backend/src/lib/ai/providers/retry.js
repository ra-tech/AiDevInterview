/**
 * Distinguishes two different kinds of upstream failure:
 *
 * - Transient overload (500/503/529, "overloaded", "high demand"): the
 *   server is temporarily struggling but the request itself is fine.
 *   Worth a few seconds of backoff-and-retry.
 * - Quota/rate-limit exhaustion (429, RESOURCE_EXHAUSTED): the account has
 *   hit a request cap. This is NOT worth retrying within the same call —
 *   the provider's own error tells you to wait 20-30+ seconds, far longer
 *   than a short backoff window, and free-tier daily quotas (as opposed to
 *   per-minute ones) won't be satisfied by waiting a few seconds at all.
 *   Retrying anyway only burns more of an already-scarce daily allowance.
 */
export function isTransientOverloadError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /"code":\s*(500|503|529)|UNAVAILABLE|overloaded|high demand/i.test(message);
}

export function isQuotaExceededError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /"code":\s*429|RESOURCE_EXHAUSTED|quota exceeded|rate.?limit/i.test(message);
}

/** Either kind of call-level failure — used to decide whether a "fix your JSON" retry even makes sense. */
export function isProviderCallFailure(err) {
  return isTransientOverloadError(err) || isQuotaExceededError(err);
}

/**
 * Retries a transient overload with exponential backoff (1s, 2s, 4s by
 * default) before giving up. Quota-exceeded errors are NOT retried here —
 * see isQuotaExceededError above — they're thrown immediately so the
 * caller can surface a clear "you've hit your daily/rate limit" message
 * instead of silently spending more of that limit on doomed retries.
 */
export async function withBackoff(fn, maxAttempts = 3, baseDelayMs = 1000) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientOverloadError(err) || attempt === maxAttempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}
