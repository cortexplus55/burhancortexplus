import { describe, expect, it } from "vitest";
import { estimateNet, netPerQuestion, wrongRule, NET_MIN_RESPONSES } from "@/lib/mastery-map/net";

const st = (alpha: number, beta: number, n: number) => ({ state: { alpha, beta, n } });

describe("tahmini net (resmî yanlış kuralı)", () => {
  it("kural: LGS 3, YDS yok, ÖSYM 4", () => {
    expect(wrongRule("LGS")).toBe(3);
    expect(wrongRule("YDS")).toBe(0);
    expect(wrongRule("TYT")).toBe(4);
    expect(wrongRule("KPSS")).toBe(4);
    expect(netPerQuestion(0.6, 4)).toBeCloseTo(0.5);
    expect(netPerQuestion(0.6, 3)).toBeCloseTo(0.6 - 0.4 / 3);
    expect(netPerQuestion(0.1, 4)).toBe(0);
    expect(netPerQuestion(0.6, 0)).toBeCloseTo(0.6);
  });

  it(`${NET_MIN_RESPONSES} yanıtın altında veri yok`, () => {
    const r = estimateNet([{ unitId: "a", title: "A", subjectKey: "s", outcomes: [st(2, 1, 1), st(1, 2, 1)] }], [{ key: "s", exam: "TYT", questionCount: 40 }]);
    expect(r.status).toBe("no_data");
  });

  it("net aralığı ve en çok +net getiren konu önde", () => {
    const r = estimateNet(
      [
        { unitId: "a", title: "A", subjectKey: "s", outcomes: [st(9, 1, 8)] },
        { unitId: "b", title: "B", subjectKey: "s", outcomes: [st(1, 5, 4)] },
      ],
      [{ key: "s", exam: "TYT", questionCount: 40 }],
    );
    if (r.status !== "ok") throw new Error("ok bekleniyordu");
    expect(r.maxNet).toBe(40);
    expect(r.low).toBeLessThanOrEqual(r.net);
    expect(r.high).toBeGreaterThanOrEqual(r.net);
    expect(r.top[0]?.unitId).toBe("b");
    expect(r.top.some((t) => t.unitId === "a")).toBe(false);
  });

  it("soru sayısı olmayan ders hesaba girmez", () => {
    const r = estimateNet([{ unitId: "a", title: "A", subjectKey: "x", outcomes: [st(5, 1, 4)] }], []);
    expect(r.status).toBe("no_data");
  });
});

