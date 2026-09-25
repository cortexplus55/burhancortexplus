import { describe, expect, it } from "vitest";
import {
  formatFounderTime,
  founderActionLabel,
  nominalCost,
  summarizeFounderUsage,
  turkeyMonthStart,
} from "@/lib/credits/founder-usage";
import {
  FOUNDER_CREDIT_ARIA,
  FOUNDER_CREDIT_LABEL,
  FOUNDER_CREDIT_SHORT,
  FOUNDER_CREDIT_TIP,
} from "@/lib/credits/chip-label";
import {
  FOUNDER_CARD_BODY,
  FOUNDER_EMPTY,
  FOUNDER_ERROR,
} from "@/components/student/founder-credits-view";
import { ADMIN_RATE_MESSAGE } from "@/lib/api/guards";
import { fluencyIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";

describe("kurucu kullanım özeti", () => {
  it("nominal bedeli toplar, işlemleri sayar, en sık işlemi bulur", () => {
    const summary = summarizeFounderUsage([
      { action_code: "QUIZ_GENERATE", metadata: { admin_bypass: true, nominal_cost: 2 } },
      { action_code: "QUIZ_GENERATE", metadata: { admin_bypass: true, nominal_cost: 2 } },
      { action_code: "AI_CHAT_STANDARD", metadata: { admin_bypass: true, nominal_cost: 1 } },
      { action_code: "AI_CHAT_ADVANCED", metadata: { admin_bypass: true, nominal_cost: 3 } },
      { action_code: "AI_CHAT_STANDARD", metadata: { admin_bypass: true, nominal_cost: 1 } },
    ]);
    expect(summary).toEqual({ nominalTotal: 9, count: 5, topAction: "Sohbet" });
  });

  it("hiç işlem yoksa sıfır ve boş", () => {
    expect(summarizeFounderUsage([])).toEqual({ nominalTotal: 0, count: 0, topAction: null });
  });

  it("bozuk ya da eksik meta veriyi sıfır sayar", () => {
    expect(nominalCost(null)).toBe(0);
    expect(nominalCost({ nominal_cost: "abc" })).toBe(0);
    expect(nominalCost({ nominal_cost: -4 })).toBe(0);
    expect(nominalCost({ nominal_cost: "7" })).toBe(7);
  });

  it("her ActionCode'un Türkçe bir adı var; bilinmeyen kod uydurulmaz", () => {
    for (const code of [
      "AI_CHAT_STANDARD", "AI_CHAT_ADVANCED", "AI_CHAT_PARENT", "IMAGE_SOLUTION",
      "DOCUMENT_PAGE_PROCESS", "QUIZ_GENERATE", "FLASHCARD_GENERATE", "PRACTICE_EXAM_GENERATE",
      "PRACTICE_EXAM_GRADE", "STUDY_PLAN_GENERATE", "EXPORT_PDF", "AUDIO_SYNTHESIZE",
    ]) {
      expect(founderActionLabel(code)).not.toBe("Diğer işlem");
    }
    expect(founderActionLabel("NEW_THING")).toBe("Diğer işlem");
    expect(founderActionLabel(null)).toBe("Diğer işlem");
  });
});

describe("Türkiye saati", () => {
  it("ayın başı Türkiye gece yarısıdır", () => {
    // 1 Ekim 01:30 Türkiye = 30 Eylül 22:30 UTC → Ekim ayı
    expect(turkeyMonthStart(new Date("2026-09-30T22:30:00Z"))).toBe("2026-09-30T21:00:00.000Z");
    expect(turkeyMonthStart(new Date("2026-09-25T20:14:00Z"))).toBe("2026-08-31T21:00:00.000Z");
  });

  it("tarih '25 Eyl 23:14' biçiminde", () => {
    expect(formatFounderTime("2026-09-25T20:14:00Z")).toBe("25 Eyl 23:14");
    expect(formatFounderTime("2026-01-03T06:05:00Z")).toBe("3 Oca 09:05");
  });
});

describe("yeni arayüz metinleri doğal Türkçe", () => {
  const sentences = [
    FOUNDER_CARD_BODY,
    FOUNDER_EMPTY,
    FOUNDER_ERROR,
    FOUNDER_CREDIT_TIP,
    ADMIN_RATE_MESSAGE,
    "Kurucu hesabı: bu oturum kredinden düşmez.",
    "Kurucu hesabı: işlemler kredinden düşmez.",
    "Kurucu hesabı. Kredi sınırı yok.",
    "Bakiye sıfırın altına inemez.",
  ];
  const labels = [
    FOUNDER_CREDIT_LABEL,
    FOUNDER_CREDIT_SHORT,
    FOUNDER_CREDIT_ARIA,
    "Krediler",
    "Kurucu hesabı",
    "Bu ay nominal kullanım",
    "Bu ay işlem sayısı",
    "En çok kullanılan",
    "Son işlemler",
    "Normal maliyet",
    "Düşen",
    "Yeniden dene",
    "Hesap türü",
    "Ders ve içerik üretimi",
    "Fotoğraftan çözüm",
    "Deneme değerlendirme",
  ];

  it.each(sentences)("cümle: %s", (text) => {
    expect(fluencyIssues(text)).toEqual([]);
  });

  it.each(labels)("etiket: %s", (text) => {
    expect(repairTurkishSurface(text)).toBe(text);
    // Cümle düzeni: yalnızca ilk kelime büyük harfle başlıyor.
    const words = text.split(/\s+/).filter((w) => /^[A-Za-zÇĞİÖŞÜçğıöşü]/.test(w));
    expect(words.slice(1).filter((w) => /^[A-ZÇĞİÖŞÜ]/.test(w) && w !== "Sınırsız")).toEqual([]);
  });
});
