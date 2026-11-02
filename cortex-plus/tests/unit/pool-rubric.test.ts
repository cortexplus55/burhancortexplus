import { describe, expect, it } from "vitest";
import { lessonRubricIssues } from "@/lib/content-pool/rubric";
import { runRefresh, weakLessons, type RefreshRow } from "@/lib/content-pool/refresh";
import type { LessonBody } from "@/lib/content-pool/schema";

const base: LessonBody = {
  title: "t",
  overview: "o".repeat(30),
  sections: [{ outcome_code: "1.1", heading: "h", explanation: "e".repeat(50), key_points: ["k"] }],
  summary: "s".repeat(30),
  cards: [{ front: "f", back: "b" }],
} as LessonBody;
const rich: LessonBody = {
  ...base,
  summary: "Özet cümlesi bir. Özet cümlesi iki uzun bir cümle olarak yazıldı. Üçüncü cümle de var burada.",
  key_terms: [1, 2, 3].map((n) => ({ term: `t${n}`, definition: "tanım metni" })),
  sections: [
    {
      ...base.sections[0]!,
      steps: ["a adımı", "b adımı"],
      worked_example: "Soru: örnek bir soru. Çözüm: birinci adımda şu yapılır, ikinci adımda sonuç bulunur, böylece cevap çıkar.",
      common_mistakes: ["sık hata"],
      ladder: { temel: "temel düzey cümlesi", orta: "orta düzey cümlesi", ileri: "ileri düzey cümlesi" },
    },
  ],
} as LessonBody;

describe("havuz ders kalite rubriği", () => {
  it("eski (rubriksiz) ders zayıf, zengin ders geçer", () => {
    expect(lessonRubricIssues(base).length).toBeGreaterThan(0);
    expect(lessonRubricIssues(rich)).toEqual([]);
  });
  it("yenileme yalnız zayıf ve daha önce başarısız olmamış dersleri alır; tavana gelince durur", async () => {
    const rows: RefreshRow[] = [
      { id: "a", unit_id: "u1", body: base, qa: null },
      { id: "b", unit_id: "u2", body: rich, qa: null },
      { id: "c", unit_id: "u3", body: base, qa: { rubric_refresh: { failed_at: "x" } } },
      { id: "d", unit_id: "u4", body: base, qa: null },
    ];
    const weak = weakLessons(rows);
    expect(weak.map((r) => r.id)).toEqual(["a", "d"]);
    let spent = 0.995;
    const done: string[] = [];
    const report = await runRefresh(
      weak,
      { spent: async () => spent, enabled: async () => true, now: () => 0, refresh: async (r) => { done.push(r.id); spent += 0.004; return true; } },
      { capUsd: 1, lessonEstimateUsd: 0.004, concurrency: 1, deadline: 10 },
    );
    expect(done).toEqual(["a"]);
    expect(report).toMatchObject({ stop: "budget", refreshed: 1, remaining: 1 });
  });
  it("doldurucu çalışırken yenileme sırayı bırakır (yield)", async () => {
    let busy = false;
    const done: string[] = [];
    const rows = [{ id: "x" }, { id: "y" }] as unknown as RefreshRow[];
    const report = await runRefresh(
      rows,
      { spent: async () => 0, enabled: async () => true, now: () => 0, yieldTo: async () => busy, refresh: async (r) => { done.push(r.id); busy = true; return true; } },
      { capUsd: 1, lessonEstimateUsd: 0.01, concurrency: 1, deadline: 10 },
    );
    expect(done).toEqual(["x"]);
    expect(report).toMatchObject({ stop: "yield", refreshed: 1, remaining: 1 });
  });
});
