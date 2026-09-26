/**
 * In-process circuit breaker for Jev — short bypass after repeated failures.
 */

type BreakerState = {
  failures: number;
  openUntil: number;
};

const state: BreakerState = { failures: 0, openUntil: 0 };

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

export function jevCircuitAllows(): boolean {
  return Date.now() >= state.openUntil;
}

export function jevCircuitSuccess(): void {
  state.failures = 0;
  state.openUntil = 0;
}

export function jevCircuitFailure(): void {
  state.failures += 1;
  if (state.failures >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + OPEN_MS;
    state.failures = 0;
  }
}

/** Test helper */
export function jevCircuitReset(): void {
  state.failures = 0;
  state.openUntil = 0;
}
