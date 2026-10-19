import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FEATURES, PROOF } from "@/lib/marketing/landing-content";
import { CREDIT_PRICE_TABLE, PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { AUTO_RENEW_SUPPORTED } from "@/lib/payments/paytr-capability";
import { tierComparisonRows } from "@/lib/billing/tier-presentation";

/*
  19 Ekim 2026, ürün sahibi: "misafire sistemimizde olmayan bir şey gösteriyor muyuz, yalan vaat var
  mı?" Vardı: saatli günlük plan ("09:00 Matematik"), "Net 28.4" deneme analizi, Plus'ta "gelişmiş
  model" ve "öncelikli destek", okul lisansı ve okul raporları, veliden ödeme isteği (alıcısı emekli
  veli paneliydi), "her işlem öncesi kredi gösterilir", Limitler'de hiç verilmeyen "zor soruda güçlü
  model". Bu test o cümlelerin geri gelmesini ve sayıların koddan kopmasını tutar.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
/** Yorumlar taranmaz: gerekçe yazarken eski cümleyi anmak serbest. */
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SURFACES = [
  "src/lib/marketing/landing-content.ts",
  "src/components/landing/landing-page.tsx",
  "src/app/page.tsx",
  "src/app/ozellikler/page.tsx",
  "src/app/fiyatlandirma/page.tsx",
  "src/app/sinav-hazirligi/page.tsx",
  "src/app/yardim/page.tsx",
  "src/app/hakkimizda/page.tsx",
  "src/app/mobil-uygulama/page.tsx",
  "src/app/iletisim/page.tsx",
  "src/app/layout.tsx",
  "src/app/opengraph-image.tsx",
  "src/app/ayarlar/page.tsx",
  "src/app/soru-coz/page.tsx",
  "src/components/marketing/premium-plan-hero.tsx",
  "src/components/marketing/plus-month.tsx",
  "src/lib/billing/plan-value.ts",
  "src/components/paywall/upgrade-sheet.tsx",
  "src/components/layout/signup-premium-shell.tsx",
  "src/components/layout/premium-auth-shell.tsx",
  "src/components/parity/subscription-cards.tsx",
  "src/components/chat/chat-panel.tsx",
  "src/components/demo/demo-walkthrough.tsx",
  "src/lib/billing/tier-presentation.ts",
  "src/lib/ai/chat-fallback.ts",
  "src/lib/student/usage-limits.ts",
];

const BANNED: [RegExp, string][] = [
  [/gelişmiş model/i, "her plan aynı modeli kullanıyor (model-router.ts)"],
  [/güçlü model/i, "model yükseltmesi hiç verilmiyor"],
  [/öncelikli destek/i, "destek sözü herkese aynı: 24 saat"],
  [/\bNet \d/, "net (doğru − yanlış/4) hesabı yok"],
  [/\d\d:\d\d (Matematik|Geometri|Fizik)/, "saatli günlük plan yok"],
  [/veline ödeme isteği|ebeveynden ödeme iste/i, "veli ödeme isteğinin alıcısı yok"],
  [/okul lisansı|kota kurumdan/i, "okul lisansı yok, ürün öğrenci-only"],
  [/kredi bedeli işlemden önce|harcanacak kredi gösterilir/i, "öğrenci kredi sayısı görmez"],
  [/interaktif problem/i, "simülasyonlar kaldırıldı"],
  [/kişisel çalışma planı|çalışma planı ve ilerleme/i, "çalışma planı ekranı emekli"],
];

describe("yasak vaatler", () => {
  for (const path of SURFACES) {
    it(path, () => {
      const source = withoutComments(read(path));
      for (const [pattern, why] of BANNED) {
        expect(source, `${path}: ${pattern} — ${why}`).not.toMatch(pattern);
      }
    });
  }

  it("emekli sayfa ve eski ana sayfa bileşenleri geri gelmedi", () => {
    const config = read("next.config.ts");
    expect(config).toContain(`{ source: "/yaratici-program", destination: "/iletisim", permanent: true }`);
    expect(read("src/app/sitemap.ts")).not.toContain("/yaratici-program");
  });
});

describe("ana sayfanın sayıları koddan", () => {
  const FREE_DAILY = 6; // göç 20261008120000: v_allowance := 6
  const text = [...FAQ.map((item) => `${item.q} ${item.a}`), ...PROOF.map((item) => item.body)].join("\n");

  it("ücretsiz günlük hak: bir ders, bir test ya da iki mesaj", () => {
    expect(CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits).toBeLessThanOrEqual(FREE_DAILY);
    expect(CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits).toBeLessThanOrEqual(FREE_DAILY);
    expect(CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits * 2).toBeLessThanOrEqual(FREE_DAILY);
    expect(text).toContain("günde bir ders, bir test ya da iki sohbet mesajı");
    expect(read("supabase/migrations/20261008120000_credit_system_v2.sql")).toContain("v_allowance := 6;");
  });

  it("Plus etiketi: günlük haktan büyük işler", () => {
    const plusOnly = new Set(FEATURES.filter((feature) => feature.plusOnly).map((feature) => feature.title));
    for (const [title, code] of [
      ["Podcast", "PODCAST_GENERATE"],
      ["Sözlü deneme", "ORAL_EXAM_GENERATE"],
      ["Yazılı deneme", "PRACTICE_EXAM_GENERATE"],
      ["Video ders", "VIDEO_GENERATE"],
    ] as const) {
      expect(CREDIT_PRICE_TABLE[code].credits, title).toBeGreaterThan(FREE_DAILY);
      expect(plusOnly.has(title), title).toBe(true);
    }
    for (const title of ["Ders", "Konu testi", "Kartlar ve tekrar", "Doğru / Yanlış"]) {
      expect(plusOnly.has(title), title).toBe(false);
    }
  });

  it("Plus hakkı fiyat tablosuyla aynı", () => {
    const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
    expect(plus).toEqual({ messages: 2400, lessons: 1200 });
    expect(text).toContain("1.200 ders ya da 2.400 mesaj");
  });

  it("otomatik yenileme sözü verilmiyor", () => {
    expect(AUTO_RENEW_SUPPORTED).toBe(false);
    expect(text).toMatch(/kendiliğinden yenilenmez/);
  });

  it("karşılaştırma tablosunda model satırı yok, hız satırı var", () => {
    const labels = tierComparisonRows().map((row) => row.label);
    expect(labels).not.toContain("Model");
    expect(labels).toContain("Hazır içerik yokken yazım");
    expect(labels).toContain("Podcast, sözlü ve yazılı deneme");
  });

  it("SSS: her soru soru, her cevap gerçek bir cevap", () => {
    for (const item of FAQ) {
      expect(item.q.trim().endsWith("?")).toBe(true);
      expect(item.a.trim().length).toBeGreaterThan(60);
    }
  });
});
