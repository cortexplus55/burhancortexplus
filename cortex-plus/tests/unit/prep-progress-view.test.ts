import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_PCT,
  buildPrepProgressView,
  type ProgressNode,
} from "@/lib/learning/prep-progress-view";

const NOW = new Date("2026-09-29T12:00:00Z");
/** Ders sayılan türler (prep-metrics.ts LESSON_KINDS ile aynı; 30 Ekim 2026'dan beri yalnız ders). */
const LESSON_KINDS_FOR_TEST = new Set<ProgressNode["kind"]>(["lesson"]);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function node(
  id: string,
  kind: ProgressNode["kind"],
  status: ProgressNode["status"],
  topic: string,
  minutes = 10,
): ProgressNode {
  return { id, kind, title: `${topic} · ${kind}`, status, sessionMeta: { topicTitle: topic, durationMinutes: minutes } };
}

const nodes: ProgressNode[] = [
  node("l1", "lesson", "done", "Birim Çember"),
  node("q1", "quiz", "done", "Birim Çember"),
  node("l2", "lesson", "done", "Radyan"),
  node("q2", "quiz", "ready", "Radyan"),
  node("w1", "written_exam", "done", "Radyan", 30),
  node("l3", "lesson", "locked", "Sinüs"),
];

const base = {
  nodes,
  attempts: [],
  topicLabels: ["Birim Çember", "Radyan", "Sinüs"],
  gaps: [],
  examDate: null,
  targetScore: null,
  dailyMinutes: null,
  measuredReadinessPct: null,
  now: NOW,
};

describe("hazırlık ilerleme görünümü (Astra düzeni)", () => {
  it("tahmin ilk dersten önce yok, ilk dersten sonra var (19 Ekim 2026: Astra ilk dersten hemen sonra gösteriyor)", () => {
    const none = buildPrepProgressView({
      ...base,
      nodes: nodes.map((n) => (LESSON_KINDS_FOR_TEST.has(n.kind) ? { ...n, status: "ready" as const } : n)),
      examDate: "2026-10-13",
    });
    expect(none.forecast.kind).toBe("waiting");
    expect(none.pace).toBeNull();
    const one = buildPrepProgressView({
      ...base,
      nodes: nodes.map((n) => (n.id === "l2" ? { ...n, status: "ready" as const } : n)),
      examDate: "2026-10-13",
      // Aynı ders bugün iki kez kaydedilmiş ("Dersi tekrarla"): bugün 1 ders sayılır, 2 değil.
      attempts: [
        { nodeId: "l1", score: 3, total: 3, createdAt: daysAgo(0) },
        { nodeId: "l1", score: 3, total: 3, createdAt: daysAgo(0) },
      ],
      measuredReadinessPct: 2,
    });
    expect(one.forecast.kind).toBe("ready");
    // Tempo kartı: 1 ders → +%2; hedef 75'e 37 ders; 14 güne 3/gün; bugün 1 ders.
    // "~X günde" aynı bölmeden: ceil(37 / 3) = 13.
    expect(one.pace).toEqual({ gainPerLessonPct: 2, lessonsToTarget: 37, perDay: 3, daysToFinish: 13, todayLessons: 1 });
    // Puanlanmış etkinlik var ve eksik yok: "0 eksik" bir ölçüm sonucu.
    expect(one.gapsMeasured).toBe(true);
    expect(none.gapsMeasured).toBe(false);
  });

  it("sınav tarihi yoksa tahmin beklemede", () => {
    const view = buildPrepProgressView(base);
    expect(view.forecast).toEqual({ kind: "waiting", reason: "Sınav tarihi girilince tahmin görünür." });
    expect(view.forecastSeries.points[0]?.pct).toBe(view.scorePct);
    expect(view.forecastSeries.targetPct).toBe(DEFAULT_TARGET_PCT);
  });

  // V6 (28 Ekim 2026): tahmin tamamlama sayısından 100'e tırmanmaz; bugünkü hazırlıktan başlar, hedefte durur
  // ve gün sayısı tempo kartıyla aynı bölmedir (`Math.ceil(kalanDers / günlükDers)`).
  it("tahmin bugünkü hazırlıktan başlar, hedefi aşmaz, günü tempo kartıyla aynı", () => {
    const view = buildPrepProgressView({
      ...base,
      examDate: "2026-10-13",
      attempts: [
        { nodeId: "l1", score: null, total: null, createdAt: daysAgo(10) },
        { nodeId: "q1", score: 5, total: 6, createdAt: daysAgo(6) },
      ],
      measuredReadinessPct: 20,
    });
    expect(view.forecast.kind).toBe("ready");
    expect(view.forecastSeries.points[0]?.pct).toBe(view.scorePct);
    if (view.forecast.kind === "ready") {
      expect(view.forecast.pct).toBeGreaterThanOrEqual(view.scorePct);
      expect(view.forecast.pct).toBeLessThanOrEqual(view.targetPct);
      expect(view.forecast.pct).not.toBe(100);
      const pace = view.pace!;
      expect(pace.daysToFinish).toBe(Math.ceil(pace.lessonsToTarget / pace.perDay!));
      expect(view.forecast.text).toContain(`yaklaşık ${pace.daysToFinish} günde`);
      expect(view.forecast.text).toContain(`${pace.lessonsToTarget} ders, günde ${pace.perDay}`);
      expect(view.forecastSeries.hitsTargetOn).toBe(pace.daysToFinish);
    }
  });

  it("haftalık tabloyu ve bu haftanın etkinlik sayısını kayıtlardan sayıyor", () => {
    const view = buildPrepProgressView({
      ...base,
      attempts: [
        { nodeId: "l1", score: null, total: null, createdAt: daysAgo(1) },
        { nodeId: "q1", score: 4, total: 6, createdAt: daysAgo(2) },
        { nodeId: "l2", score: null, total: null, createdAt: daysAgo(9) },
        { nodeId: "l1", score: null, total: null, createdAt: daysAgo(60) },
      ],
    });
    expect(view.weeks.labels).toEqual(["H1", "H2", "H3", "H4", "şimdi"]);
    expect(view.weeks.rows.find((r) => r.label === "Birim Çember")?.counts).toEqual([0, 0, 0, 0, 2]);
    expect(view.weeks.rows.find((r) => r.label === "Radyan")?.counts).toEqual([0, 0, 0, 1, 0]);
    expect(view.weekActivities).toBe(2);
    expect(view.tempo.thisWeekMinutes).toBe(20);
  });

  it("konu başına çözülen soru ve ders sayısını veriyor", () => {
    const view = buildPrepProgressView({
      ...base,
      attempts: [{ nodeId: "q1", score: 4, total: 6, createdAt: daysAgo(2) }],
    });
    const circle = view.topics.find((t) => t.label === "Birim Çember")!;
    expect(circle).toMatchObject({ pct: 67, solved: 6, lessons: 1 });
    // "N ders" biten ders (30 Ekim 2026): Sinüs'ün dersi planda ama bitmedi.
    expect(view.topics.find((t) => t.label === "Sinüs")).toMatchObject({ pct: 0, lessons: 0 });
    expect(view.topicsAtTarget).toBe(0);
    expect(view.lessonsDone).toBe(2);
  });

  it("hedef yoksa %75, varsa hazırlığın hedefi", () => {
    expect(buildPrepProgressView(base).targetPct).toBe(DEFAULT_TARGET_PCT);
    expect(buildPrepProgressView({ ...base, targetScore: 60 }).targetPct).toBe(60);
    // TYT puanı gibi yüzde olmayan hedef yüzdeye çevrilmiyor.
    expect(buildPrepProgressView({ ...base, targetScore: 380 }).targetPct).toBe(DEFAULT_TARGET_PCT);
  });

  it("ölçüm varsa hazırlık puanı ölçülen tahmin, yoksa tamamlama — ve bunu yazıyor", () => {
    const measured = buildPrepProgressView({ ...base, measuredReadinessPct: 42 });
    expect(measured.scorePct).toBe(42);
    expect(measured.scoreBasis).toMatch(/Ölçülen/);
    const completion = buildPrepProgressView(base);
    expect(completion.scoreBasis).toMatch(/konu hakimiyetini ölçmez/);
  });

  it("denemeleri yazılı deneme kayıtlarından sıralıyor", () => {
    const view = buildPrepProgressView({
      ...base,
      attempts: [
        { nodeId: "w1", score: 14, total: 20, createdAt: daysAgo(3) },
        { nodeId: "q1", score: 5, total: 6, createdAt: daysAgo(2) },
      ],
    });
    expect(view.mocks).toEqual([{ title: "Radyan", date: daysAgo(3), pct: 70 }]);
  });
});
