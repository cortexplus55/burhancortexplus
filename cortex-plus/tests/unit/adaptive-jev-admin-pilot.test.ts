import { beforeEach, describe, expect, it, vi } from "vitest";

describe("updateAdaptivePilotUser", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function load(opts: {
    adminId: string | null;
    existingMeta?: Record<string, unknown> | null;
    rowMissing?: boolean;
  }) {
    const updates: unknown[] = [];
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: opts.adminId ? { id: opts.adminId } : null },
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: opts.adminId ? { role: "admin" } : null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      createServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.rowMissing
                  ? { data: null, error: null }
                  : {
                      data: {
                        key: "jev_enabled",
                        metadata: opts.existingMeta ?? {
                          note: "keep-me",
                          pilot_user_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
                        },
                      },
                      error: null,
                    },
            }),
          }),
          update: (payload: unknown) => {
            updates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        }),
      }),
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
    }));
    const mod = await import("@/app/admin/adaptive/actions");
    return { ...mod, updates };
  }

  it("rejects non-admin", async () => {
    const { updateAdaptivePilotUser } = await load({ adminId: null });
    const r = await updateAdaptivePilotUser({
      flagKey: "jev_enabled",
      userId: "9d79106a-d31e-46e5-9cc5-4a09b519bc34",
      op: "add",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Yetkisiz/);
  });

  it("rejects invalid UUID", async () => {
    const { updateAdaptivePilotUser } = await load({
      adminId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const r = await updateAdaptivePilotUser({
      flagKey: "jev_enabled",
      userId: "not-a-uuid",
      op: "add",
    });
    expect(r.ok).toBe(false);
  });

  it("preserves other metadata keys and is idempotent on re-add", async () => {
    const admin = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { updateAdaptivePilotUser, updates } = await load({
      adminId: admin,
      existingMeta: {
        note: "keep-me",
        pilot_user_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      },
    });
    const target = "9d79106a-d31e-46e5-9cc5-4a09b519bc34";
    const r1 = await updateAdaptivePilotUser({
      flagKey: "jev_enabled",
      userId: target,
      op: "add",
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.pilotIds).toContain(target);
      expect(r1.pilotIds).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    }
    const meta1 = updates[0] as { metadata: Record<string, unknown> };
    expect(meta1.metadata.note).toBe("keep-me");

    const r2 = await updateAdaptivePilotUser({
      flagKey: "jev_enabled",
      userId: target,
      op: "add",
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.pilotIds.filter((id) => id === target)).toHaveLength(1);
    }
  });

  it("errors when flag row is missing (does not create)", async () => {
    const { updateAdaptivePilotUser, updates } = await load({
      adminId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      rowMissing: true,
    });
    const r = await updateAdaptivePilotUser({
      flagKey: "jev_enabled",
      userId: "9d79106a-d31e-46e5-9cc5-4a09b519bc34",
      op: "add",
    });
    expect(r.ok).toBe(false);
    expect(updates.length).toBe(0);
  });
});
