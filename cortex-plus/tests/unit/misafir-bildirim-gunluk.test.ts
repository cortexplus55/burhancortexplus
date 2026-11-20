/**
 * Misafirin "Soruda hata bildir" ucu (20 Kasım 2026, Faz 5 denetimi): yalnız saatlik sınır vardı (6/saat), gün boyu
 * sınırsız yazılabiliyordu. IP başına günde en çok 10 bildirim; 11. istek tabloya yazılmadan 429 döner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserts: unknown[] = [];
const counters = new Map<string, number>();

vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return { allowed: next <= limit, remaining: Math.max(0, limit - next), resetAt: Date.now() + 60_000 };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        // 429 kötüye kullanım kaydını da yazar (abuse_events); yalnız bildirimleri say.
        if (table === "question_reports") inserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

describe("misafir hata bildirimi: günlük sınır", () => {
  beforeEach(() => {
    inserts.length = 0;
    counters.clear();
  });

  it("aynı IP'den günde en çok 10 bildirim; saatlik 6 sınırı ayrıca geçerli", async () => {
    const { POST } = await import("@/app/api/learning/question-report/demo/route");
    const raw = (await import("@/lib/demo/lesson.json")).default as { quiz: { ref?: string }[] };
    const { demoQuestionByRef } = await import("@/lib/demo/demo-quiz");
    const ref = "q:0";
    expect(demoQuestionByRef(raw.quiz as never, ref)).not.toBeNull();
    const send = () =>
      POST(
        new Request("http://localhost/api/learning/question-report/demo", {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ questionRef: ref, reason: "key" }),
        }),
      );
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) statuses.push((await send()).status);
    // Saatlik sınır (6) yedinci isteği keser.
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(statuses[6]).toBe(429);
    expect(inserts).toHaveLength(6);
    // Günlük sayaç saatlik sınırdan bağımsız: saat penceresi yenilenmiş gibi saatlik sayacı sıfırla.
    for (const key of [...counters.keys()]) if (!key.includes("-day")) counters.delete(key);
    for (let index = 0; index < 6; index += 1) statuses.push((await send()).status);
    expect(inserts).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
  });
});
