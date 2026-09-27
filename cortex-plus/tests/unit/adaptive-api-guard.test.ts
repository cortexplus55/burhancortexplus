import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * withAdaptiveUser is the single gate every /api/adaptive/* route calls
 * through. Pilot targeting (global flag false, user in pilot_user_ids) must
 * let the pilot in; every other authenticated user must see the adaptive
 * surface as if it doesn't exist (404), so the legacy exam-prep flow is
 * provably untouched.
 */
describe("withAdaptiveUser", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function mockGuards(userId: string) {
    vi.doMock("@/lib/api/guards", () => ({
      withUser: vi.fn().mockResolvedValue({
        ok: true,
        ctx: { userId, email: null, isAdmin: false, service: {}, supabase: {} },
      }),
      errorResponse: (status: number, error: string) =>
        new Response(JSON.stringify({ error }), { status }),
    }));
  }

  it("lets the pilot user through when the global flag is false", async () => {
    mockGuards("pilot-user");
    vi.doMock("@/lib/admin/feature-flags", () => ({
      ADAPTIVE_LEARNING_FLAG: "adaptive_learning_enabled",
      isFeatureEnabled: vi.fn().mockResolvedValue(true), // pilot_user_ids match
    }));
    const { withAdaptiveUser } = await import("@/lib/adaptive/api-guard");

    const result = await withAdaptiveUser(new Request("https://x/api/adaptive/session/start"), "adaptive-session-start");

    expect(result.ok).toBe(true);
  });

  it("blocks a non-pilot user with 404 when the global flag is false", async () => {
    mockGuards("non-pilot-user");
    vi.doMock("@/lib/admin/feature-flags", () => ({
      ADAPTIVE_LEARNING_FLAG: "adaptive_learning_enabled",
      isFeatureEnabled: vi.fn().mockResolvedValue(false), // not in pilot_user_ids
    }));
    const { withAdaptiveUser } = await import("@/lib/adaptive/api-guard");

    const result = await withAdaptiveUser(new Request("https://x/api/adaptive/session/start"), "adaptive-session-start");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });
});
