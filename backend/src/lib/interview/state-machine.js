/**
 * Section 17: the interview is a state machine. The backend is the sole
 * authority over transitions — nothing the AI provider returns is ever
 * written directly into Interview.state. AI output can *inform* a
 * transition decision (e.g. "sufficient_evidence" from an evaluation) but
 * the orchestrator always routes that signal through canTransition/
 * assertTransition before persisting anything.
 */

const ALLOWED_TRANSITIONS = {
  CREATED: ['PLANNING', 'ABANDONED'],
  PLANNING: ['IN_PROGRESS', 'ABANDONED'],
  IN_PROGRESS: ['CODING_CHALLENGE', 'COMPLETED', 'ABANDONED'],
  CODING_CHALLENGE: ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  COMPLETED: ['EVALUATED'],
  EVALUATED: [],
  ABANDONED: []
};

export class InvalidStateTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid interview state transition: ${from} -> ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
