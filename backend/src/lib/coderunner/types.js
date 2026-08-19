/**
 * Secure code execution (spec section 7).
 *
 * HARD RULE: candidate-submitted code is NEVER executed inside the primary
 * application process. Every CodeRunner implementation either talks to an
 * isolated external service, or (MockCodeRunner) doesn't execute anything
 * at all — it pattern-matches against expected output for local
 * development so the full submit/evaluate/follow-up loop can be exercised
 * without standing up a real sandbox.
 *
 * JudgeZeroRunner (judge0-runner.js) is a real implementation: submissions
 * run in Judge0's isolated sandbox, not this process, over HTTP. It fully
 * supports JavaScript, TypeScript, and Python (see harness.js for why —
 * those are the languages the function-stub-to-runnable-program harness
 * currently covers); Java and C++ are recognized but not yet executable
 * end-to-end.
 */

export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_MEMORY_LIMIT_MB = 256;

/**
 * Input sanitization applied before ANY code reaches a runner implementation.
 * This is a defense-in-depth check, not a substitute for real process
 * isolation — the sandbox itself (Judge0 / Docker / serverless) is what
 * actually prevents a malicious submission from doing damage.
 */
export function sanitizeSubmission(code) {
  if (code.length > 20000) return { ok: false, reason: 'Submission exceeds the maximum allowed length.' };
  if (code.trim().length === 0) return { ok: false, reason: 'Submission is empty.' };
  return { ok: true };
}
