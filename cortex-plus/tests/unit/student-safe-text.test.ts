import { describe, expect, it } from "vitest";
import { studentSafePayload, studentSafeText } from "@/lib/learning/student-safe-text";

const FORBIDDEN =
  /\[(?:omurga|öğretim|ogretim|kapsam)[^\]]*\]|kaynak doğrulama|düzeltme turu|denetim turu|öğretim ölçütü|ogretim olcutu|iç etiket|ic etiket|sorun listesi/i;

/** Ders, test, kart, podcast ve sözlü: öğrenciye giden bütün metin alanları. */
const payloads = {
  lesson: {
    screens: [
      {
        heading: "Konu başlığı [omurga]",
        blocks: [{ text: "Denetim turu bunu düşürür. Denetim yetkisi kalır." }],
      },
    ],
    issues: ["[öğretim] sorun"],
    disputes: ["kaynak doğrulama tutmadı"],
    fixTriggers: ["düzeltme turu"],
  },
  quiz: {
    questions: [{ stem: "Soru metni [öğretim]. Kaynak doğrulama başarısız. Şık durur.", options: ["A"] }],
  },
  cards: {
    cards: [{ front: "[kapsam] terim", back: "Sorun listesi: birinci, ikinci. Tanım kalır." }],
  },
  podcast: {
    chapters: [
      {
        title: "Bölüm [omurga]",
        lines: [{ text: "Düzeltme turu satırı sildi. Cümle kalır." }],
      },
    ],
  },
  oral: {
    summary: "Öğretim ölçütü düşük. İç etiket görünmez. Cevap doğru.",
    feedback: "Denetim yetkisi bu cümlede konu terimidir.",
  },
};

describe("öğrenci metni iç etiket taşımaz", () => {
  it("ders, test, kart, podcast ve sözlü yükünde eşleşme sıfırdır", () => {
    const safe = studentSafePayload(payloads);
    const blob = JSON.stringify(safe);
    expect(blob.match(FORBIDDEN) ?? []).toEqual([]);
    expect(blob).toContain("Denetim yetkisi kalır");
    expect(blob).toContain("Denetim yetkisi bu cümlede konu terimidir");
    expect(blob).toContain("Şık durur");
    expect(blob).toContain("Tanım kalır");
    expect(blob).toContain("Cümle kalır");
    expect(blob).toContain("Cevap doğru");
    expect(safe.lesson).not.toHaveProperty("issues");
    expect(safe.lesson).not.toHaveProperty("disputes");
    expect(safe.lesson).not.toHaveProperty("fixTriggers");
  });

  it("yönetici kalite kaydı istenirse içine girilmeden kalır", () => {
    const raw = { title: "[kapsam] başlık", qualityReport: { note: "[omurga] iç kayıt" } };
    const admin = studentSafePayload(raw, { keepQualityReport: true });
    expect(admin.qualityReport.note).toContain("[omurga]");
    expect(admin.title).not.toMatch(FORBIDDEN);
    const student = studentSafePayload(raw);
    expect(student).not.toHaveProperty("qualityReport");
    expect(studentSafeText("Denetim yetkisi saklıdır.")).toBe("Denetim yetkisi saklıdır.");
  });
});
