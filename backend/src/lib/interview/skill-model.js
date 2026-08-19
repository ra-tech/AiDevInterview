/**
 * The running performance model is a simple exponentially-weighted rolling
 * average over each dimension of every AnswerEvaluation seen so far. It is
 * intentionally NOT keyword-based (spec section 4) — every input number here
 * already came from the model's semantic judgment of the answer; this file
 * only aggregates those judgments over time and derives a difficulty signal
 * from the trend, it never re-scores the answer text itself.
 */

const ALPHA = 0.35; // weight given to the newest evaluation vs. history

export const EMPTY_PERFORMANCE_MODEL = {
  technical_accuracy: 5,
  problem_solving: 5,
  communication: 5,
  depth_of_understanding: 5,
  coding: 5
};

export function updatePerformanceModel(current, evaluation) {
  const ewma = (prev, next) => prev * (1 - ALPHA) + next * ALPHA;
  return {
    technical_accuracy: ewma(current.technical_accuracy, evaluation.technical_accuracy),
    problem_solving: ewma(current.problem_solving, evaluation.problem_solving),
    communication: ewma(current.communication, evaluation.communication),
    depth_of_understanding: ewma(current.depth_of_understanding, evaluation.depth_of_understanding),
    coding: current.coding // updated separately by coding evaluations, see updateCodingScore
  };
}

export function updateCodingScore(current, correctness) {
  return { ...current, coding: current.coding * (1 - ALPHA) + correctness * ALPHA };
}

/**
 * Maps the aggregate performance model to a 1-5 difficulty target for the
 * *next* question. Section 4: strong performance -> edge cases / trade-offs;
 * struggling -> foundational, but never dropped so low it stops gathering
 * evidence, and never intentionally humiliating (hard floor at 1, hard
 * ceiling at 5, one step at a time rather than swinging wildly).
 */
export function nextDifficulty(current, previousDifficulty) {
  const avg = (current.technical_accuracy + current.problem_solving + current.depth_of_understanding) / 3;

  let delta = 0;
  if (avg >= 8) delta = 1;
  else if (avg <= 3.5) delta = -1;

  const next = previousDifficulty + delta;
  return Math.min(5, Math.max(1, next));
}

/** Simple 0-10 -> 0-100 scaling used when rolling per-question scores into report/topic scores. */
export function toPercent(scoreOutOf10) {
  return Math.round(scoreOutOf10 * 10);
}
