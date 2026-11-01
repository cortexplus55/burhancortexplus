import { describe, expect, it } from "vitest";
import {
  buildMapUnit,
  buildPlan,
  capacity,
  formatHours,
  orderUnits,
  totalsSentence,
  unitMinutes,
  unitState,
  type MapUnitInput,
} from "@/lib/mastery-map/plan";
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
  it("ön dağılım bir kez sayılır, veri yoksa 'Henüz yeterli veri yok'", () => {
    expect(unitState([out("a", 2, 1, 1), out("b", 1, 2, 1), out("c", 1, 1, 0)])).toEqual({ alpha: 2, beta: 2, n: 2 });
    const empty = buildMapUnit(unit("u", 0, [out("a", 1, 1, 0)]));
    expect(empty.view).toEqual({ pct: null, label: "Henüz yeterli veri yok", kind: "no_data" });
    expect(empty.level).toBeNull();
  });
  it("n<3 tahmini, n≥3 güvenli etiket; öz işaret kazanır", () => {
    expect(buildMapUnit(unit("u", 0, [out("a", 2, 1, 1)])).view).toMatchObject({ pct: 67, label: "tahmini" });
    const sure = buildMapUnit(unit("u", 0, [out("a", 3, 1, 2), out("b", 2, 1, 1)]));
    expect(sure.view).toMatchObject({ pct: 80, kind: "confident", label: "3 yanıta dayalı" });
    expect(sure.level).toBe("iyi");
    const self = buildMapUnit(unit("u", 0, [out("a", 3, 1, 2), out("b", 2, 1, 1)], "zayif"));
    expect(self.level).toBe("zayif");
    expect(self.levelSource).toBe("self");
  });
});

describe("kapasite ve sıra", () => {
  it("süre: zayıf daha uzun, Biliyorum daha kısa, kazanım sayısıyla artar", () => {
    expect(unitMinutes(2, "zayif")).toBe(135);
    expect(unitMinutes(2, null)).toBe(90);
    expect(unitMinutes(2, "orta")).toBe(90);
    expect(unitMinutes(2, "iyi")).toBe(36);
    expect(unitMinutes(4, null)).toBe(180);
  });
  it("kapasite = kalan gün × günlük dk; eksikse null", () => {
    expect(capacity(30, 60)).toEqual({ days: 30, dailyMinutes: 60, minutes: 1800 });
    expect(capacity(null, 60)).toBeNull();
    expect(capacity(10, null)).toBeNull();
    expect(capacity(0, 60)?.minutes).toBe(0);
  });
  it("Zayıf önce, sonra ağırlık (kazanım sayısı), eşitlikte hazırlık sırası", () => {
    const list = [
      { id: "a", level: null, weight: 2, order: 0 },
      { id: "b", level: "zayif" as const, weight: 1, order: 1 },
      { id: "c", level: "iyi" as const, weight: 5, order: 2 },
      { id: "d", level: null, weight: 2, order: 3 },
      { id: "e", level: "zayif" as const, weight: 3, order: 4 },
    ];
    expect(orderUnits(list).map((u) => u.id)).toEqual(["e", "b", "c", "a", "d"]);
  });
  it("sığmayan üniteler 'Zaman kalırsa'; toplamlar dürüst; deterministik", () => {
    const units = [
      unit("A", 0, [out("a1", 3, 1, 2), out("a2", 2, 1, 1)]),
      unit("B", 1, [out("b1", 1, 3, 2), out("b2", 1, 2.3, 2)]),
      unit("C", 2, [out("c1", 1, 1, 0)], "iyi"),
      unit("D", 3, [out("d1", 1, 1, 0), out("d2", 1, 1, 0), out("d3", 1, 1, 0)]),
    ].map(buildMapUnit);
    const plan = buildPlan(units, capacity(2, 90));
    expect(plan.planned.map((u) => u.unitId)).toEqual(["B", "A"]);
    expect(plan.ifTime.map((u) => u.unitId)).toEqual(["D", "C"]);
    expect(plan.totalMinutes).toBe(324);
    expect(plan.plannedMinutes).toBe(171);
    expect(totalsSentence(plan)).toBe("Planın 5 saat 24 dk, senin 3 saatin var.");
    expect(buildPlan(units, capacity(2, 90))).toEqual(plan);
    const roomy = buildPlan(units, capacity(30, 60));
    expect(roomy.ifTime).toHaveLength(0);
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
