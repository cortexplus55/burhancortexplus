import { describe, expect, it } from "vitest";
import {
  buildMapUnit,
  buildPlan,
  capacity,
  formatHours,
  levelFromMastery,
  masteryView,
  orderUnits,
  OUTCOME_MINUTES,
  OUTCOME_MINUTES_MAX,
  OUTCOME_MINUTES_MIN,
  outcomeMinutes,
  totalsSentence,
  unitMastery,
  type MapUnitInput,
} from "@/lib/mastery-map/plan";
import { tytScenario } from "@/app/e2e/hakimiyet-tyt/scenario";
import { pickReinforcement, type ReinforceItem } from "@/lib/mastery-map/reinforce";
import { PRIOR } from "@/lib/level-check/mastery";

const out = (id: string, alpha: number, beta: number, n: number) => ({ outcomeId: id, code: id, text: id, state: { alpha, beta, n } });
const unit = (id: string, order: number, outcomes: ReturnType<typeof out>[], selfRating: MapUnitInput["selfRating"] = null): MapUnitInput => ({
  unitId: id,
  title: id,
  order,
  outcomes,
  selfRating,
});

describe("ünite ustalığı", () => {
  it("ünite % = yanıtlı kazanım yüzdelerinin ortalaması (haritada gösterilenle tutarlı); veri yoksa 'Henüz yeterli veri yok'", () => {
    expect(unitMastery([out("a", 2, 1, 1), out("b", 1, 2, 1), out("c", 1, 1, 0)])).toEqual({ mastery: 0.5, n: 2 });
    const empty = buildMapUnit(unit("u", 0, [out("a", 1, 1, 0)]));
    expect(empty.view).toEqual({ pct: null, label: "Henüz yeterli veri yok", kind: "no_data" });
    expect(empty.level).toBeNull();
    // Canlı senaryo: %33 / %37 / %70 / %33 → ünite %43 (eski havuzlu hesap %38 gösteriyordu).
    const m = buildMapUnit(tytScenario(true)[0]!);
    expect(m.outcomes.slice(0, 4).map((o) => masteryView(o.state).pct)).toEqual([33, 37, 70, 33]);
    expect(m.view).toMatchObject({ pct: 43, kind: "confident", label: "4 yanıta dayalı" });
  });
  it("n<3 tahmini, n≥3 güvenli; yanıt varsa seviye ustalıktan (öz işaretin önüne geçer), yoksa öz işaret", () => {
    expect(buildMapUnit(unit("u", 0, [out("a", 2, 1, 1)])).view).toMatchObject({ pct: 67, label: "tahmini" });
    const sure = buildMapUnit(unit("u", 0, [out("a", 4, 1, 3)], "zayif"));
    expect(sure.level).toBe("iyi");
    expect(sure.levelSource).toBe("mastery");
    const self = buildMapUnit(unit("u", 0, [out("a", 1, 1, 0)], "zayif"));
    expect(self.level).toBe("zayif");
    expect(self.levelSource).toBe("self");
    expect(levelFromMastery(0.49)).toBe("zayif");
    expect(levelFromMastery(0.5)).toBe("orta");
    expect(levelFromMastery(0.75)).toBe("iyi");
  });
});

describe("süre tahmini", () => {
  it("kazanım başına 20–40 dk: Zayıf 40, Orta/bilinmiyor 30, Biliyorum 20", () => {
    for (const v of Object.values(OUTCOME_MINUTES)) {
      expect(v).toBeGreaterThanOrEqual(OUTCOME_MINUTES_MIN);
      expect(v).toBeLessThanOrEqual(OUTCOME_MINUTES_MAX);
    }
    expect(OUTCOME_MINUTES_MIN).toBe(20);
    expect(OUTCOME_MINUTES_MAX).toBe(40);
    expect(outcomeMinutes(PRIOR, "zayif")).toBe(40);
    expect(outcomeMinutes(PRIOR, null)).toBe(30);
    expect(outcomeMinutes(PRIOR, "iyi")).toBe(20);
    // Kazanımın kendi yanıtı ünite seviyesinin önüne geçer.
    expect(outcomeMinutes({ alpha: 4, beta: 1, n: 3 }, "zayif")).toBe(20);
  });
  it("her ünite kazanım sayısı × [20, 40] dk aralığında; TYT Temel Matematik 68 kazanım ≈ 34 saat (eski model 50 sa 38 dk)", () => {
    const units = tytScenario(false).map(buildMapUnit);
    for (const u of units) {
      expect(u.minutes).toBeGreaterThanOrEqual(u.weight * 20);
      expect(u.minutes).toBeLessThanOrEqual(u.weight * 40);
    }
    expect(units.find((u) => u.title === "Üçgenler")!.minutes).toBe(480);
    expect(units.find((u) => u.title === "Denklemler ve Eşitsizlikler")!.minutes).toBe(360);
    expect(buildPlan(units, null).totalMinutes).toBe(2040);
  });
});

describe("kapasite ve sıra", () => {
  it("kapasite = kalan gün × günlük dk; eksikse null", () => {
    expect(capacity(30, 60)).toEqual({ days: 30, dailyMinutes: 60, minutes: 1800 });
    expect(capacity(null, 60)).toBeNull();
    expect(capacity(10, null)).toBeNull();
    expect(capacity(0, 60)?.minutes).toBe(0);
  });
  it("Zayıf → Orta/bilinmiyor → Biliyorum; katman içinde ağırlık, eşitlikte hazırlık sırası", () => {
    const list = [
      { id: "a", level: null, weight: 2, order: 0 },
      { id: "b", level: "zayif" as const, weight: 1, order: 1 },
      { id: "c", level: "iyi" as const, weight: 5, order: 2 },
      { id: "d", level: "orta" as const, weight: 2, order: 3 },
      { id: "e", level: "zayif" as const, weight: 3, order: 4 },
    ];
    expect(orderUnits(list).map((u) => u.id)).toEqual(["e", "b", "a", "d", "c"]);
  });
  it("katı sıra: sığmayan üst ünite atlanmaz, en zayıf kazanımlarıyla kısmen planlanır; alttakiler öne geçmez", () => {
    const big = unit("BIG", 0, [out("b1", 1, 1, 0), out("b2", 1, 4, 3), out("b3", 1, 1, 0), out("b4", 1, 2, 1)], "zayif");
    const small = unit("SMALL", 1, [out("s1", 1, 1, 0)]);
    const known = unit("KNOWN", 2, [out("k1", 1, 1, 0)], "iyi");
    const units = [small, known, big].map(buildMapUnit);
    const plan = buildPlan(units, capacity(1, 100));
    // BIG = 4 × 40 = 160 > 100 → en zayıf 2 kazanım (b2 %20, b4 %33) plana; SMALL (30 dk sığardı) yine de sonra.
    expect(plan.planned.map((e) => [e.unit.unitId, e.outcomes.map((o) => o.outcomeId), e.partial])).toEqual([["BIG", ["b2", "b4"], true]]);
    expect(plan.ifTime.map((e) => [e.unit.unitId, e.outcomes.map((o) => o.outcomeId)])).toEqual([
      ["BIG", ["b1", "b3"]],
      ["SMALL", ["s1"]],
      ["KNOWN", ["k1"]],
    ]);
    expect(plan.plannedMinutes).toBe(80);
    expect(plan.totalMinutes).toBe(160 + 30 + 20);
  });
  it("planlanan hiçbir ünite, 'Zaman kalırsa'daki daha yüksek öncelikli bir üniteden sonra gelmez", () => {
    const units = tytScenario(true).map(buildMapUnit);
    for (const minutes of [0, 30, 100, 300, 600, 1200, 1800]) {
      const plan = buildPlan(units, { days: 1, dailyMinutes: minutes, minutes });
      const rank = new Map(orderUnits(units).map((u, i) => [u.unitId, i]));
      const lastPlanned = Math.max(-1, ...plan.planned.map((e) => rank.get(e.unit.unitId)!));
      const firstLater = Math.min(99, ...plan.ifTime.filter((e) => !e.partial).map((e) => rank.get(e.unit.unitId)!));
      expect(lastPlanned).toBeLessThan(firstLater);
      expect(plan.plannedMinutes).toBeLessThanOrEqual(minutes);
    }
  });
  it("canlı senaryo (10 gün × 30 dk): Mantık tamamen planda, Üçgenler kısmen; Kümeler en sonda", () => {
    for (const answered of [false, true]) {
      const plan = buildPlan(tytScenario(answered).map(buildMapUnit), capacity(10, 30));
      expect(plan.planned.map((e) => e.unit.title)).toEqual(["Mantık", "Üçgenler"]);
      expect(plan.planned[0]!.partial).toBe(false);
      expect(plan.planned[1]!.outcomes).toHaveLength(3);
      expect(plan.ifTime.map((e) => e.unit.title)[0]).toBe("Üçgenler");
      expect(plan.ifTime.at(-1)!.unit.title).toBe("Kümeler");
      expect(plan.ifTime.map((e) => e.unit.title)).not.toContain("Mantık");
    }
    const after = buildPlan(tytScenario(true).map(buildMapUnit), capacity(10, 30));
    expect(totalsSentence(after)).toBe("Planın 33 saat 50 dk, senin 5 saatin var.");
    expect(after.plannedMinutes).toBe(280);
    expect(totalsSentence(buildPlan(tytScenario(false).map(buildMapUnit), capacity(10, 30)))).toBe("Planın 34 saat, senin 5 saatin var.");
  });
  it("deterministik; kapasite yoksa ya da yeterliyse 'Zaman kalırsa' boş", () => {
    const units = tytScenario(true).map(buildMapUnit);
    expect(buildPlan(units, capacity(10, 30))).toEqual(buildPlan(units, capacity(10, 30)));
    expect(buildPlan(units, capacity(100, 60)).ifTime).toHaveLength(0);
    expect(buildPlan(units, null).ifTime).toHaveLength(0);
  });
  it("saat biçimi", () => {
    expect(formatHours(2040)).toBe("34 saat");
    expect(formatHours(40)).toBe("40 dk");
    expect(formatHours(90)).toBe("1 saat 30 dk");
    expect(totalsSentence({ planned: [], ifTime: [], totalMinutes: 2040, plannedMinutes: 0, capacity: { days: 28, dailyMinutes: 60, minutes: 1680 } })).toBe(
      "Planın 34 saat, senin 28 saatin var.",
    );
  });
});

describe("pekiştirme seçimi", () => {
  const items: ReinforceItem[] = [
    { id: "h1", outcomeId: "w", difficulty: "hard" },
    { id: "m1", outcomeId: "w", difficulty: "medium" },
    { id: "e1", outcomeId: "w", difficulty: "easy" },
    { id: "e2", outcomeId: "w", difficulty: "easy" },
    { id: "x1", outcomeId: "ok", difficulty: "easy" },
    { id: "h2", outcomeId: "w2", difficulty: "hard" },
  ];
  it("zayıf kazanım (≥1 yanıt, <0,5) başına 2 soru: aynı kazanım, yanıtlanmamış, önce kolay/orta", () => {
    const r = pickReinforcement(
      [
        { outcomeId: "w", state: { alpha: 1, beta: 2, n: 1 } },
        { outcomeId: "ok", state: { alpha: 3, beta: 1, n: 2 } },
        { outcomeId: "none", state: PRIOR },
      ],
      items,
      new Set(["e1"]),
    );
    expect(r.weak).toEqual(["w"]);
    expect(r.picked.map((i) => i.id)).toEqual(["m1", "e2"]);
    expect(r.missing).toEqual([]);
  });
  it("kolay/orta bitince zor; hiç yoksa dürüstçe 'missing'", () => {
    const r = pickReinforcement(
      [
        { outcomeId: "w2", state: { alpha: 1, beta: 2, n: 1 } },
        { outcomeId: "empty", state: { alpha: 1, beta: 3, n: 2 } },
      ],
      items,
      new Set(),
    );
    expect(r.picked.map((i) => i.id)).toEqual(["h2"]);
    expect(r.missing).toEqual(["empty"]);
  });
  it("tam %50 zayıf sayılmaz; veri yoksa öneri yok", () => {
    const r = pickReinforcement([{ outcomeId: "w", state: { alpha: 2, beta: 2, n: 2 } }, { outcomeId: "w", state: PRIOR }], items, new Set());
    expect(r.weak).toEqual([]);
    expect(r.picked).toEqual([]);
  });
});
