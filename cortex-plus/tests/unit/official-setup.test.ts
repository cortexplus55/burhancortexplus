import { describe, expect, it } from "vitest";
import { buildSetupTree, verifyPlannedUnits } from "@/lib/curriculum/official-setup";
import {
  plannedTopics,
  selectionCounts,
  subjectTotals,
  toggleOutcome,
  toggleUnit,
  type SetupSelection,
} from "@/lib/curriculum/official-setup-select";
import { AYT_SUBJECTS, subjectKeysForAlan, TYT_SUBJECTS, YKS_ALANLAR } from "@/lib/curriculum/yks-alan";

const empty = (subjectKeys: string[]): SetupSelection => ({ subjectKeys, removedOutcomes: [], removedUnits: [] });

describe("YKS alan → ders (ÖSYM 2026-YKS Kılavuzu Tablo 1E)", () => {
  it("SAY = TYT + AYT Matematik, Fizik, Kimya, Biyoloji", () => {
    expect(subjectKeysForAlan("say")).toEqual([
      ...TYT_SUBJECTS.map((s) => s.key),
      "ayt-matematik",
      "ayt-fizik",
      "ayt-kimya",
      "ayt-biyoloji",
    ]);
  });
  it("EA = TYT + AYT Matematik, TDE, Tarih-1, Coğrafya-1", () => {
    expect(subjectKeysForAlan("ea").slice(TYT_SUBJECTS.length)).toEqual(["ayt-matematik", "ayt-tde", "ayt-tarih", "ayt-cografya"]);
  });
  it("SÖZ = TYT + TDE-SB1 + SB2 (Felsefe Grubu, DKAB)", () => {
    expect(subjectKeysForAlan("soz").slice(TYT_SUBJECTS.length)).toEqual([
      "ayt-tde",
      "ayt-tarih",
      "ayt-cografya",
      "ayt-felsefe-grubu",
      "ayt-dkab",
    ]);
  });
  it("Sadece TYT ve DİL yalnız TYT dersleri; DİL YDT notu taşır", () => {
    expect(subjectKeysForAlan("tyt")).toEqual(TYT_SUBJECTS.map((s) => s.key));
    expect(subjectKeysForAlan("dil")).toEqual(TYT_SUBJECTS.map((s) => s.key));
    expect(YKS_ALANLAR.find((a) => a.id === "dil")?.ydt).toBe(true);
  });
  it("her alan anahtarı tanımlı bir AYT dersine işaret eder", () => {
    const keys = new Set(AYT_SUBJECTS.map((s) => s.key));
    for (const alan of YKS_ALANLAR) for (const k of alan.aytKeys) expect(keys.has(k)).toBe(true);
  });
});

describe("Kurulum ağacı (kayıt defterinden)", () => {
  const yks = buildSetupTree("yks");
  const lgs = buildSetupTree("lgs");

  it("YKS'nin bütün TYT ve AYT dersleri kayıtta ünite taşır", () => {
    expect(yks.subjects.map((s) => s.key)).toEqual([...TYT_SUBJECTS, ...AYT_SUBJECTS].map((s) => s.key));
    for (const s of yks.subjects) expect(subjectTotals(s).outcomes).toBeGreaterThan(0);
  });
  it("TYT ve AYT kazanımları ayrışır, toplam YKS kazanımını aşmaz", () => {
    const outcomes = yks.subjects.reduce((n, s) => n + subjectTotals(s).outcomes, 0);
    expect(outcomes).toBeLessThanOrEqual(1518);
    const tytMath = yks.subjects.find((s) => s.key === "tyt-matematik")!;
    const aytMath = yks.subjects.find((s) => s.key === "ayt-matematik")!;
    expect(subjectTotals(tytMath).outcomes).toBe(68);
    expect(subjectTotals(aytMath).outcomes).toBe(62);
    expect(tytMath.questionCount).toBe(40);
  });
  it("LGS 6 ders, 38 ünite, 326 kazanım", () => {
    expect(lgs.subjects).toHaveLength(6);
    expect(lgs.subjects.reduce((n, s) => n + subjectTotals(s).units, 0)).toBe(38);
    expect(lgs.subjects.reduce((n, s) => n + subjectTotals(s).outcomes, 0)).toBe(326);
  });
  it("istemci ağacı küçük kalır (kayıt defteri JSON'u pakete girmez)", () => {
    expect(JSON.stringify(yks).length).toBeLessThan(400_000);
  });
});

describe("Seçim → hazırlık yolu (gösterilen = teslim edilen)", () => {
  const lgs = buildSetupTree("lgs");
  const all = lgs.subjects.map((s) => s.key);

  it("bütün LGS: 38 konu, 326 kazanım, benzersiz konu adları", () => {
    const topics = plannedTopics(lgs, empty(all));
    expect(selectionCounts(topics)).toEqual({ subjects: 6, units: 38, outcomes: 326 });
    expect(new Set(topics.map((t) => t.topic)).size).toBe(38);
    for (const t of topics) expect(t.topic.length).toBeLessThanOrEqual(120);
  });
  it("ünite kaldırma ve kazanım kaldırma sayıları düşürür; geri açma geri getirir", () => {
    const unit = lgs.subjects[1]!.units[0]!;
    let sel = toggleUnit(empty(all), unit.id);
    expect(selectionCounts(plannedTopics(lgs, sel))).toEqual({ subjects: 6, units: 37, outcomes: 326 - unit.outcomes.length });
    sel = toggleUnit(sel, unit.id);
    sel = toggleOutcome(sel, unit.id, unit.outcomes[0]!.code);
    expect(selectionCounts(plannedTopics(lgs, sel))).toEqual({ subjects: 6, units: 38, outcomes: 325 });
    for (const o of unit.outcomes.slice(1)) sel = toggleOutcome(sel, unit.id, o.code);
    expect(selectionCounts(plannedTopics(lgs, sel)).units).toBe(37);
  });
  it("tek ders seçimi yalnız o dersin ünitelerini verir", () => {
    const topics = plannedTopics(lgs, empty(["lgs-2027-matematik"]));
    expect(topics.every((t) => t.programId === "lgs-2027-matematik")).toBe(true);
    expect(selectionCounts(topics)).toEqual({ subjects: 1, units: 5, outcomes: 52 });
  });
  it("sunucu doğrulaması bilinmeyen kodu ve üniteyi düşürür", () => {
    const unit = lgs.subjects[0]!.units[0]!;
    const ok = verifyPlannedUnits([
      { unitId: unit.id, codes: [unit.outcomes[0]!.code, "UYDURMA.1"] },
      { unitId: "yok#0", codes: ["x"] },
    ]);
    expect(ok).toEqual([{ unitId: unit.id, codes: [unit.outcomes[0]!.code] }]);
  });
});
