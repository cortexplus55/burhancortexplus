import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { matchOutcome } from "@/lib/mastery-map/exam-evidence-match";
import { estimateGainOnly } from "@/lib/mastery-map/net";
import { netEstimateFor } from "@/lib/mastery-map/net-load";

describe("havuz dışı soru → kazanım eşlemesi", () => {
  const outcomes = [
    { outcomeId: "p#1", text: "Kösedağ Savaşı sonrası Anadolu'da Moğol hâkimiyetini açıklar." },
    { outcomeId: "p#2", text: "Beyliklerin kuruluşunu ve siyasi yapısını değerlendirir." },
  ];
  it("tek açık kazanan → tam ağırlık", () => {
    expect(matchOutcome("1243 Kösedağ Savaşı'nın ardından Anadolu'da ne oldu?", outcomes)).toEqual({ outcomeIds: ["p#1"], weight: 1, kind: "text" });
  });
  it("örtüşme yok → ünite kazanımlarına eşit pay", () => {
    const m = matchOutcome("Tamamen ilgisiz soru metni", outcomes)!;
    expect(m.kind).toBe("unit_spread");
    expect(m.outcomeIds).toEqual(["p#1", "p#2"]);
    expect(m.weight).toBe(0.5);
  });
  it("kazanım yoksa null", () => {
    expect(matchOutcome("x", [])).toBeNull();
  });
});

describe("net kartı her zaman bir durum döndürür", () => {
  const unit = (n: number) => ({ unitId: "u", title: "U", outcomes: [{ outcomeId: "o", state: { alpha: 1, beta: 1 + n, n } }] });
  it("soru sayısı bilinmeyen KPSS dersi: az veride no_data", () => {
    const prefs = { officialPlan: { exam: "kpss", units: [{ unitId: "kpss-2026-deep-tarih#0", programId: "kpss-2026-deep-tarih" }] } };
    expect(netEstimateFor(prefs, [unit(0)] as never).status).toBe("no_data");
  });
  it("yeterli veride no_count ve +3 konu (net uydurulmaz)", () => {
    const r = netEstimateFor({ officialPlan: { exam: "kpss", units: [] } }, [unit(4)] as never);
    expect(r.status).toBe("no_count");
    if (r.status === "no_count") expect(r.top[0]?.unitId).toBe("u");
  });
  it("estimateGainOnly en büyük kazanç önde", () => {
    const r = estimateGainOnly([
      { unitId: "a", title: "A", subjectKey: "", outcomes: [{ state: { alpha: 8, beta: 2, n: 8 } }] },
      { unitId: "b", title: "B", subjectKey: "", outcomes: [{ state: { alpha: 1, beta: 4, n: 3 } }] },
    ]);
    expect(r.status === "no_count" && r.top.map((t) => t.unitId)).toEqual(["b", "a"]);
  });
});
