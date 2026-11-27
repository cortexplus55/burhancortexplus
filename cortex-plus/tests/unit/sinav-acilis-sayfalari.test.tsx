import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
  Sınav açılış sayfaları (27 Kasım 2026, SEO ve GEO): `/yks-hazirlik`, `/lgs-hazirlik`, `/kpss-hazirlik`, `/tus-hazirlik`.
  Bekçiler: iki cümlelik tanım ilk 100 kelimede, sınava özel dört "cevap önce" SSS (ilk HTML'de, tıklamadan), sayfayla
  birebir eşleşen tek `@graph` (FAQPage + BreadcrumbList), kanonik adres ve paylaşım görseli, müfredat ve `/ornek`
  bağlantıları, canlı fiyat (sabit fiyat yok), site haritası, `/llms.txt`, altbilgi ve `/sinav-hazirligi` bağlantıları,
  uygulama içi yönlendirme ve sosyal profil adresleri. Sunucu HTML'inin kendisi e2e `sinav-acilis-sayfalari.spec.ts`'te.
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

// Sayfanın kendisi: üst menü ve altbilgi bu testin konusu değil (altbilgi aşağıda gerçek bileşenle sınanır).
vi.mock("@/components/parity/marketing", () => ({
  ParityMarketingPage: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
}));

import sitemap from "@/app/sitemap";
import { GET as llmsGet } from "@/app/llms.txt/route";
import { examLandingCrumbs, examLandingJsonLd, ExamLandingPage } from "@/components/marketing/exam-landing-page";
import { getProgram } from "@/lib/curriculum/registry";
import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { EXAM_LANDING_LINKS, EXAM_LANDING_PATHS } from "@/lib/marketing/exam-landing-links";
import { EXAM_LANDING_LIST, EXAM_LANDINGS, examLandingSummary, LIVE_VOICE_ACCESS } from "@/lib/marketing/exam-landings";
import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/lib/notifications/schedule";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";
import { nativePaymentDecision } from "@/lib/platform/native-payment-policy";
import { isCrawlBlocked } from "@/lib/seo/crawl-rules";
import { OG_IMAGE } from "@/lib/seo/page-metadata";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";
import { jsonLdGraph, jsonLdString, organizationJsonLd, socialProfileUrls } from "@/lib/seo/structured-data";
import { REALTIME_FREE_TRIAL_ENABLED, REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";
import * as yksPage from "@/app/yks-hazirlik/page";
import * as lgsPage from "@/app/lgs-hazirlik/page";
import * as kpssPage from "@/app/kpss-hazirlik/page";
import * as tusPage from "@/app/tus-hazirlik/page";

const PAGES = { yks: yksPage, lgs: lgsPage, kpss: kpssPage, tus: tusPage } as const;

const LIVE_ROWS = [
  { slug: "plus-haftalik", price_try: 34900, description: null, active: true },
  { slug: "plus-aylik", price_try: 59900, description: null, active: true },
  { slug: "sigma-aylik", price_try: 199900, description: null, active: true },
];

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** Nokta, soru ya da ünlem ve ardından boşluk + büyük harf (ya da metnin sonu). */
function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/u)
    .filter(Boolean);
}

/** Görünür metnin kelimeleri (e2e'deki gibi: etiketler boşluğa döner, betik ve stil atılır). */
function visibleWords(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split(/\s+/)
    .filter(Boolean);
}

afterEach(() => {
  supabase.rows = [];
  supabase.fail = false;
  vi.unstubAllEnvs();
});

describe("sınav açılış sayfalarının verisi", () => {
  it("dört sayfa, adresler ve adlar bağlantı listesiyle aynı; başlık ve açıklama benzersiz", () => {
    expect(EXAM_LANDING_LIST.map((landing) => landing.path)).toEqual([
      "/yks-hazirlik",
      "/lgs-hazirlik",
      "/kpss-hazirlik",
      "/tus-hazirlik",
    ]);
    for (const link of EXAM_LANDING_LINKS) {
      expect(EXAM_LANDINGS[link.id].path).toBe(link.path);
      expect(EXAM_LANDINGS[link.id].navLabel).toBe(link.navLabel);
    }
    const titles = EXAM_LANDING_LIST.map((landing) => landing.metaTitle);
    const descriptions = EXAM_LANDING_LIST.map((landing) => landing.metaDescription);
    expect(new Set(titles).size).toBe(4);
    expect(new Set(descriptions).size).toBe(4);
    for (const landing of EXAM_LANDING_LIST) {
      expect(landing.metaTitle.length, landing.metaTitle).toBeLessThanOrEqual(60);
      expect(landing.metaDescription.length, landing.metaDescription).toBeGreaterThanOrEqual(110);
      expect(landing.metaDescription.length, landing.metaDescription).toBeLessThanOrEqual(175);
    }
  });

  it("tanım iki cümle, ürünün adıyla başlar ve o sınavı adıyla anar", () => {
    const examWord = { yks: "YKS", lgs: "LGS", kpss: "KPSS", tus: "TUS" } as const;
    for (const landing of EXAM_LANDING_LIST) {
      expect(landing.definition).toHaveLength(2);
      for (const sentence of landing.definition) expect(sentences(sentence), sentence).toHaveLength(1);
      expect(landing.definition[0].startsWith("Cortex Plus, ")).toBe(true);
      expect(landing.definition[0]).toContain(examWord[landing.id]);
      expect(landing.definition[0]).toMatch(/yapay zekâ öğretmenidir\.$/);
    }
  });

  it("her sayfada sınava özel dört 'cevap önce' SSS: en çok üç cümle, sorular sayfalar arasında tekrar etmez", () => {
    const questions = new Set<string>();
    for (const landing of EXAM_LANDING_LIST) {
      expect(landing.faq, landing.id).toHaveLength(4);
      for (const item of landing.faq) {
        expect(item.q.endsWith("?"), item.q).toBe(true);
        const count = sentences(item.a).length;
        expect(count, item.a).toBeGreaterThanOrEqual(1);
        expect(count, item.a).toBeLessThanOrEqual(3);
        expect(questions.has(item.q), item.q).toBe(false);
        questions.add(item.q);
      }
    }
  });

  it("misafire söz yalnız bugün çalışan işten; sayılar ve erişim kuralları koddan", () => {
    const all = JSON.stringify(EXAM_LANDING_LIST);
    // Canlı sesli öğretmen: ücretsiz hesapta açık değil; metin sesli ders ucunun ret metniyle aynı.
    expect(REALTIME_FREE_TRIAL_ENABLED).toBe(false);
    expect(LIVE_VOICE_ACCESS).toBe(REFUSAL_MESSAGE.plus_required);
    expect(all).not.toMatch(/canlı sesli öğretmen[^.]*ücretsiz/i);
    for (const landing of EXAM_LANDING_LIST) {
      for (const feature of landing.features) {
        if (/canlı sesli|çizimli|sınav sabahı|podcast/i.test(feature.title)) expect(feature.chip, feature.title).toBeTruthy();
      }
    }
    // Veli bağlantısının süresi ve sessiz saat sabitlerden.
    const lgs = JSON.stringify(EXAM_LANDINGS.lgs);
    expect(lgs).toContain(`${PARENT_LINK_TTL_HOURS} saat`);
    const quiet = `${String(QUIET_START_HOUR).padStart(2, "0")}:00–${String(QUIET_END_HOUR).padStart(2, "0")}:00`;
    expect(lgs).toContain(quiet);
    // Sahte istatistik, mutlak söz, rakip adı ve sabit fiyat yok.
    expect(all).not.toMatch(/%\s?\d|\d\s?%|garanti|kesin başarı|en iyi|Astra|₺|\b(349|599|1\.?999)\b|öğrencimiz|yorum/i);
  });

  it("müfredat bağlantıları kayıt defterindeki gerçek programlar", () => {
    for (const landing of EXAM_LANDING_LIST) {
      expect(landing.programIds.length).toBeGreaterThanOrEqual(5);
      for (const id of landing.programIds) expect(getProgram(id), id).toBeTruthy();
    }
  });
});

describe("sayfa çıktısı (sunucuda)", () => {
  for (const landing of EXAM_LANDING_LIST) {
    it(`${landing.path}: tanım ilk 100 kelimede, SSS cevapları ilk HTML'de, bağlantılar ve canlı fiyat`, async () => {
      supabase.rows = LIVE_ROWS;
      const html = renderToStaticMarkup(await ExamLandingPage({ id: landing.id }));
      const words = visibleWords(html);
      const summaryWords = examLandingSummary(landing).split(/\s+/);
      const first = words.slice(0, 100).join(" ");
      // İki cümlenin tamamı ilk 100 kelimenin içinde biter.
      expect(first, first).toContain(summaryWords.join(" "));

      for (const item of landing.faq) {
        expect(html).toContain(item.q.replace(/'/g, "&#x27;"));
        expect(words.join(" ")).toContain(item.a.split(/\s+/).slice(0, 10).join(" "));
      }
      expect((html.match(/<details/g) ?? []).length).toBe(4);

      expect(html).toContain('href="/ornek"');
      expect(html).toContain(`href="${landing.signupHref}"`);
      for (const id of landing.programIds) expect(html).toContain(`href="/mufredat/${id}"`);
      expect(html).toContain('href="/mufredat"');
      for (const other of EXAM_LANDING_PATHS.filter((path) => path !== landing.path)) {
        expect(html).toContain(`href="${other}"`);
      }
      // Fiyatlar tablodan; ücretsiz hak cümlesi koddan.
      expect(html).toContain("₺349");
      expect(html).toContain("₺599");
      expect(html).toContain("₺1.999");
      expect(html).toContain(FREE_TIER_SENTENCE.slice(1, 40));
      expect(html).not.toMatch(/undefined|NaN/);
    });
  }

  it("fiyat okunamazsa fiyat uydurulmaz; fiyat sayfasına bağlantı kalır", async () => {
    supabase.fail = true;
    const html = renderToStaticMarkup(await ExamLandingPage({ id: "kpss" }));
    expect(html).not.toMatch(/₺\d/);
    expect(html).toContain('href="/fiyatlandirma"');
  });
});

describe("yapılandırılmış veri: tek @graph", () => {
  for (const landing of EXAM_LANDING_LIST) {
    it(`${landing.path}: geçerli JSON, FAQPage sayfadaki SSS'nin aynısı, gezinme yolu üç adım`, () => {
      const text = jsonLdString(jsonLdGraph(examLandingJsonLd(landing)));
      const root = JSON.parse(text) as {
        "@context": string;
        "@graph": Array<Record<string, unknown> & { "@type": string; "@id"?: string }>;
      };
      expect(root["@context"]).toBe("https://schema.org");
      const types = root["@graph"].map((node) => node["@type"]);
      expect(types).toEqual(["Organization", "WebSite", "WebPage", "BreadcrumbList", "FAQPage"]);
      const ids = root["@graph"].flatMap((node) => (node["@id"] ? [node["@id"]] : []));
      expect(new Set(ids).size).toBe(ids.length);
      expect(text).not.toMatch(/aggregateRating|"review"|"@context":[^,]*,[\s\S]*"@context"/);

      const url = `https://cortexplus.app${landing.path}`;
      const page = root["@graph"][2]!;
      expect(page.url).toBe(url);
      expect(page.breadcrumb).toEqual({ "@id": `${url}#yol` });

      const faq = root["@graph"][4] as unknown as {
        "@id": string;
        mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
      };
      expect(faq["@id"]).toBe(`${url}#sss`);
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(landing.faq.map((item) => [item.q, item.a]));

      const crumbs = root["@graph"][3] as unknown as {
        itemListElement: Array<{ position: number; name: string; item: string }>;
      };
      expect(crumbs.itemListElement).toEqual(
        examLandingCrumbs(landing).map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: crumb.path === "/" ? "https://cortexplus.app" : `https://cortexplus.app${crumb.path}`,
        })),
      );
    });
  }
});

describe("başlık, açıklama, kanonik adres ve paylaşım görseli", () => {
  for (const landing of EXAM_LANDING_LIST) {
    it(`${landing.path}`, () => {
      const page = PAGES[landing.id];
      const metadata = page.metadata as {
        title: string;
        description: string;
        alternates: { canonical: string };
        openGraph: { url: string; title: string; images: Array<{ url: string; width: number; height: number }> };
        twitter: { card: string; images: string[] };
      };
      expect(metadata.title).toBe(landing.metaTitle);
      expect(metadata.description).toBe(landing.metaDescription);
      expect(metadata.alternates.canonical).toBe(`https://cortexplus.app${landing.path}`);
      expect(metadata.openGraph.url).toBe(`https://cortexplus.app${landing.path}`);
      expect(metadata.openGraph.title).toBe(`${landing.metaTitle} | Cortex Plus`);
      expect(metadata.openGraph.images[0]).toEqual(OG_IMAGE);
      expect(metadata.twitter.card).toBe("summary_large_image");
      expect(page.revalidate).toBe(300);
    });
  }

  it("paylaşım görseli depoda gerçek bir dosya (kök `opengraph-image.png`)", () => {
    expect(OG_IMAGE.url).toBe("/opengraph-image.png");
    expect(readFileSync("src/app/opengraph-image.png").byteLength).toBeGreaterThan(10_000);
  });
});

describe("site haritası, /llms.txt, robots ve iç bağlantılar", () => {
  it("dört adres site haritasında ve sayfa listesinde; robots kapatmıyor", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of EXAM_LANDING_PATHS) {
      expect(urls).toContain(`https://cortexplus.app${path}`);
      expect(isCrawlBlocked(path), path).toBe(false);
      expect(PUBLIC_PAGES.find((page) => page.path === path)?.title).toBe(
        EXAM_LANDING_LIST.find((landing) => landing.path === path)?.metaTitle,
      );
    }
  });

  it("/llms.txt sınavlara göre bölümü dört sayfayı tam adresle ve tanımla anar", async () => {
    supabase.rows = LIVE_ROWS;
    const response = await llmsGet();
    const text = await response.text();
    expect(text).toContain("## Sınavlara göre hazırlık");
    for (const landing of EXAM_LANDING_LIST) {
      expect(text).toContain(`- [${landing.navLabel}](https://cortexplus.app${landing.path}): ${landing.definition[0]}`);
    }
  });

  it("altbilgi her pazarlama sayfasında dört sınav sayfasına bağlanır (üst menü değişmedi)", async () => {
    const actual = await vi.importActual<typeof import("@/components/parity/marketing")>("@/components/parity/marketing");
    const html = renderToStaticMarkup(<actual.ParitySiteFooter />);
    expect(html).toContain('aria-label="Sınava göre hazırlık"');
    for (const link of EXAM_LANDING_LINKS) expect(html).toContain(`href="${link.path}"`);
    expect(read("src/components/marketing/parity-site-header.tsx")).not.toMatch(/hazirlik"/);
  });

  it("/sinav-hazirligi dört sınav sayfasına bağlanır", async () => {
    const { default: SinavHazirligiPage } = await import("@/app/sinav-hazirligi/page");
    const html = renderToStaticMarkup(<SinavHazirligiPage />);
    expect(html).toContain('data-testid="sh-exam-links"');
    for (const link of EXAM_LANDING_LINKS) expect(html).toContain(`href="${link.path}"`);
  });

  it("mobil uygulamada (web fiyatı ve veli ödemesi anlatılır) ana sayfaya yönlenir; tarayıcıda dokunulmaz", () => {
    for (const path of EXAM_LANDING_PATHS) {
      expect(nativePaymentDecision(path, "Mozilla/5.0 CortexPlusApp/1 (ios)"), path).toEqual({ kind: "redirect", to: "/" });
      expect(nativePaymentDecision(path, "Mozilla/5.0 (Macintosh)"), path).toBeNull();
    }
  });
});

describe("tanıtım sayfalarındaki her lp-/xl- sınıfının stili var", () => {
  /*
    19 Ekim 2026'da ana sayfa yenilenirken `.lp-features`, `.lp-feature`, `.lp-steps` kuralları silinmiş; `/ozellikler` ve
    `/sinav-hazirligi` o günden 27 Kasım 2026'ya kadar düz liste gibi çizildi ve kimse fark etmedi. Bu sayfalarda kullanılan
    her `lp-` ve `xl-` sınıfının stil dosyasında bir kuralı olmalı.
  */
  const css = read("src/styles/landing.css") + read("src/styles/exam-landing.css");
  for (const file of [
    "src/app/ozellikler/page.tsx",
    "src/app/sinav-hazirligi/page.tsx",
    "src/components/marketing/exam-landing-page.tsx",
    "src/components/marketing/answer-faq-section.tsx",
  ]) {
    it(file, () => {
      const source = read(file);
      const classes = new Set(
        [...source.matchAll(/className=(?:"[^"]*"|\{[^}]*\})/g)].flatMap((match) => match[0].match(/\b(?:lp|xl)-[a-z0-9-]+/g) ?? []),
      );
      expect(classes.size).toBeGreaterThan(5);
      const missing = [...classes].filter((name) => !new RegExp(`\\.${name}(?![a-z0-9-])`).test(css));
      expect(missing).toEqual([]);
    });
  }
});

describe("Organization.sameAs: SOCIAL_PROFILE_URLS", () => {
  it("virgülle ayrılmış Instagram, TikTok ve YouTube adresleri; boşluk, tekrar ve https olmayan adres atılır", () => {
    const raw =
      " https://www.instagram.com/cortexplus.app , https://www.tiktok.com/@cortexplus,https://www.youtube.com/@cortexplus ,http://eski.example.com, https://www.instagram.com/cortexplus.app ,yanlis";
    expect(socialProfileUrls(raw)).toEqual([
      "https://www.instagram.com/cortexplus.app",
      "https://www.tiktok.com/@cortexplus",
      "https://www.youtube.com/@cortexplus",
    ]);
  });

  it("ortam değişkeni verilince kurum düğümüne yazılır, verilmezse sameAs hiç yazılmaz", () => {
    vi.stubEnv("SOCIAL_PROFILE_URLS", "https://www.instagram.com/cortexplus.app,https://www.youtube.com/@cortexplus");
    expect(organizationJsonLd().sameAs).toEqual([
      "https://www.instagram.com/cortexplus.app",
      "https://www.youtube.com/@cortexplus",
    ]);
    vi.stubEnv("SOCIAL_PROFILE_URLS", "");
    expect("sameAs" in organizationJsonLd()).toBe(false);
  });
});
