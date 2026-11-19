import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { texToUnicode } from "@/lib/text/unicode-math";
import { chemSubscripts } from "@/lib/text/chem-subscripts";
import { eliminateDistractor } from "@/lib/learning/two-option-eliminate";
import { maskEmail, parentLinkValidityLine, parentPayUrl, parentShareText, PARENT_LINK_EXPIRED_TEXT, PARENT_PAY_PATH } from "@/lib/payments/parent-link";
import { isParentLinkPlan, parentLinkPlanName } from "@/lib/payments/parent-link-plan";
import { PLAN_MARKETING_COPY, RETIRED_QUOTA_PHRASES } from "@/lib/marketing/plan-copy";
import { REPORT_BUTTON, REPORT_REASONS } from "@/lib/learning/question-report/copy";
import { TWIN_BUTTON, TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import { TWIN_EXAM_LABEL, TWIN_EXAM_QUESTION_COUNT, TWIN_EXAM_SHORT_LABEL } from "@/lib/learning/mock-exam/past-questions";
import { demoQuestionByRef, type DemoQuiz } from "@/lib/demo/demo-quiz";

/* Faz 5 (19 Kasım 2026): vitrin ve vaat eşitleme. Örnekler jenerik; gerçek kullanıcı ya da denetim verisi yok. */

const read = (path: string) => readFileSync(path, "utf8");

describe("§1.1 formül yazı tipinden bağımsız", () => {
  it("kök ve üsler Unicode'a çevrilir", () => {
    expect(texToUnicode("\\sqrt[2n]{a^{2n}} = |a|")).toBe("²ⁿ√(a²ⁿ) = |a|");
    expect(texToUnicode("\\sqrt[2n+1]{a^{2n+1}} = a")).toBe("²ⁿ⁺¹√(a²ⁿ⁺¹) = a");
  });
});

describe("§3.1 kimyasal formüllerde alt simge", () => {
  it("element dizisi alt simgeyle; sıradan sayılar dokunulmaz", () => {
    expect(chemSubscripts("H2O")).toBe("H₂O");
    expect(chemSubscripts("CO2 ve H2O")).toBe("CO₂ ve H₂O");
    expect(chemSubscripts("C6H12O6")).toBe("C₆H₁₂O₆");
    expect(chemSubscripts("Soru 2")).toBe("Soru 2");
    expect(chemSubscripts("Sayfa 12")).toBe("Sayfa 12");
  });
});

describe("§3.1 iki şık arasında kaldım: bir çeldirici elenir, cevap ele verilmez", () => {
  const question = { text: "Örnek soru kökü", options: ["Seçenek 1", "Seçenek 2", "Seçenek 3", "Seçenek 4"], correct: ["Seçenek 2"] };

  it("elenen şık seçilen iki şıkkın dışında ve yanlış", () => {
    const out = eliminateDistractor({ ...question, pair: ["Seçenek 1", "Seçenek 2"] });
    expect(out === "Seçenek 3" || out === "Seçenek 4").toBe(true);
    expect(eliminateDistractor({ ...question, pair: ["Seçenek 1", "Seçenek 2"] })).toBe(out);
  });

  it("çok cevaplı soruda ya da dışarıda çeldirici yoksa eleme yok", () => {
    expect(eliminateDistractor({ ...question, pair: ["Seçenek 1", "Seçenek 2"], multi: true })).toBeNull();
    expect(eliminateDistractor({ ...question, options: ["Seçenek 1", "Seçenek 2"], pair: ["Seçenek 1", "Seçenek 2"] })).toBeNull();
  });

  it("etiketler harfiyen", () => {
    expect(TWO_OPTION_CHIP).toBe("🤔 İki Şık Arasında Kaldım");
    expect(TWIN_BUTTON).toBe("🔥 Yanlışın İkiziyle Anında Telafi Et");
    expect(REPORT_BUTTON).toBe("🚩 Soruda Hata Bildir");
    expect(REPORT_REASONS.map((item) => item.label)).toEqual(["Cevap anahtarı hatalı", "Soru kökü eksik", "Görsel-formül bozuk"]);
  });

  it("cevaptan önce bildirimde anahtar ve açıklama gönderilmez", () => {
    const route = read("src/app/api/learning/question-report/route.ts");
    expect(route).toContain("answerShown");
    expect(read("src/components/parity/exam-quiz-play.tsx")).toContain("cp-quiz-report-slot");
  });
});

describe("§3.1 tanıtım turunun soruları", () => {
  const quiz: DemoQuiz[] = [
    { text: "Örnek 1", options: ["a", "b", "c"], correct: ["a"], pairHint: "ipucu", twin: { text: "İkiz 1", options: ["x", "y"], correct: ["x"] } } as unknown as DemoQuiz,
  ];
  it("soru ve ikizi ref ile bulunur; bilinmeyen ref yok", () => {
    expect(demoQuestionByRef(quiz, "q:0")?.text).toBe("Örnek 1");
    expect(demoQuestionByRef(quiz, "twin:0")?.text).toBe("İkiz 1");
    expect(demoQuestionByRef(quiz, "q:5")).toBeNull();
    expect(demoQuestionByRef(quiz, "başka")).toBeNull();
  });

  it("göz atma turu: tanıtım bildirimi yalnız üç yeni nedeni kabul eder, soruyu sunucudan okur", () => {
    const route = read("src/app/api/learning/question-report/demo/route.ts");
    expect(route).toContain('source: "demo"');
    expect(route).toContain("guestLimit");
    const file = readdirSync("supabase/migrations").find((name) => name.endsWith("_question_reports_demo_source.sql"));
    expect(file).toBeTruthy();
    const sql = read(`supabase/migrations/${file}`);
    expect(sql).toContain("'demo'::text");
    // Yalnız eklemeli: satır silen ya da tablo düşüren komut yok.
    expect(sql).not.toMatch(/\b(delete|truncate|drop table|drop column)\b/i);
  });
});

describe("§2 velime WhatsApp'tan ödeme linki", () => {
  it("mesaj harfiyen; adres /veli-odeme/<belirteç>", () => {
    const url = parentPayUrl("ornek-belirtec", "https://example.test/");
    expect(PARENT_PAY_PATH).toBe("/veli-odeme");
    expect(url).toBe("https://example.test/veli-odeme/ornek-belirtec");
    expect(parentShareText({ planName: "Örnek Paket", url })).toBe(
      "Anne/Baba, sınav hazırlığım için kullandığım paketi (Cortex Plus — Örnek Paketi) bu güvenli PayTR bağlantısından şifre girmeden onaylayabilir misin? https://example.test/veli-odeme/ornek-belirtec",
    );
    expect(PARENT_LINK_EXPIRED_TEXT).toBe("Bu ödeme bağlantısının süresi dolmuş, öğrencinizden yeni link isteyebilirsiniz");
    expect(parentLinkValidityLine(48 * 3_600_000, 0)).toBe("Bağlantı 48 saat geçerli.");
  });

  it("e-posta maskeli", () => {
    expect(maskEmail("ornek.kisi@alan.com")).toBe("or***@a***.com");
    expect(maskEmail("a@b.co")).toBe("a***@b***.co");
    expect(maskEmail("gecersiz")).toBeNull();
    expect(maskEmail(null)).toBeNull();
  });

  it("paket adı satıştaki adla aynı; yalnız abonelik paketleri", () => {
    expect(parentLinkPlanName({ name: "Plus", billing_period: "weekly" })).toBe(PLAN_MARKETING_COPY.week.name);
    expect(parentLinkPlanName({ name: "Plus", billing_period: "monthly" })).toBe(PLAN_MARKETING_COPY.plus.name);
    expect(parentLinkPlanName({ name: "Sigma", billing_period: "monthly" })).toBe(PLAN_MARKETING_COPY.sigma.name);
    expect(isParentLinkPlan({ billing_period: "monthly" })).toBe(true);
    expect(isParentLinkPlan({ billing_period: "one_time" })).toBe(false);
  });

  it("düğme /pay ve /fiyatlandirma kartlarının altında; uç ve sayfa yerinde", () => {
    expect(read("src/components/parity/subscription-cards.tsx")).toContain("<ParentWhatsAppLink");
    expect(read("src/lib/payments/parent-whatsapp-copy.ts")).toContain("📲 Velime WhatsApp'tan Ödeme Linki Gönder");
    expect(read("src/app/api/billing/parent-link/route.ts")).toContain("export async function POST");
    const page = read("src/app/veli-odeme/[token]/page.tsx");
    expect(page).toContain("verifyParentPayToken");
    expect(read("src/lib/payments/parent-pay-copy.ts")).toContain("Otomatik yenileme yapılmaz, kartınız saklanmaz");
    expect(read("src/app/api/payments/paytr/callback/route.ts")).toContain("confirmParentLinkPayment");
  });
});

describe("§3.2 Hocanın İkiz Sınavı (20 Soru)", () => {
  it("etiket ve sayı harfiyen; sunucu 20'yi zorlar; hazırlık ve deneme başlangıcında", () => {
    expect(TWIN_EXAM_LABEL).toBe("🎯 Çıkmış Sorulardan Hocanın İkiz Sınavı (20 Soru)");
    expect(TWIN_EXAM_SHORT_LABEL).toBe("Hocanın İkiz Sınavı (20 Soru)");
    expect(TWIN_EXAM_QUESTION_COUNT).toBe(20);
    expect(read("src/app/api/learning/exam-prep/mock-exam/route.ts")).toContain("questionCount: TWIN_EXAM_QUESTION_COUNT");
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain("examPrepTwinExamHref(prepId)");
    expect(read("src/components/parity/mock-exam-setup.tsx")).toContain("TwinExamModeCard");
  });
});

describe("§4.2 eski kota sayıları hiçbir sayfada kalmadı", () => {
  const pages = [
    "src/components/landing/landing-page.tsx",
    "src/lib/marketing/landing-content.ts",
    "src/app/sinav-hazirligi/page.tsx",
    "src/app/ozellikler/page.tsx",
    "src/app/yardim/page.tsx",
    "src/components/marketing/plus-month.tsx",
    "src/lib/billing/tier-presentation.ts",
    "src/lib/legal/texts.ts",
    "src/components/parity/subscription-cards.tsx",
  ];
  it.each(pages)("%s", (path) => {
    const text = read(path);
    for (const phrase of RETIRED_QUOTA_PHRASES) expect(text, phrase).not.toContain(phrase);
  });
});
