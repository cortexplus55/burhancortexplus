import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { subjectForPlannedUnit, buildSetupTree } from "@/lib/curriculum/official-setup";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { estimateNet } from "@/lib/mastery-map/net";

describe("KPSS tahmini ders dağılımı (net kartı)", () => {
  it("tahmini satırlar GY 30+30, GK 27+18+9+6 = 120 ve estimate işaretli", () => {
    const rows = CURRICULUM.examStructures.filter((r) => r.exam === "KPSS-TAHMINI");
    expect(rows.every((r) => r.estimate === true)).toBe(true);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(120);
    expect(Object.fromEntries(rows.map((r) => [r.subject, r.count]))).toEqual({
      Türkçe: 30, Matematik: 30, Tarih: 27, Coğrafya: 18, Vatandaşlık: 9, "Güncel Bilgiler": 6,
    });
  });
  it("kurulum ağacında resmî sayı gibi görünmez, net için tahmini sayı döner", () => {
    expect(buildSetupTree("kpss").subjects.every((s) => s.questionCount === null)).toBe(true);
    const s = subjectForPlannedUnit("kpss", "kpss-2026-deep-turkce", null);
    expect(s).toMatchObject({ exam: "KPSS-TAHMINI", questionCount: 30, estimated: true });
    expect(subjectForPlannedUnit("ales", "ales-2026-deep-sayisal", null)?.estimated).toBeUndefined();
  });
  it("net 4 yanlış 1 doğru kuralıyla hesaplanır ve estimated işaretlenir", () => {
    const st = { alpha: 9, beta: 1, n: 10 } as never;
    const est = estimateNet(
      [{ unitId: "u", title: "Paragraf", subjectKey: "k", outcomes: [{ state: st }] }],
      [{ key: "k", exam: "KPSS-TAHMINI", questionCount: 30, estimated: true }],
    );
    expect(est.status).toBe("ok");
    if (est.status === "ok") {
      expect(est.maxNet).toBe(30);
      expect(est.estimated).toBe(true);
      expect(est.net).toBeCloseTo(30 * (0.9 - 0.1 / 4), 0);
    }
  });
});
