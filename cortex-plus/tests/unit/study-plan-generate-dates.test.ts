import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, code: string) => Response.json({ error: code }, { status }),
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: mocks.generate,
  isPremiumUser: vi.fn(async () => false),
}));
import { POST } from "@/app/api/learning/study-plan/generate/route";

/**
 * Çalışma planı görevlerinin tarihi Türkiye takviminde.
 *
 * Sunucu UTC'de. "Bugün" sunucunun yerel günü olduğunda gece 00:00–03:00
 * arası kurulan planın ilk görevi dünün tarihini alıyor ve doğar doğmaz
 * gecikmiş görünüyordu.
 */
describe("study plan task due dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dates day 0 on the Turkish day at 01:30", async () => {
    // 1 Ekim 2026 01:30 Türkiye = 30 Eylül 22:30 UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T22:30:00Z"));

    const insertTasks = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "study_plans") {
        const plans = {
          insert: () => plans,
          select: () => plans,
          single: async () => ({ data: { id: "plan" }, error: null }),
        };
        return plans;
      }
      return { insert: insertTasks };
    });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from } } });
    mocks.generate.mockResolvedValue({
      ok: true,
      cost: 1,
      data: {
        title: "Kalkülüs",
        tasks: [
          { title: "Limit", dayOffset: 0 },
          { title: "Türev", dayOffset: 1 },
          { title: "İntegral", dayOffset: 31 },
        ],
      },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ goal: "Kalkülüs finali" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insertTasks).toHaveBeenCalledWith([
      { plan_id: "plan", title: "Limit", due_date: "2026-10-01", sort_order: 0 },
      { plan_id: "plan", title: "Türev", due_date: "2026-10-02", sort_order: 1 },
      { plan_id: "plan", title: "İntegral", due_date: "2026-11-01", sort_order: 2 },
    ]);
  });
});
