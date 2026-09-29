import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_PCT,
  buildPrepProgressView,
  type ProgressNode,
} from "@/lib/learning/prep-progress-view";

const NOW = new Date("2026-09-29T12:00:00Z");
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
  it("tahmini ilk iki dersten önce göstermiyor", () => {
    const view = buildPrepProgressView({
      ...base,
      nodes: nodes.map((n) => (n.id === "l2" ? { ...n, status: "ready" as const } : n)),
    });
    expect(view.forecast.kind).toBe("waiting");
  });

  it("sınav tarihi yoksa tahmin beklemede", () => {
    const view = buildPrepProgressView(base);
    expect(view.forecast).toEqual({ kind: "waiting", reason: "Sınav tarihi girilince tahmin görünür." });
  });

  it("tahmini son iki haftanın tamamlama temposundan kuruyor ve bunu söylüyor", () => {
    const view = buildPrepProgressView({
      ...base,
      examDate: "2026-10-13",
      attempts: [
        { nodeId: "l1", score: null, total: null, createdAt: daysAgo(10) },
        { nodeId: "q1", score: 5, total: 6, createdAt: daysAgo(6) },
      ],
    });
    expect(view.forecast.kind).toBe("ready");
    if (view.forecast.kind === "ready") {
      // 4/6 bitti; 14 günde 2 etkinlik → günde 1/7; 14 gün kaldı → +2 → 6/6.
      expect(view.forecast.pct).toBe(100);
      expect(view.forecast.text).toMatch(/temposu sürerse/);
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
    expect(circle).toMatchObject({ pct: 100, solved: 6, lessons: 1 });
    expect(view.topics.find((t) => t.label === "Sinüs")).toMatchObject({ pct: 0, lessons: 1 });
    expect(view.topicsAtTarget).toBe(1);
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
