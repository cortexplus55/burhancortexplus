import { describe, expect, it } from "vitest";
import {
  OFFICIAL_EXAMS,
  catalogCreateHref,
  curriculumFor,
} from "@/lib/learning/exam-catalog";
import { examRelativeLabel } from "@/lib/learning/exam-prep-plan";

describe("sınav listesi kataloğu (kıyas ürünü: Müfredatım / Resmî sınavlar)", () => {
  it("ortaokulda ortaokul, lisede lise dersleri veriyor", () => {
    const middle = curriculumFor("7. sınıf");
    expect(middle.levelLabel).toBe("7. sınıf");
    expect(middle.items.map((i) => i.subject)).toContain("Fen Bilimleri");
    const high = curriculumFor("11. sınıf");
    expect(high.items.map((i) => i.subject)).toContain("Türk Dili ve Edebiyatı");
    expect(high.items[0].prompt).toBe("11. sınıf Matematik müfredatındaki konulara çalışmak istiyorum.");
  });

  it("mezuna YKS dersleri, sınıfı bilinmeyene lise dersleri", () => {
    expect(curriculumFor("Mezun").items.map((i) => i.subject)).toContain("TYT Matematik");
    expect(curriculumFor(null).levelLabel).toBe("Lise");
  });

  it("kayıt defterindeki tüm sınav kartları resmî kuruluma gider", () => {
    const byId = (id: string) => OFFICIAL_EXAMS.find((item) => item.id === id)!;
    expect(catalogCreateHref(byId("tyt"))).toBe("/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt");
    expect(catalogCreateHref(byId("ayt"))).toBe("/deneme-sinavlari/resmi/kurulum?sinav=yks");
    expect(catalogCreateHref(byId("lgs"))).toBe("/deneme-sinavlari/resmi/kurulum?sinav=lgs");
    for (const id of ["kpss", "ales", "dgs", "yds", "tus", "dus"]) {
      expect(catalogCreateHref(byId(id))).toBe(`/deneme-sinavlari/resmi/kurulum?sinav=${id}`);
    }
  });

  it("kart tarihi kıyas ürünü gibi göreli: sonra / önce / bugün", () => {
    const from = new Date("2026-09-29T09:00:00Z");
    expect(examRelativeLabel("2026-10-20", from)).toBe("21 gün sonra");
    expect(examRelativeLabel("2026-09-17", from)).toBe("12 gün önce");
    expect(examRelativeLabel("2026-09-29", from)).toBe("bugün");
    expect(examRelativeLabel("2026-09-30", from)).toBe("yarın");
  });
});
