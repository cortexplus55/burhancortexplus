import { beforeEach, describe, expect, it } from "vitest";
import {
  getJevCircuitSnapshot,
  jevCircuitAllows,
  jevCircuitFailure,
  jevCircuitReset,
  jevCircuitSuccess,
} from "@/lib/adaptive/jev/circuit-breaker";

describe("Jev circuit breaker auth / invalid_request", () => {
  beforeEach(() => {
    jevCircuitReset();
  });

  it("opens immediately for unauthorized and stays open", () => {
    expect(jevCircuitAllows()).toBe(true);
    jevCircuitFailure("unauthorized");
    expect(jevCircuitAllows()).toBe(false);
    const snap = getJevCircuitSnapshot();
    expect(snap.open).toBe(true);
    expect(snap.lastError).toBe("unauthorized");
    expect(snap.scope).toBe("instance");
    expect(snap.openUntil).toBeGreaterThan(Date.now() + 60_000);
  });

  it("opens immediately for payment_required and forbidden", () => {
    jevCircuitFailure("payment_required");
    expect(jevCircuitAllows()).toBe(false);
    jevCircuitReset();
    jevCircuitFailure("forbidden");
    expect(jevCircuitAllows()).toBe(false);
  });

  it("opens immediately for invalid_request (422)", () => {
    jevCircuitFailure("invalid_request");
    expect(jevCircuitAllows()).toBe(false);
  });

  it("still opens after 3 generic failures", () => {
    jevCircuitFailure("server_error");
    jevCircuitFailure("timeout");
    expect(jevCircuitAllows()).toBe(true);
    jevCircuitFailure("network");
    expect(jevCircuitAllows()).toBe(false);
  });

  it("resets on success", () => {
    jevCircuitFailure("server_error");
    jevCircuitSuccess();
    expect(jevCircuitAllows()).toBe(true);
    expect(getJevCircuitSnapshot().failures).toBe(0);
  });
});
