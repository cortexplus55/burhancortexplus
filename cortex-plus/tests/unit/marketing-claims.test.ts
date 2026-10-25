import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FEATURES, PROOF } from "@/lib/marketing/landing-content";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { AUTO_RENEW_SUPPORTED } from "@/lib/payments/paytr-capability";
import { tierComparisonRows } from "@/lib/billing/tier-presentation";
import { FREE_LIMITS, isPlusOnlyAction } from "@/lib/billing/free-meters";

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
  "src/components/demo/demo-visual-feast.tsx",
  "src/app/ornek/page.tsx",
  "src/app/kayit/signup-wizard.tsx",
  "src/lib/billing/tier-presentation.ts",
  "src/lib/ai/chat-fallback.ts",
  "src/lib/student/usage-limits.ts",
  // Kredi v3 (24 Ekim 2026): öğrencinin hak ve davet hakkında okuduğu her yer.
  "src/components/parity/referral-reward-card.tsx",
  "src/lib/credits/referral.ts",
  "src/app/krediler/page.tsx",
  "src/components/paywall/credit-gate.tsx",
  "src/lib/billing/free-meters.ts",
  "src/lib/billing/free-reach.ts",
  "src/lib/api/guards.ts",
  "src/lib/solve/solve-run.ts",
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
  // Kredi v3 (24 Ekim 2026). "Sınırsız hazırlık" doğru (hazırlık sayısı); "sınır yok" Plus'ın aylık hakkını yok sayar.
  [/sınır yok/i, "Plus'ın aylık hakkı var (ayda yaklaşık 240 ders); 'Plus'a geçip beklemeden devam edebilirsin' yazın"],
  [/katına|katlan/i, "davet çarpanı kalktı; iki tarafa bir kez 3 ders hediye"],
  [/günlük hak/i, "ücretsiz günlük kredi yok; hak sayaçla: haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf"],
  [
    new RegExp(`günde (?!${FREE_LIMITS.photo}\\b)\\d+ (fotoğraf|foto)`, "i"),
    `ücretsiz hesapta günde ${FREE_LIMITS.photo} fotoğraftan çözüm (FREE_PHOTO_PER_DAY)`,
  ],
  [
    new RegExp(`fotoğraf[^.\\n]{0,120}\\.\\s*Ücretsiz hesapta günde (?!${FREE_LIMITS.photo}\\b)\\d`, "i"),
    `ücretsiz hesapta günde ${FREE_LIMITS.photo} fotoğraftan çözüm (FREE_PHOTO_PER_DAY)`,
  ],
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

  // Kredi v3'ten kalan eski cümleler: yasak listesi bunları gerçekten yakalıyor mu.
  it("yasaklar v3 öncesi cümleleri yakalar, doğru cümlelere dokunmaz", () => {
    const caught = (line: string) => BANNED.some(([pattern]) => pattern.test(line));
    for (const line of [
      "Bugünkü 3 ücretsiz mesajın bitti. Gece yarısı yenilenir; Plus'ta sınır yok.",
      "Arkadaşını davet et, hakkın katlansın",
      "Kaydolduğu anda ikinizin de dönemlik hakkı 3 katına çıkar.",
      "Etiketsizler ücretsiz günlük hakla açılır.",
      "Ücretsiz hesapta günde 3 fotoğraf sorusu çözülür.",
      "Sorunun fotoğrafını çek ya da yaz; adım adım çözüm ve her şıkkın açıklaması. Ücretsiz hesapta günde 3.",
    ]) {
      expect(caught(line), line).toBe(true);
    }
    for (const line of [
      "Belgenin tamamı, sınırsız hazırlık",
      "Haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf",
      "Ücretsiz hesapta haftada 3 ders, günde 3 mesaj ve 1 fotoğraf var.",
      "Arkadaşını davet et, ikinize de 3 ders hediye",
    ]) {
      expect(caught(line), line).toBe(false);
    }
  });

  it("özellikler sayfası ücretsiz sayıları koddan okur", () => {
    const page = read("src/app/ozellikler/page.tsx");
    expect(page).toContain("Ücretsiz hesapta günde ${FREE_PHOTO_PER_DAY}.");
    expect(page).toContain("FREE_TIER_SENTENCE");
    // Kart çarpan alanlarını okumuyor; davet hediyesi tek kaynaktan.
    const card = read("src/components/parity/referral-reward-card.tsx");
    expect(card).not.toMatch(/signupMultiplier|subscribedMultiplier/);
    expect(card).toContain("referralSteps(summary)");
  });

  // Yükseltme kapısı "haftada 3 ders, günde 3 mesaj ve 1 fotoğraf … 3 ders hediye" diye elle yazıyordu.
  it("yükseltme kapısı ücretsiz sayıları ve davet hediyesini koddan okur", () => {
    const sheet = withoutComments(read("src/components/paywall/upgrade-sheet.tsx"));
    expect(sheet).toContain("FREE_TIER_SENTENCE");
    expect(sheet).toContain("REFERRAL_GIFT_LESSONS");
    // Davet edenin hediyesi en çok 3 davetle sınırlı (SQL grant_referral_gift): kapı bunu da söyler.
    expect(sheet).toContain("REFERRAL_MAX_INVITES");
    // Hediyenin koşulu referralPitch ile aynı: arkadaş hesabını doğrulamadan hediye yok.
    expect(sheet).toContain("hesabını doğrulayıp ilk çalışmasını yapınca");
    expect(read("src/lib/credits/referral.ts")).toContain("hesabını doğrulayıp ilk çalışmasını yapınca");
    // Elle yazılmış ücretsiz sayı ya da hediye sayısı yok.
    expect(sheet).not.toMatch(/\b\d+\s+(ders|mesaj|sohbet|fotoğraf|foto)/i);
    expect(sheet).not.toMatch(/(haftada|günde)\s+\d/i);
  });

  it("emekli sayfa ve eski ana sayfa bileşenleri geri gelmedi", () => {
    const config = read("next.config.ts");
    expect(config).toContain(`{ source: "/yaratici-program", destination: "/iletisim", permanent: true }`);
    expect(read("src/app/sitemap.ts")).not.toContain("/yaratici-program");
  });
});

describe("ana sayfanın sayıları koddan", () => {
  const text = [...FAQ.map((item) => `${item.q} ${item.a}`), ...PROOF.map((item) => item.body)].join("\n");

  // 24 Ekim 2026: ücretsiz hesap sayaçla — haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf (göç 20261024121000).
  it("ücretsiz hak: haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf; SQL ve kopya aynı", () => {
    expect(FREE_LIMITS).toMatchObject({ lesson: 3, chat: 3, photo: 1 });
    const sql = read("supabase/migrations/20261024121000_free_tier_counts.sql");
    expect(sql).toContain(`WHEN 'lesson' THEN ${FREE_LIMITS.lesson}`);
    expect(sql).toContain(`WHEN 'chat' THEN ${FREE_LIMITS.chat}`);
    expect(sql).toContain(`WHEN 'photo' THEN ${FREE_LIMITS.photo}`);
    // Ücretsiz günlük kredi 0: credit_reserve'ün son hâli ayrı göçte (20261024123000).
    expect(read("supabase/migrations/20261024123000_free_daily_zero.sql")).toContain("v_allowance := 0;");
    expect(text).toContain("haftada 3 ders (testleri ve kartlarıyla), günde 3 sohbet mesajı ve günde 1 fotoğraftan soru çözümü");
    expect(text).toContain("haftada 3 ders, günde 3 mesaj");
    expect(text).not.toContain("günde bir ders");
  });

  it("Plus etiketi: ücretsiz hesapta açılmayan işler (açık liste)", () => {
    const plusOnly = new Set(FEATURES.filter((feature) => feature.plusOnly).map((feature) => feature.title));
    for (const [title, code] of [
      ["Podcast", "PODCAST_GENERATE"],
      ["Sözlü deneme", "ORAL_EXAM_GENERATE"],
      ["Yazılı deneme", "PRACTICE_EXAM_GENERATE"],
      ["Video ders", "VIDEO_GENERATE"],
    ] as const) {
      expect(isPlusOnlyAction(code), title).toBe(true);
      expect(plusOnly.has(title), title).toBe(true);
    }
    for (const title of ["Ders", "Konu testi", "Kartlar ve tekrar", "Doğru / Yanlış"]) {
      expect(plusOnly.has(title), title).toBe(false);
    }
  });

  it("Plus hakkı fiyat tablosuyla aynı", () => {
    const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
    // Kredi v3 (24 Ekim 2026): ders 30 kredi, mesaj 3.
    expect(plus).toEqual({ messages: 2400, lessons: 240 });
    expect(text).toContain("Ayda yaklaşık 2.400 mesaj ya da 240 ders");
    expect(text).not.toContain("1.200 ders");
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
