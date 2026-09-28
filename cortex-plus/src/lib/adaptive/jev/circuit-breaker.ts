/**
 * In-process circuit breaker for Jev.
 *
 * NOTE: state is per Vercel/serverless instance (in-memory). Different
 * instances do not share open/closed status — admin snapshot is local only.
 */

import type { JevErrorCode } from "@/lib/adaptive/jev/error-codes";

type BreakerState = {
  failures: number;
  openUntil: number;
  lastError: JevErrorCode | string | null;
  lastErrorAt: number | null;
};

const state: BreakerState = {
  failures: 0,
  openUntil: 0,
  lastError: null,
  lastErrorAt: null,
};

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;
/** Wrong/missing key or payment issues — stay open longer so each request is not delayed. */
const AUTH_OPEN_MS = 10 * 60_000;

export function jevCircuitAllows(): boolean {
  return Date.now() >= state.openUntil;
}

export function jevCircuitSuccess(): void {
  state.failures = 0;
  state.openUntil = 0;
}

export function jevCircuitFailure(errorCode?: JevErrorCode | string): void {
  if (errorCode) {
    state.lastError = errorCode;
    state.lastErrorAt = Date.now();
  }

  // Auth / billing / our invalid request → open immediately for a long cooldown.
  if (
    errorCode === "unauthorized" ||
    errorCode === "payment_required" ||
    errorCode === "forbidden"
  ) {
    state.openUntil = Date.now() + AUTH_OPEN_MS;
    state.failures = 0;
    return;
  }

  if (errorCode === "invalid_request") {
    state.openUntil = Date.now() + AUTH_OPEN_MS;
    state.failures = 0;
    // Single-line, key-free log — our request shape is wrong; do not retry every call.
    console.error(
      `[adaptive/jev] circuit open: invalid_request (422) — check question shape/model`,
    );
    return;
  }

  state.failures += 1;
  if (state.failures >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + OPEN_MS;
    state.failures = 0;
  }
}

export function getJevCircuitSnapshot(): {
  open: boolean;
  openUntil: number | null;
  failures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  scope: "instance";
} {
  const open = !jevCircuitAllows();
  return {
    open,
    openUntil: open ? state.openUntil : null,
    failures: state.failures,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt
      ? new Date(state.lastErrorAt).toISOString()
      : null,
    scope: "instance",
  };
}

/** Test helper */
export function jevCircuitReset(): void {
  state.failures = 0;
  state.openUntil = 0;
  state.lastError = null;
  state.lastErrorAt = null;
}
