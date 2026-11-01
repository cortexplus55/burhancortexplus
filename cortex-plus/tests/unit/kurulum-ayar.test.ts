import { describe, expect, it } from "vitest";
import { hasSchoolExams, levelForExamLabel, yksPartForLabel } from "@/lib/curriculum/topic-map";
import { distinctTopicCount } from "@/lib/learning/path-sections";
import { runPool } from "@/lib/documents/upload-batch";

describe("sınav türünden düzey", () => {
  it("TYT/AYT/YKS → yks, LGS → lgs, KPSS → kpss, N. sınıf → sinif-N", () => {
    expect(levelForExamLabel("TYT")).toBe("yks");
    expect(levelForExamLabel("AYT Matematik")).toBe("yks");
    expect(levelForExamLabel("LGS")).toBe("lgs");
    expect(levelForExamLabel("KPSS GY-GK")).toBe("kpss");
    expect(levelForExamLabel("10. sınıf")).toBe("sinif-10");
    expect(levelForExamLabel("Vize")).toBeNull();
    expect(yksPartForLabel("tyt")).toBe("TYT");
    expect(yksPartForLabel("LGS")).toBeNull();
  });
  it("yazılısı olmayan programda yazılı seçimi yok", () => {
    expect(hasSchoolExams({ exams: {} })).toBe(false);
    expect(hasSchoolExams({ exams: { d1y1: {} } })).toBe(true);
  });
});

describe("kilitli konu sayısı", () => {
  it("ara/tekrar bölümlerini değil farklı konuları sayar", () => {
    const sections = [
      { id: "topic:a", title: "1.1 Kümeler" },
      { id: "topic:a2", title: "1.1 Kümeler" },
      { id: "review:1", title: "Tekrar" },
      { id: "topic:b", title: "1.2 Sayılar" },
    ];
    expect(distinctTopicCount(sections)).toBe(2);
  });
});

describe("kurulum yazımları", () => {
  it("sınırlı eşzamanlılıkla hepsini yazar", async () => {
    let live = 0;
    let peak = 0;
    const r = await runPool(Array.from({ length: 50 }, (_, i) => i), 16, async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((res) => setTimeout(res, 1));
      live -= 1;
      return true;
    });
    expect(r.succeeded).toBe(50);
    expect(peak).toBeLessThanOrEqual(16);
  });
});
