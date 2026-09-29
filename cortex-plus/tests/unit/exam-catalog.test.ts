import { describe, expect, it } from "vitest";
import {
  OFFICIAL_EXAMS,
  catalogCreateHref,
  curriculumFor,
} from "@/lib/learning/exam-catalog";
import { examRelativeLabel } from "@/lib/learning/exam-prep-plan";

describe("sınav listesi kataloğu (Astra: Müfredatım / Resmî sınavlar)", () => {
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

  it("resmî sınavlar dersi ve ilk mesajı kurulum adresine taşıyor", () => {
    const tyt = OFFICIAL_EXAMS.find((item) => item.id === "tyt")!;
    const url = new URL(catalogCreateHref(tyt), "https://cortexplus.app");
    expect(url.pathname).toBe("/deneme-sinavlari/olustur");
    expect(url.searchParams.get("ders")).toBe("TYT");
    expect(url.searchParams.get("istem")).toBe("YKS TYT'ye hazırlanıyorum.");
  });

  it("kart tarihi Astra gibi göreli: sonra / önce / bugün", () => {
    const from = new Date("2026-09-29T09:00:00Z");
    expect(examRelativeLabel("2026-10-20", from)).toBe("21 gün sonra");
    expect(examRelativeLabel("2026-09-17", from)).toBe("12 gün önce");
    expect(examRelativeLabel("2026-09-29", from)).toBe("bugün");
    expect(examRelativeLabel("2026-09-30", from)).toBe("yarın");
  });
});
