import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
  GEO (27 Kasım 2026): yapay zekâ aramalarının siteyi hatasız taraması, doğru sınıflandırması ve kaynak göstermesi.
  Bekçiler: robots.txt (adıyla anılan yapay zekâ tarayıcıları açık, özel yollar kapalı), /llms.txt (200, düz metin, tam
  ve kırık olmayan adresler, canlı fiyat), "cevap önce" SSS, tek @graph yapılandırılmış veri, ürünün tanımı.
  Sunucu HTML'inin kendisi (ilk 100 kelime, JSON.parse, kanonik) e2e `geo-ai-search.spec.ts`'te.
*/

const supabase = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>> | null,
  fail: false,
}));

vi.mock("@/lib/supabase/public-read", () => ({
  createPublicReadClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () =>
          supabase.fail
            ? Promise.resolve({ data: null, error: { message: "bağlantı yok" } })
            : Promise.resolve({ data: supabase.rows, error: null }),
      };
      return query;
    },
  }),
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GET as llmsGet } from "@/app/llms.txt/route";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { JsonLd } from "@/components/seo/json-ld";
import { storeOffersFromPlans } from "@/lib/billing/store-products";
import { CURRICULUM_LEVELS } from "@/lib/learning/exam-catalog";
import { ANSWER_FAQ, PRICING_FAQ } from "@/lib/marketing/answer-faq";
import { EXAM_LANDING_LIST } from "@/lib/marketing/exam-landings";
import { RENEWAL_FAQ } from "@/lib/marketing/landing-content";
import { PRODUCT_AUDIENCE, PRODUCT_DEFINITION, PRODUCT_SUMMARY } from "@/lib/marketing/product-definition";
import { AI_SEARCH_CRAWLERS, isCrawlBlocked, ROBOTS_DISALLOW } from "@/lib/seo/crawl-rules";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { REALTIME_FREE_TRIAL_ENABLED, REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";
import {
  faqPageJsonLd,
  jsonLdGraph,
  organizationJsonLd,
  socialProfileUrls,
  softwareApplicationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const LIVE_ROWS = [
  { slug: "plus-haftalik", price_try: 34900, description: null, active: true },
  { slug: "plus-aylik", price_try: 59900, description: null, active: true },
  { slug: "sigma-aylik", price_try: 199900, description: null, active: true },
];

const REQUIRED_PAGES = ["/", "/ozellikler", "/fiyatlandirma", "/mufredat", "/ornek", "/gizlilik", "/kullanim-kosullari", "/kvkk", "/hesap-silme"];

/** Cümle sayısı: nokta, soru ya da ünlem ve ardından boşluk + büyük harf (ya da metnin sonu). */
function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/u)
    .filter(Boolean);
}

afterEach(() => {
  supabase.rows = [];
  supabase.fail = false;
  vi.unstubAllEnvs();
});

describe("robots.txt: yapay zekâ tarayıcıları", () => {
  const result = robots();
  const groups = Array.isArray(result.rules) ? result.rules : [result.rules];

  it("dokuz tarayıcı adıyla kendi grubunda: açık izin ve bütün özel yollar kapalı", () => {
    expect([...AI_SEARCH_CRAWLERS]).toEqual([
      "OAI-SearchBot",
      "ChatGPT-User",
      "GPTBot",
      "PerplexityBot",
      "ClaudeBot",
      "Claude-SearchBot",
      "Googlebot",
      "Google-Extended",
      "Applebot",
    ]);
    const ai = groups.find((group) => Array.isArray(group.userAgent))!;
    expect(ai.userAgent).toEqual([...AI_SEARCH_CRAWLERS]);
    expect(ai.allow).toBe("/");
    expect(ai.disallow).toEqual([...ROBOTS_DISALLOW]);
  });

  it("öbür tarayıcılar (`*`) aynı kuralları görür; özel yolların hepsi kapalı; harita satırı tam adres", () => {
    const star = groups.find((group) => group.userAgent === "*")!;
    expect(star.allow).toBe("/");
    expect(star.disallow).toEqual([...ROBOTS_DISALLOW]);
    for (const path of ["/admin", "/api/", "/pay", "/ayarlar", "/ogretmen", "/giris", "/kayit"]) {
      expect(ROBOTS_DISALLOW as readonly string[], path).toContain(path);
    }
    expect(result.sitemap).toBe("https://cortexplus.app/sitemap.xml");
  });

  it("önek eşleşmesi: kayıt bağlantısının hâlleri ve uçlar kapalı; herkese açık sayfalar açık", () => {
    for (const path of ["/kayit", "/kayit?hedef=lise", "/giris", "/ogretmen", "/api/ai/chat", "/admin/kokpit", "/pay"]) {
      expect(isCrawlBlocked(path.split("?")[0]!), path).toBe(true);
    }
    for (const path of ["/", "/ozellikler", "/fiyatlandirma", "/mufredat", "/ornek", "/llms.txt", "/hesap-silme"]) {
      expect(isCrawlBlocked(path), path).toBe(false);
    }
  });

  it("site haritasında ve sayfa listesinde robots'un kapattığı adres yok (giriş ve kayıt çıktı)", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(paths.filter((path) => isCrawlBlocked(path))).toEqual([]);
    expect(paths).not.toContain("/giris");
    expect(paths).not.toContain("/kayit");
    expect(PUBLIC_PAGES.filter((page) => isCrawlBlocked(page.path || "/"))).toEqual([]);
  });
});

describe("ürünün tanımı", () => {
  it("iki cümle: ne olduğu ve kimler için; sınav adları kurulumun sınav listesiyle aynı", () => {
    expect(sentences(PRODUCT_DEFINITION)).toHaveLength(1);
    expect(sentences(PRODUCT_AUDIENCE)).toHaveLength(1);
    expect(PRODUCT_DEFINITION.startsWith("Cortex Plus, ")).toBe(true);
    expect(PRODUCT_SUMMARY).toBe(`${PRODUCT_DEFINITION} ${PRODUCT_AUDIENCE}`);
    const exams = CURRICULUM_LEVELS.flatMap((level) => (level.examType ? [level.examType] : []));
    for (const exam of exams) {
      const name = exam === "TYT" || exam === "AYT" ? "YKS" : exam;
      expect(PRODUCT_AUDIENCE, exam).toContain(name);
    }
  });

  it("beş sayfanın girişinde, sunucuda çizilen metinde (gizli değil)", () => {
    const sources = [
      "src/components/landing/audience-hero.tsx",
      "src/app/ozellikler/page.tsx",
      "src/app/mufredat/page.tsx",
      "src/components/demo/demo-walkthrough.tsx",
    ];
    for (const file of sources) {
      const source = read(file);
      expect(source, file).toContain("{PRODUCT_SUMMARY}");
      expect(source, file).toContain("data-product-definition");
      expect(source, file).not.toMatch(/sr-only[^>]*data-product-definition|data-product-definition[^>]*hidden/);
    }
    expect(read("src/app/fiyatlandirma/page.tsx")).toContain("description={PRODUCT_SUMMARY}");
  });
});

describe("cevap önce SSS", () => {
  it("dört soru; her cevap ilk cümlede cevaplar, en çok üç cümle, abartı ve rakip adı yok", () => {
    expect(ANSWER_FAQ.map((item) => item.q)).toEqual([
      "Cortex Plus nedir ve kendi ders notlarımdan nasıl çalışma yolu çıkarır?",
      "Hangi sınavlar ve seviyeler için uygundur?",
      "Canlı sesli öğretmen ve çift kontrollü soru üretimi nasıl çalışır?",
      "Kredi kartı olmadan nasıl denenir ve veli ödeme linki nasıl kullanılır?",
    ]);
    for (const item of ANSWER_FAQ) {
      const parts = sentences(item.a);
      expect(parts.length, item.q).toBeGreaterThanOrEqual(1);
      expect(parts.length, item.q).toBeLessThanOrEqual(3);
      expect(item.a, item.q).not.toMatch(/%100|en iyi|bir numara|garanti|kesin başarı|Astra/i);
    }
    // Birinci cevap tanımın kendisiyle başlar: tek başına alıntılanınca anlamlı.
    expect(ANSWER_FAQ[0]!.a.startsWith(PRODUCT_DEFINITION)).toBe(true);
  });

  it("sınav sorusu kurulumun sınav listesini ve şık kuralını söyler", () => {
    const answer = ANSWER_FAQ[1]!.a;
    const exams = CURRICULUM_LEVELS.flatMap((level) => (level.examType ? [level.examType] : []));
    for (const exam of exams) expect(answer, exam).toContain(exam);
    expect(answer).toContain("4 şıklı");
    expect(answer).toContain("5 şıklı");
  });

  it("canlı sesli öğretmen: SSS ve /llms.txt kodun erişim kuralıyla aynı (Sınav Haftası, Plus, Sigma; ücretsizde yok)", () => {
    // 27 Kasım 2026 (Burhan): yeni öğretmen ekranı herkese açıldı, canlı ses ücretli planlarda; ücretsiz deneme kapalı.
    expect(REALTIME_FREE_TRIAL_ENABLED).toBe(false);
    const item = ANSWER_FAQ[2]!;
    expect(item.a.startsWith("Canlı sesli öğretmen Sınav Haftası, Plus ve Sigma'da açık")).toBe(true);
    expect(item.a).not.toMatch(/ücretsiz/i);
    expect(REFUSAL_MESSAGE.plus_required).toContain("Sınav Haftası, Plus ve Sigma");
    const llms = buildLlmsTxt([]);
    expect(llms).toContain("Sınav Haftası, Plus ve Sigma'da öğretmenle canlı sesli ders yaparsın");
  });

  it("fiyat sayfası: dört soru ve ana sayfanın yenileme sorusu (aynı metin)", () => {
    expect(PRICING_FAQ).toEqual([...ANSWER_FAQ, RENEWAL_FAQ]);
    expect(read("src/lib/marketing/landing-content.ts")).toMatch(/export const FAQ: FaqItem\[\] = \[[\s\S]*RENEWAL_FAQ,\n\];/);
  });

  it("cevaplar ilk HTML'de (<details> içinde); FAQPage verisi sayfada görünen dizinin aynısı", () => {
    const html = renderToStaticMarkup(<AnswerFaqSection id="t" title="Sık sorulanlar" items={PRICING_FAQ} />);
    expect(html.match(/<details/g)).toHaveLength(PRICING_FAQ.length);
    for (const item of PRICING_FAQ) {
      expect(html).toContain(item.a.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"));
    }
    for (const [file, list] of [
      ["src/app/ozellikler/page.tsx", "ANSWER_FAQ"],
      ["src/app/fiyatlandirma/page.tsx", "PRICING_FAQ"],
    ] as const) {
      const source = read(file).replace(/\s+/g, " ");
      expect(source, file).toContain(`items={${list}}`);
      expect(source, file).toContain(`${list}.map((item) => ({ question: item.q, answer: item.a }))`);
    }
  });
});

describe("yapılandırılmış veri: tek @graph", () => {
  it("uygulama: eğitim kategorisi, platformlar, Türkçe; teklifler veritabanındaki fiyattan; puan ve yorum yok", () => {
    const app = softwareApplicationJsonLd(storeOffersFromPlans(LIVE_ROWS)) as unknown as Record<string, unknown> & {
      offers: Array<Record<string, unknown> & { priceSpecification?: Record<string, unknown> }>;
    };
    expect(app).toMatchObject({
      "@type": "SoftwareApplication",
      "@id": "https://cortexplus.app/#uygulama",
      name: "Cortex Plus",
      url: "https://cortexplus.app",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, iOS, Android",
      inLanguage: "tr-TR",
      description: PRODUCT_SUMMARY,
    });
    expect(app.offers.map((offer) => [offer.name, offer.price, offer.priceCurrency])).toEqual([
      ["Ücretsiz", "0", "TRY"],
      ["Sınav Haftası", "349.00", "TRY"],
      ["Plus", "599.00", "TRY"],
      ["Sigma", "1999.00", "TRY"],
    ]);
    expect(app.offers[1]!.priceSpecification).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: "349.00",
      referenceQuantity: { "@type": "QuantitativeValue", value: 7, unitCode: "DAY" },
    });
    for (const key of ["aggregateRating", "review"]) expect(app).not.toHaveProperty(key);
    // Fiyat okunamazsa uydurulmaz: yalnız ücretsiz hesap.
    const empty = softwareApplicationJsonLd(storeOffersFromPlans(null)) as unknown as { offers: Array<{ name: string }> };
    expect(empty.offers.map((offer) => offer.name)).toEqual(["Ücretsiz"]);
    // Kaynakta sabit fiyat yok.
    expect(read("src/lib/seo/structured-data.ts")).not.toMatch(/\b(349|599|1999)\b/);
  });

  it("tek betik, @context bir kez, düğümler @id ile bağlı ve kimlikler tekil", () => {
    const html = renderToStaticMarkup(
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd([]),
          webPageJsonLd({ name: "Ana sayfa", description: "x", path: "/", about: "software" }),
          faqPageJsonLd([{ question: "S", answer: "C" }], "/"),
        ]}
      />,
    );
    expect(html.match(/<script/g)).toHaveLength(1);
    const root = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
      "@context": string;
      "@graph": Array<Record<string, unknown>>;
    };
    expect(root["@context"]).toBe("https://schema.org");
    const graph = root["@graph"];
    expect(graph.map((node) => node["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication", "WebPage", "FAQPage"]);
    const ids = graph.map((node) => node["@id"]);
    expect(new Set(ids).size).toBe(ids.length);
    const page = graph[3]!;
    expect(page.isPartOf).toEqual({ "@id": "https://cortexplus.app/#site" });
    expect(page.about).toEqual({ "@id": "https://cortexplus.app/#uygulama" });
    expect(graph[1]!.publisher).toEqual({ "@id": "https://cortexplus.app/#kurum" });
    expect(jsonLdGraph([{ "@context": "https://schema.org", "@type": "X" }])["@graph"][0]).toEqual({ "@type": "X" });
  });

  it("kurumun sosyal profilleri isteğe bağlı: yalnız geçerli https adresleri, boşsa sameAs yok", () => {
    expect(socialProfileUrls("")).toEqual([]);
    expect(socialProfileUrls("https://instagram.com/x, http://eski.example, javascript:alert(1)  https://instagram.com/x https://youtube.com/@y")).toEqual([
      "https://instagram.com/x",
      "https://youtube.com/@y",
    ]);
    vi.stubEnv("SOCIAL_PROFILE_URLS", "");
    expect(organizationJsonLd()).not.toHaveProperty("sameAs");
    vi.stubEnv("SOCIAL_PROFILE_URLS", "https://instagram.com/cortex");
    expect(organizationJsonLd().sameAs).toEqual(["https://instagram.com/cortex"]);
  });

  it("dört sayfa grafiği kurum ve siteyle başlar; müfredat sayfaları gezinme yolunu korur", () => {
    for (const file of ["src/app/page.tsx", "src/app/ozellikler/page.tsx", "src/app/fiyatlandirma/page.tsx", "src/app/mufredat/page.tsx", "src/app/ornek/page.tsx"]) {
      const source = read(file).replace(/\s+/g, " ");
      expect(source, file).toContain("organizationJsonLd(), websiteJsonLd(),");
    }
    for (const file of ["src/app/mufredat/[programId]/page.tsx", "src/app/mufredat/[programId]/[unitId]/page.tsx", "src/app/mufredat/[programId]/[unitId]/[outcomeId]/page.tsx"]) {
      expect(read(file), file).toContain("breadcrumbJsonLd(");
    }
  });
});

describe("/llms.txt", () => {
  it("200, düz metin; tanım, kitle, altı özellik, canlı paket adları ve fiyatları, bütün kanonik sayfalar", async () => {
    supabase.rows = LIVE_ROWS;
    const response = await llmsGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    expect(text.startsWith("# Cortex Plus\n")).toBe(true);
    expect(text).toContain(`> ${PRODUCT_DEFINITION} ${PRODUCT_AUDIENCE}`);
    const features = text.split("## Temel özellikler")[1]!.split("## Paketler")[0]!.match(/^- /gm);
    expect(features).toHaveLength(6);
    expect(text).toContain("- Sınav Haftası: ₺349 / 7 gün");
    expect(text).toContain("- Plus: ₺599 / ay");
    expect(text).toContain("- Sigma: ₺1.999 / ay");
    expect(text).toContain("- Ücretsiz: kart istenmez;");
    for (const path of REQUIRED_PAGES) {
      const url = path === "/" ? "https://cortexplus.app)" : `https://cortexplus.app${path})`;
      expect(text, path).toContain(url);
    }
  });

  it("bağlantıların hepsi dolu, tam ve kapalı olmayan adres; boş satır başı yok", () => {
    const text = buildLlmsTxt(storeOffersFromPlans(LIVE_ROWS));
    const links = [...text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)];
    // Sayfalar listesi + sınavlara göre hazırlık bölümü (27 Kasım 2026, sınav açılış sayfaları).
    expect(links.length).toBe(PUBLIC_PAGES.length + EXAM_LANDING_LIST.length);
    for (const [, label, url] of links) {
      expect(label!.trim(), url).not.toBe("");
      expect(url).toMatch(/^https:\/\/cortexplus\.app(\/[a-z0-9-]+)*$/);
      expect(isCrawlBlocked(new URL(url!).pathname), url).toBe(false);
    }
    expect(text).not.toMatch(/\]\(\s*\)|undefined|null|NaN|\[doldurulacak\]/);
  });

  it("fiyat okunamazsa fiyat uydurulmaz: paket adları ve fiyat sayfası", async () => {
    supabase.fail = true;
    const response = await llmsGet();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/₺\d/);
    expect(text).toContain("Ücretli paketler (Sınav Haftası, Plus, Sigma) ve güncel fiyatları: https://cortexplus.app/fiyatlandirma");
  });

  it("kaynakta sabit fiyat yok; sayfa listesi sayfaların kendi başlıklarıyla", () => {
    expect(read("src/lib/seo/llms-txt.ts")).not.toMatch(/₺|\b(349|599|1999)\b/);
    for (const page of PUBLIC_PAGES) {
      if (page.path === "") continue;
      const file = `src/app${page.path}/page.tsx`;
      // Sınav açılış sayfası başlığını kendi verisinden okur (`EXAM_LANDINGS.<id>.metaTitle`).
      const landing = EXAM_LANDING_LIST.find((item) => item.path === page.path);
      if (landing) {
        expect(read(file), file).toContain(`EXAM_LANDINGS.${landing.id}`);
        expect(landing.metaTitle).toBe(page.title);
        continue;
      }
      expect(read(file), file).toContain(page.title);
    }
  });
});
