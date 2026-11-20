import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FREE_PLAN_POINTS, PLUS_PLAN_POINTS, TRUST_LINE } from "@/lib/marketing/landing-content";
import { allFarkAccordionCopy } from "@/lib/marketing/fark-accordion";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";
import { PLAN_ALLOWANCES, allowanceInWork, planWorkEquivalent } from "@/lib/credits/price-table";
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
  // 7 Kasım 2026: hedef kitle sekmeleri ve kayıtsız vitrin de misafire gösterilen söz.
  "src/lib/marketing/landing-showcase.ts",
  "src/components/landing/audience-hero.tsx",
  // Faz 9 (20 Kasım 2026): kahramanın tek seçicisi.
  "src/components/landing/audience-picker.tsx",
  // 11 Kasım 2026: 7 adımlı tanıtım turu vitrinin yerini aldı.
  "src/lib/marketing/landing-journey.ts",
  "src/components/landing/futuristic-guided-journey.tsx",
  // Faz 9.1 (20 Kasım 2026): birinci adımın ders çekirdeği (örnek not, sınav günü, doğan ders ve küçük yol).
  "src/components/landing/lesson-core.tsx",
  // Turun ürün ekranlarında gösterilen örnek veri de misafire gösterilen sözdür.
  "src/lib/demo/guest-tour.ts",
  // Faz 7 (20 Kasım 2026): turun dört branşı (örnek not, yol, uyarı, ders, soru, kart, önerme, sahne).
  "src/lib/marketing/guest-demo-tracks.ts",
  "src/lib/demo/guest-tour-tracks.ts",
  "src/lib/demo/guest-tracks/muhendislik.ts",
  "src/lib/demo/guest-tracks/tus.ts",
  "src/lib/demo/guest-tracks/hukuk.ts",
  "src/components/landing/tour/product-screens.tsx",
  // 11 Kasım 2026, kokpit: karşılaştırma düellosu, Plus önizlemeleri ve misafirin dosya kartları.
  "src/components/landing/landing-duel.tsx",
  "src/components/landing/tour/plus-previews.tsx",
  "src/components/parity/guest-document-offer.tsx",
  "src/lib/documents/guest-handoff.ts",
  "src/components/parity/first-step-launcher.tsx",
  "src/lib/student/first-step.ts",
  "src/lib/marketing/advantage-content.ts",
  "src/components/marketing/advantage-sections.tsx",
  // 20 Kasım 2026 (Faz 7): fark vitrini (radyo, kırmızı kalem, sınıfla paylaş + QR'lı kâğıt).
  "src/lib/marketing/fark-vitrini.ts",
  "src/components/landing/fark-vitrini.tsx",
  "src/components/landing/fark-vitrini-radio.tsx",
  "src/components/landing/fark-vitrini-red-pen.tsx",
  "src/components/landing/fark-vitrini-parts.tsx",
  // 20 Kasım 2026 (Faz 9): "Aynı not, iki ayrı sonuç" akordeonu ve sahneleri.
  "src/lib/marketing/fark-accordion.ts",
  "src/components/landing/fark-accordion.tsx",
  "src/components/landing/fark-scenes.tsx",
  "src/components/landing/fark-twin-scene.tsx",
  "src/app/page.tsx",
  "src/app/ozellikler/page.tsx",
  "src/app/fiyatlandirma/page.tsx",
  "src/app/sinav-hazirligi/page.tsx",
  "src/app/yardim/page.tsx",
  "src/app/hakkimizda/page.tsx",
  "src/app/mobil-uygulama/page.tsx",
  "src/app/iletisim/page.tsx",
  "src/app/layout.tsx",
  "src/app/opengraph-image.alt.txt",
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
  [/sınır yok/i, "Plus'ın aylık hakkı var (ayda yaklaşık 200 ders); 'Plus'a geçip beklemeden devam edebilirsin' yazın"],
  [/katına|katlan/i, "davet çarpanı kalktı; iki tarafa bir kez 3 ders hediye"],
  [/günlük hak/i, "ücretsiz günlük kredi yok; hak sayaçla: ilk ders, günde 3 mesaj, ayda 7 fotoğraf"],
  // Faz 4: fotoğraf hakkı aylık (ayda 7). "Günde N fotoğraf" artık her N için yanlış; aylık sayı sabitten.
  [/günde \d+ (fotoğraf|foto)/i, `ücretsiz hesapta ayda ${FREE_LIMITS.photo} fotoğraftan çözüm (FREE_PHOTO_PER_MONTH)`],
  [
    new RegExp(`ayda (?!${FREE_LIMITS.photo}\\b)\\d+ (fotoğraf|foto)`, "i"),
    `ücretsiz hesapta ayda ${FREE_LIMITS.photo} fotoğraftan çözüm (FREE_PHOTO_PER_MONTH)`,
  ],
  [
    /fotoğraf[^.\n]{0,120}\.\s*Ücretsiz hesapta günde \d/i,
    `ücretsiz hesapta ayda ${FREE_LIMITS.photo} fotoğraftan çözüm (FREE_PHOTO_PER_MONTH)`,
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
      // Faz 4 öncesi doğru cümleler: fotoğraf artık aylık.
      "Haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf",
      "Ücretsiz hesapta ayda 3 fotoğraf sorusu çözülür.",
    ]) {
      expect(caught(line), line).toBe(true);
    }
    for (const line of [
      "Belgenin tamamı, sınırsız hazırlık",
      `İlk ders, günde 3 mesaj, ayda ${FREE_LIMITS.photo} fotoğraf`,
      "Arkadaşını davet et, ikinize de 3 ders hediye",
    ]) {
      expect(caught(line), line).toBe(false);
    }
  });

  it("özellikler sayfası ücretsiz sayıları koddan okur", () => {
    const page = read("src/app/ozellikler/page.tsx");
    expect(page).toContain("Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH}.");
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
  // 11 Kasım 2026: kanıt şeridi ve özellik ızgarası kalktı; sayılar SSS, plan kartları ve güven satırında.
  // Faz 9 (20 Kasım 2026): SSS beş soruya indi, güven satırı tek satır; Plus'ın aylık karşılığı Plus kartında
  // (`plus.periodLine`, sayfa aynen basar), fark akordeonunun metni de taranır.
  const text = [
    ...FAQ.map((item) => `${item.q} ${item.a}`),
    ...FREE_PLAN_POINTS,
    ...PLUS_PLAN_POINTS,
    ...TRUST_LINE,
    PLAN_MARKETING_COPY.plus.periodLine,
    allFarkAccordionCopy(),
  ].join("\n");

  it("Plus kartı aylık karşılığı sayfaya aynen basar", () => {
    expect(withoutComments(read("src/components/landing/landing-page.tsx"))).toContain("{plus.periodLine}; bütün konular açık.");
  });

  // 24 Ekim 2026: ücretsiz hesap sayaçla — günde 3 mesaj, günde 1 fotoğraf (göç 20261024121000). 11 Kasım 2026
  // akşamı (ürün sahibinin kararı): haftalık 3 ders hakkı kalktı, ücretsiz hesap = tek ders (göç 20261111180000:
  // `free_meter_limit('lesson')` 0; SQL'in son tanımı o dosyada).
  // Faz 4 (19 Kasım 2026): fotoğraf ayda 7, ücretsiz "Farklı anlat" 10; son tanım 20261119120000_faz4_credit_economy.
  it("ücretsiz hak: ilk ders, günde 3 mesaj, ayda 7 fotoğraf; SQL ve kopya aynı", () => {
    expect(FREE_LIMITS).toMatchObject({ lesson: 0, chat: 3, photo: 7, included: 40, reexplain: 10 });
    const sql = read("supabase/migrations/20261119120000_faz4_credit_economy.sql");
    expect(sql).toContain(`WHEN 'lesson' THEN ${FREE_LIMITS.lesson}`);
    expect(sql).toContain(`WHEN 'chat' THEN ${FREE_LIMITS.chat}`);
    expect(sql).toContain(`WHEN 'photo' THEN ${FREE_LIMITS.photo}`);
    expect(sql).toContain(`WHEN 'included' THEN ${FREE_LIMITS.included}`);
    expect(sql).toContain(`WHEN 'reexplain' THEN ${FREE_LIMITS.reexplain}`);
    // Sonraki hiçbir göç sınırı yeniden tanımlamıyor: son söz bu dosyada.
    const later = readdirSync("supabase/migrations").filter((name) => name > "20261119120000_faz4_credit_economy.sql");
    for (const name of later) expect(read(`supabase/migrations/${name}`), name).not.toMatch(/FUNCTION public[.]free_meter_limit/);
    // Ücretsiz günlük kredi 0: credit_reserve'ün son hâli ayrı göçte (20261024123000).
    expect(read("supabase/migrations/20261024123000_free_daily_zero.sql")).toContain("v_allowance := 0;");
    // 11 Kasım 2026 (ürün sahibinin kararı): ilk dersin döngüsü süreye takılmaz; aynı akşam haftalık ders hakkı kalktı.
    expect(text).toContain("ilk hazırlığında ilk dersin (konu anlatımı, kartlar, doğru/yanlış ve konu testi) süre sınırı olmadan açık; ayrıca günde 3 sohbet mesajı ve ayda 7 fotoğraftan soru çözümü");
    expect(text).not.toMatch(/haftada [0-9]+ ders|haftalık ders hakkı/);
    expect(text).not.toContain("günde bir ders");
  });

  it("Plus etiketi: ücretsiz hesapta açılmayan işler (açık liste)", () => {
    // Plus sütunu yalnız ücretsizde kapalı işleri sayar; ücretsiz sütunda bunların hiçbiri geçmez.
    const plusColumn = PLUS_PLAN_POINTS.join(" ").toLocaleLowerCase("tr");
    const freeColumn = FREE_PLAN_POINTS.join(" ").toLocaleLowerCase("tr");
    for (const [word, code] of [
      ["podcast", "PODCAST_GENERATE"],
      ["sözlü deneme", "ORAL_EXAM_GENERATE"],
      ["yazılı deneme", "PRACTICE_EXAM_GENERATE"],
      ["video", "VIDEO_GENERATE"],
    ] as const) {
      expect(isPlusOnlyAction(code), word).toBe(true);
      expect(plusColumn, word).toContain(word);
      expect(freeColumn, word).not.toContain(word);
    }
    for (const word of ["konu anlatımı", "kartlar", "doğru/yanlış", "konu testi"]) {
      expect(freeColumn, word).toContain(word);
      expect(plusColumn, word).not.toContain(word);
    }
  });

  it("Plus hakkı fiyat tablosuyla aynı", () => {
    // Faz 4 (19 Kasım 2026): 4.350 kredi; ders 22, test 14, mesaj 1. Plan satırı ~5'e yuvarlanmış ders.
    expect(allowanceInWork(PLAN_ALLOWANCES.plusMonthly)).toEqual({ messages: 4350, lessons: 197 });
    expect(planWorkEquivalent(PLAN_ALLOWANCES.plusMonthly)).toEqual({ lessons: 200, tests: 310, chats: 4350 });
    expect(text).toContain("Ayda ~200 ders / 310 test / 4.350 sohbet");
    expect(text).not.toContain("240 ders");
  });

  it("otomatik yenileme sözü verilmiyor", () => {
    expect(AUTO_RENEW_SUPPORTED).toBe(false);
    expect(text).toMatch(/Otomatik yenileme yok/);
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
