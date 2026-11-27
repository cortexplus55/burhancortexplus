import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { ROBOTS_DISALLOW } from "@/lib/seo/crawl-rules";
import { curriculumSitemapPaths, supersededBy } from "@/lib/curriculum/seo";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { COOKIE_POLICY_VERSION, KVKK_TEXT_DATE, LEGAL_VERSIONS } from "@/lib/legal/versions";
import { SITE_URL } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, itemListJsonLd, organizationJsonLd, webPageJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/json-ld";

/*
  Google Search Console hazırlığı (26 Kasım 2026). Canlı denetimde bulunanlar:
  - dokuz kamu sayfasında kanonik adres yoktu, paylaşım adresi (og:url) ana sayfayı gösteriyordu; `/giris` ana sayfanın
    başlığını taşıyordu;
  - robots ödeme ve ayarlar sayfalarını kapatmıyordu;
  - site haritasının bütün tarihleri yayın anıydı.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const entries = sitemap();
const paths = entries.map((entry) => new URL(entry.url).pathname);

describe("robots.txt", () => {
  it("her şeyi açar; yönetim, uçlar, giriş dönüşü, ödeme ve ayarları kapatır; haritayı gösterir", () => {
    const result = robots();
    // 27 Kasım 2026 (GEO): yapay zekâ tarayıcılarının kendi grubu da var; `*` grubu aynı kuralları taşır.
    const all = Array.isArray(result.rules) ? result.rules : [result.rules];
    const rule = all.find((item) => item.userAgent === "*")!;
    expect(rule.allow).toBe("/");
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    for (const path of ["/admin", "/api/", "/pay", "/ayarlar"]) expect(disallow).toContain(path);
    expect(disallow).toEqual([...ROBOTS_DISALLOW]);
    expect(result.sitemap).toBe("https://cortexplus.app/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("istenen kamu sayfalarının hepsi, tam adresle, tekrarsız", () => {
    for (const path of ["/", "/fiyatlandirma", "/ozellikler", "/mufredat", "/ornek", "/gizlilik", "/kullanim-kosullari", "/kvkk", "/hesap-silme"]) {
      expect(paths, path).toContain(path);
    }
    expect(entries.every((entry) => entry.url.startsWith(`${SITE_URL}`) && !entry.url.startsWith(`${SITE_URL}//`))).toBe(true);
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
  });

  it("müfredatın program, ünite ve kazanım sayfaları haritada; derin eşi olan 37 eski ağaç yok (27 Kasım 2026)", () => {
    expect(CURRICULUM.programs).toHaveLength(158);
    const listed = CURRICULUM.programs.filter((p) => !supersededBy(p));
    const superseded = CURRICULUM.programs.filter((p) => supersededBy(p));
    expect(superseded).toHaveLength(37);
    expect(listed).toHaveLength(121);
    const curriculum = curriculumSitemapPaths();
    for (const path of curriculum) expect(paths).toContain(path);
    for (const program of listed) expect(paths).toContain(`/mufredat/${program.id}`);
    // Eski ağacın programı, ünitesi ve kazanımı haritada yok; derin eşi olmayan güncel bilgiler ağacı kalır.
    for (const program of superseded) {
      expect(paths.filter((path) => path === `/mufredat/${program.id}` || path.startsWith(`/mufredat/${program.id}/`))).toEqual([]);
    }
    expect(paths).toContain("/mufredat/kpss-2026-tree-guncel");
    const units = listed.reduce((n, p) => n + p.units.length, 0);
    const outcomes = listed.reduce((n, p) => n + p.units.reduce((m, u) => m + u.outcomes.length, 0), 0);
    expect(curriculum).toHaveLength(1 + listed.length + units + outcomes);
  });

  it("yönlenen, oturum isteyen ve robots'un kapattığı adres yok", () => {
    for (const path of ["/kullanim-sartlari", "/pay", "/ogretmen", "/admin", "/ayarlar", "/dashboard", "/paketler", "/uygulamalar"]) {
      expect(paths, path).not.toContain(path);
    }
    for (const prefix of ROBOTS_DISALLOW) {
      const bare = prefix.replace(/\/$/, "");
      expect(paths.filter((path) => path === bare || path.startsWith(`${bare}/`)), prefix).toEqual([]);
    }
  });

  it("her adresin geçerli bir son değişiklik tarihi var; sürümlü sayfalar kendi sürüm gününü verir", () => {
    for (const entry of entries) {
      const date = entry.lastModified instanceof Date ? entry.lastModified : new Date(String(entry.lastModified));
      expect(Number.isNaN(date.getTime()), entry.url).toBe(false);
    }
    const day = (path: string) => {
      const entry = entries.find((item) => new URL(item.url).pathname === path)!;
      return (entry.lastModified as Date).toISOString().slice(0, 10);
    };
    expect(day("/kvkk")).toBe(KVKK_TEXT_DATE);
    expect(day("/kullanim-kosullari")).toBe(LEGAL_VERSIONS.kullanim_kosullari);
    expect(day("/cerez-politikasi")).toBe(COOKIE_POLICY_VERSION);
    expect(day("/mufredat")).toBe(CURRICULUM.version);
  });
});

describe("sayfa başına başlık, kanonik adres ve paylaşım bilgisi", () => {
  const PAGES: Array<[string, string, string]> = [
    ["src/app/gizlilik/page.tsx", "/gizlilik", "Gizlilik politikası"],
    ["src/app/kvkk/page.tsx", "/kvkk", "KVKK aydınlatma metni"],
    ["src/app/kullanim-kosullari/page.tsx", "/kullanim-kosullari", "Kullanım koşulları"],
    ["src/app/hesap-silme/page.tsx", "/hesap-silme", "Hesap silme"],
    ["src/app/iletisim/page.tsx", "/iletisim", "İletişim"],
    ["src/app/hakkimizda/page.tsx", "/hakkimizda", "Hakkımızda"],
    ["src/app/cerez-politikasi/page.tsx", "/cerez-politikasi", "Çerez politikası"],
    ["src/app/mobil-uygulama/page.tsx", "/mobil-uygulama", "Telefondan Cortex"],
    ["src/app/kayit/page.tsx", "/kayit", "Hesap oluştur"],
    // İstemci sayfası: metadata düzen dosyasında.
    ["src/app/giris/layout.tsx", "/giris", "Giriş yap"],
  ];

  it.each(PAGES)("%s kendi kanonik adresini ve başlığını pageMetadata ile yazar", (file, path, title) => {
    const source = read(file);
    expect(source).toContain("pageMetadata(");
    expect(source).toContain(`path: "${path}"`);
    expect(source).toContain(`title: "${title}"`);
  });

  it("başlıklar birbirinden ve ana sayfadan farklı", () => {
    const titles = PAGES.map(([, , title]) => title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).not.toContain("Cortex Plus — Ders notundan sınav hazırlığı");
  });

  it("kök düzen: taban adres ve Google doğrulama etiketi iki ortam değişkeninden", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("metadataBase: new URL(SITE_URL)");
    expect(layout).toContain("process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION");
    expect(layout).toContain("process.env.GOOGLE_SITE_VERIFICATION");
    expect(layout).toContain("verification: { google: googleSiteVerification }");
    // Değer kodda yazılı değil (yalnız ortam değişkeninden gelir).
    expect(layout).not.toMatch(/google-site-verification=/);
  });
});

describe("yapılandırılmış veri", () => {
  /** Çizilen betiğin `@graph` dizisi (27 Kasım 2026'dan beri her sayfa tek grafik). */
  const parse = (data: object | object[]) => {
    const html = renderToStaticMarkup(<JsonLd data={data} />);
    const root = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
      "@context": string;
      "@graph": unknown[];
    };
    expect(root["@context"]).toBe("https://schema.org");
    return root["@graph"];
  };

  it("ana sayfa kurumu: Organization, marka adı, logo ve adres; puan, yorum, fiyat yok", () => {
    const [org] = parse(organizationJsonLd()) as [Record<string, unknown>];
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("Cortex Plus");
    expect(org.url).toBe("https://cortexplus.app");
    expect(org.logo).toBe("https://cortexplus.app/logo-mark-trim.png");
    expect(org.contactPoint).toEqual([
      { "@type": "ContactPoint", contactType: "customer support", email: "cortexplus@cortexplus.app", availableLanguage: ["tr"] },
    ]);
    for (const key of ["aggregateRating", "review", "offers", "priceRange"]) expect(org).not.toHaveProperty(key);
  });

  it("SoftwareApplication (27 Kasım 2026, ürün sahibinin isteği): canlı fiyatlı teklifler; puan ve yorum uydurulmaz", () => {
    // 26 Kasım'daki "bilerek yok" kararı değişti; ana sayfa ve fiyat sayfası uygulamayı veritabanındaki fiyatlarla yazar.
    expect(read("src/app/page.tsx")).toContain("softwareApplicationJsonLd(offers)");
    expect(read("src/app/fiyatlandirma/page.tsx")).toContain("softwareApplicationJsonLd(offers)");
    const source = read("src/lib/seo/structured-data.ts");
    expect(source).not.toMatch(/aggregateRating:|ratingValue|reviewCount|"Review"/);
  });

  it("fiyat sayfası: WebPage + gezinme yolu; teklifler kartlarla aynı satırlardan", () => {
    const source = read("src/app/fiyatlandirma/page.tsx").replace(/\s+/g, " ");
    expect(source).toContain('webPageJsonLd({ name: "Fiyatlandırma", description: PRICING_DESCRIPTION, path: "/fiyatlandirma", breadcrumb: true, about: "software", })');
    expect(source).toContain('{ name: "Fiyatlandırma", path: "/fiyatlandirma" }');
    expect(source).toContain("const offers = storeOffersFromPlans(plans);");
    const ld = parse([
      webPageJsonLd({ name: "Fiyatlandırma", description: "Açıklama", path: "/fiyatlandirma" }),
      breadcrumbJsonLd([
        { name: "Cortex Plus", path: "/" },
        { name: "Fiyatlandırma", path: "/fiyatlandirma" },
      ]),
    ]) as Array<Record<string, unknown>>;
    expect(ld.map((item) => item["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
    expect(ld[0]).toMatchObject({
      "@id": "https://cortexplus.app/fiyatlandirma#sayfa",
      url: "https://cortexplus.app/fiyatlandirma",
      inLanguage: "tr-TR",
      isPartOf: { "@id": "https://cortexplus.app/#site" },
      publisher: { "@id": "https://cortexplus.app/#kurum" },
    });
    expect(JSON.stringify(ld)).not.toMatch(/"price|"offers"|aggregateRating/);
  });

  it("müfredat dizini: CollectionPage, programlar ItemList olarak tam adresle; gezinme yolu", () => {
    const source = read("src/app/mufredat/page.tsx");
    expect(source).toContain('type: "CollectionPage"');
    expect(source).toContain("mainEntity: itemListJsonLd(");
    const list = itemListJsonLd([
      { name: "A", path: "/mufredat/a" },
      { name: "B", path: "/mufredat/b" },
    ]);
    expect(list).toEqual({
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "A", url: "https://cortexplus.app/mufredat/a" },
        { "@type": "ListItem", position: 2, name: "B", url: "https://cortexplus.app/mufredat/b" },
      ],
    });
  });
});
