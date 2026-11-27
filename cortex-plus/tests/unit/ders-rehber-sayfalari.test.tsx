import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
  Ders ve rehber sayfaları (27 Kasım 2026, SEO ve GEO): `/ders`, `/ders/<ders>` (8), `/rehber`, `/rehber/<konu>` (6) ve
  `/llms-full.txt`. Bekçiler: tanım / doğrudan cevap ilk 100 kelimede, "cevap önce" SSS ilk HTML'de, sayfayla birebir tek
  `@graph`, sayılar kayıt defterinden (soru sayıları `examStructures`, ünite listeleri programlardan), ürün sözleri koddan,
  sabit fiyat ve rakip adı yok, site haritası, `/llms.txt` → `/llms-full.txt`, iç bağlantılar, mobil uygulama yönlendirmesi.
  Sunucu HTML'inin kendisi (üst menü dahil ilk 100 kelime, 375 ve 1280 px) e2e `ders-rehber-sayfalari.spec.ts`'te.
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

vi.mock("@/components/parity/marketing", () => ({
  ParityMarketingPage: ({ children }: { children?: React.ReactNode }) => <main>{children}</main>,
}));

import sitemap from "@/app/sitemap";
import { GET as llmsGet } from "@/app/llms.txt/route";
import { GET as llmsFullGet } from "@/app/llms-full.txt/route";
import * as subjectRoute from "@/app/ders/[ders]/page";
import * as guideRoute from "@/app/rehber/[konu]/page";
import { default as SubjectIndex, metadata as subjectIndexMeta } from "@/app/ders/page";
import { default as GuideIndex, metadata as guideIndexMeta } from "@/app/rehber/page";
import { guideCrumbs, guideJsonLd, GuidePage } from "@/components/marketing/guide-page";
import { subjectHubCrumbs, subjectHubJsonLd, SubjectHubPage } from "@/components/marketing/subject-hub-page";
import { ExamLandingPage } from "@/components/marketing/exam-landing-page";
import { FREE_PHOTO_PER_MONTH } from "@/lib/billing/free-meters";
import { CURRICULUM, getProgram } from "@/lib/curriculum/registry";
import { REVIEW_LADDER_DAYS } from "@/lib/learning/review-items";
import { GUIDE_LINKS, SUBJECT_HUB_LINKS } from "@/lib/marketing/content-hub-links";
import { EXAM_LANDING_LIST } from "@/lib/marketing/exam-landings";
import { GUIDE_LIST } from "@/lib/marketing/guides";
import {
  LIVE_VOICE_ACCESS,
  LIVE_VOICE_PLANS,
  programUnitsForGrades,
  scopeCount,
  SUBJECT_HUB_LIST,
  SUBJECT_HUBS,
  subjectHubSummary,
} from "@/lib/marketing/subject-hubs";
import { nativePaymentDecision } from "@/lib/platform/native-payment-policy";
import { isCrawlBlocked } from "@/lib/seo/crawl-rules";
import { OG_IMAGE } from "@/lib/seo/page-metadata";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";
import { jsonLdGraph, jsonLdString } from "@/lib/seo/structured-data";
import { REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";

const LIVE_ROWS = [
  { slug: "plus-haftalik", price_try: 34900, description: null, active: true },
  { slug: "plus-aylik", price_try: 59900, description: null, active: true },
  { slug: "sigma-aylik", price_try: 199900, description: null, active: true },
];

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/u)
    .filter(Boolean);
}

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

/** Sabit fiyat, rakip adı, mutlak söz ve uydurma istatistik kalıpları. */
const BANNED = /₺|\b(349|599|1\.?999)\b|Astra|garanti|kesin başarı|en iyi|%\s?100|100\s?%|\d+\s?bin öğrenci|öğrencimiz|yorumlar/i;

type GraphRoot = { "@context": string; "@graph": Array<Record<string, unknown> & { "@type": string; "@id"?: string }> };
const graphOf = (nodes: object[]) => JSON.parse(jsonLdString(jsonLdGraph(nodes))) as GraphRoot;

afterEach(() => {
  supabase.rows = [];
  supabase.fail = false;
});

describe("ders sayfalarının verisi", () => {
  it("sekiz ders, adresler bağlantı listesiyle aynı; başlık ve açıklama benzersiz ve ölçülü", () => {
    expect(SUBJECT_HUB_LIST.map((hub) => hub.path)).toEqual([
      "/ders/matematik",
      "/ders/kimya",
      "/ders/fizik",
      "/ders/biyoloji",
      "/ders/turkce",
      "/ders/tarih",
      "/ders/cografya",
      "/ders/ingilizce",
    ]);
    expect(new Set(SUBJECT_HUB_LIST.map((hub) => hub.metaTitle)).size).toBe(8);
    expect(new Set(SUBJECT_HUB_LIST.map((hub) => hub.metaDescription)).size).toBe(8);
    for (const hub of SUBJECT_HUB_LIST) {
      expect(`${hub.metaTitle} | Cortex Plus`.length, hub.metaTitle).toBeLessThanOrEqual(65);
      expect(hub.metaDescription.length, hub.metaDescription).toBeGreaterThanOrEqual(110);
      expect(hub.metaDescription.length, hub.metaDescription).toBeLessThanOrEqual(175);
    }
  });

  it("tanım iki cümle: ders notundan kişisel program, adım adım çözüm, yazılı ve canlı sesli öğretmen", () => {
    expect(REFUSAL_MESSAGE.plus_required).toBe(`Canlı sesli öğretmen ${LIVE_VOICE_PLANS}'da açık.`);
    expect(LIVE_VOICE_ACCESS).toBe(REFUSAL_MESSAGE.plus_required);
    for (const hub of SUBJECT_HUB_LIST) {
      expect(hub.definition).toHaveLength(2);
      for (const sentence of hub.definition) expect(sentences(sentence), sentence).toHaveLength(1);
      expect(hub.definition[0].startsWith(`${hub.name} için Cortex Plus, `)).toBe(true);
      const summary = subjectHubSummary(hub);
      for (const phrase of ["ders notundan", "kişisel bir çalışma programı", "adım adım çözüm", "yazılı öğretmen", "canlı sesli öğretmen"]) {
        expect(summary, `${hub.id}: ${phrase}`).toContain(phrase);
      }
    }
  });

  it("sınavlara göre soru sayıları kayıt defterinin sınav yapısından; KPSS'de sayı yazılmaz", () => {
    const count = (id: keyof typeof SUBJECT_HUBS, exam: string) =>
      scopeCount(SUBJECT_HUBS[id].scope.find((row) => row.exam === exam)!);
    const official = (exam: string, ...subjects: string[]) =>
      CURRICULUM.examStructures.filter((row) => row.exam === exam && subjects.includes(row.subject)).reduce((sum, row) => sum + row.count, 0);
    expect(count("matematik", "LGS")).toBe(official("LGS", "Matematik"));
    expect(count("matematik", "TYT")).toBe(official("TYT", "Temel Matematik"));
    expect(count("matematik", "AYT")).toBe(official("AYT", "Matematik"));
    expect(count("kimya", "AYT")).toBe(official("AYT", "Kimya"));
    expect(count("tarih", "AYT")).toBe(official("AYT", "Tarih-1", "Tarih-2"));
    expect(count("cografya", "AYT")).toBe(official("AYT", "Coğrafya-1", "Coğrafya-2"));
    expect(count("ingilizce", "YDS")).toBe(official("YDS", "Yabancı Dil"));
    for (const hub of SUBJECT_HUB_LIST) {
      const kpss = hub.scope.find((row) => row.exam === "KPSS");
      if (kpss) {
        expect(scopeCount(kpss)).toBeNull();
        expect(kpss.note).toContain("ÖSYM ders ders soru sayısı yayımlamaz");
      }
      for (const row of hub.scope) for (const id of row.programIds) expect(getProgram(id), `${hub.id}: ${id}`).toBeTruthy();
    }
    // YDT ürünümüzde yok: yalnız "sunmaz" diye anılır.
    const all = JSON.stringify(SUBJECT_HUB_LIST);
    expect(all.match(/YDT[^"]*/g)?.every((text) => /sunmaz/.test(text))).toBe(true);
  });

  it("her derste beş 'cevap önce' soru; sorular bütün sayfalarda tekrar etmez; ürün sözleri koddan", () => {
    const seen = new Set<string>();
    for (const landing of EXAM_LANDING_LIST) for (const item of landing.faq) seen.add(item.q);
    for (const hub of SUBJECT_HUB_LIST) {
      expect(hub.faq, hub.id).toHaveLength(5);
      for (const item of hub.faq) {
        expect(item.q.endsWith("?"), item.q).toBe(true);
        const count = sentences(item.a).length;
        expect(count, item.a).toBeGreaterThanOrEqual(1);
        expect(count, item.a).toBeLessThanOrEqual(3);
        expect(seen.has(item.q), item.q).toBe(false);
        seen.add(item.q);
      }
      const text = JSON.stringify(hub);
      expect(text).toContain(`ayda ${FREE_PHOTO_PER_MONTH} fotoğraf`);
      expect(text).toContain(REVIEW_LADDER_DAYS.slice(0, -1).join(", "));
      expect(text, hub.id).not.toMatch(BANNED);
    }
  });
});

describe("rehber sayfalarının verisi", () => {
  it("altı rehber, adresler bağlantı listesiyle aynı; doğrudan cevap iki ya da üç cümle; adım ve üç SSS", () => {
    expect(GUIDE_LIST.map((guide) => guide.slug)).toEqual(GUIDE_LINKS.map((link) => link.slug));
    const seen = new Set<string>([...SUBJECT_HUB_LIST.flatMap((hub) => hub.faq.map((item) => item.q))]);
    for (const guide of GUIDE_LIST) {
      expect(guide.path).toBe(`/rehber/${guide.slug}`);
      const count = sentences(guide.answer).length;
      expect(count, guide.answer).toBeGreaterThanOrEqual(2);
      expect(count, guide.answer).toBeLessThanOrEqual(3);
      expect(guide.steps.length).toBeGreaterThanOrEqual(5);
      expect(guide.faq).toHaveLength(3);
      for (const item of guide.faq) {
        expect(sentences(item.a).length, item.a).toBeLessThanOrEqual(3);
        expect(seen.has(item.q), item.q).toBe(false);
        seen.add(item.q);
      }
      expect(`${guide.metaTitle} | Cortex Plus`.length, guide.metaTitle).toBeLessThanOrEqual(70);
      expect(guide.metaDescription.length).toBeLessThanOrEqual(175);
      expect(JSON.stringify(guide), guide.slug).not.toMatch(BANNED);
    }
  });

  it("veri blokları kayıt defterinden: TYT matematik (9-10) ve AYT kimya (11-12) üniteleri, soru sayıları", () => {
    const tyt = GUIDE_LIST.find((guide) => guide.slug === "tyt-matematik-netleri-nasil-artar")!;
    const ayt = GUIDE_LIST.find((guide) => guide.slug === "ayt-kimya-calisma-sirasi-ve-konulari")!;
    expect(tyt.list!.items).toEqual(programUnitsForGrades("yks-2026-matematik", [9, 10]));
    expect(ayt.list!.items).toEqual(programUnitsForGrades("yks-2026-kimya", [11, 12]));
    expect(ayt.list!.items.length).toBeGreaterThanOrEqual(8);
    const official = (exam: string, subject: string) =>
      CURRICULUM.examStructures.find((row) => row.exam === exam && row.subject === subject)!.count;
    expect(tyt.answer).toContain(`TYT'de ${official("TYT", "Temel Matematik")} Temel Matematik sorusu`);
    expect(ayt.answer).toContain(`${official("AYT", "Kimya")} kimya sorusu`);
    // Net kuralı: örnek hesap tutarlı (30 doğru, 8 yanlış → 28).
    expect(JSON.stringify(tyt.faq)).toContain("30 doğru ve 8 yanlışta net 28");
  });

  it("seçim rehberi: sekiz tarafsız ölçüt, rakip adı yok, Cortex Plus sütunu bugünkü işten", () => {
    const guide = GUIDE_LIST.find((item) => item.slug === "sinav-hazirlik-uygulamasi-nasil-secilir")!;
    expect(guide.table!.rows).toHaveLength(8);
    expect(guide.table!.head).toEqual(["Ölçüt", "Neye bakmalı", "Cortex Plus'ta"]);
    expect(JSON.stringify(guide.table)).toContain("kendiliğinden yenilenmez");
    expect(JSON.stringify(guide.table)).not.toMatch(BANNED);
  });

  it("ilgili bağlantılar gerçek sayfalar", () => {
    const known = new Set([
      ...PUBLIC_PAGES.map((page) => page.path || "/"),
      "/fiyatlandirma",
      "/ornek",
      "/kvkk",
    ]);
    for (const guide of GUIDE_LIST) {
      for (const link of guide.related) {
        if (link.href.startsWith("/mufredat/")) expect(getProgram(link.href.split("/")[2]!), link.href).toBeTruthy();
        else expect(known.has(link.href), `${guide.slug}: ${link.href}`).toBe(true);
      }
    }
  });
});

describe("ders sayfası çıktısı ve tek @graph", () => {
  for (const hub of SUBJECT_HUB_LIST) {
    it(`${hub.path}`, () => {
      const html = renderToStaticMarkup(<SubjectHubPage id={hub.id} />);
      const words = visibleWords(html);
      expect(words.slice(0, 100).join(" ")).toContain(subjectHubSummary(hub));
      expect((html.match(/<details/g) ?? []).length).toBe(5);
      for (const item of hub.faq) expect(words.join(" ")).toContain(item.a.split(/\s+/).slice(0, 10).join(" "));
      expect(html).toContain('href="/ornek"');
      expect(html).toContain('href="/kayit"');
      for (const row of hub.scope) for (const id of row.programIds) expect(html).toContain(`href="/mufredat/${id}"`);
      for (const row of hub.scope) if (row.link) expect(html).toContain(`href="${row.link.href}"`);
      expect(html).not.toMatch(/undefined|NaN/);

      const root = graphOf(subjectHubJsonLd(hub));
      expect(root["@graph"].map((node) => node["@type"])).toEqual([
        "Organization",
        "WebSite",
        "WebPage",
        "LearningResource",
        "BreadcrumbList",
        "FAQPage",
      ]);
      const ids = root["@graph"].flatMap((node) => (node["@id"] ? [node["@id"]] : []));
      expect(new Set(ids).size).toBe(ids.length);
      const faq = root["@graph"][5] as unknown as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(hub.faq.map((item) => [item.q, item.a]));
      const crumbs = root["@graph"][4] as unknown as { itemListElement: Array<{ name: string }> };
      expect(crumbs.itemListElement.map((item) => item.name)).toEqual(subjectHubCrumbs(hub).map((crumb) => crumb.name));
      expect(JSON.stringify(root)).not.toMatch(/aggregateRating|"review"/);
    });
  }
});

describe("rehber sayfası çıktısı ve tek @graph", () => {
  for (const guide of GUIDE_LIST) {
    it(`${guide.path}`, () => {
      const html = renderToStaticMarkup(<GuidePage slug={guide.slug} />);
      const words = visibleWords(html);
      expect(words.slice(0, 100).join(" ")).toContain(guide.answer);
      expect((html.match(/<details/g) ?? []).length).toBe(3);
      expect((html.match(/class="xl-guide-step"/g) ?? []).length).toBe(guide.steps.length);
      for (const link of guide.related) expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain('href="/ornek"');
      expect(html).toContain('href="/kayit"');

      const root = graphOf(guideJsonLd(guide));
      expect(root["@graph"].map((node) => node["@type"])).toEqual([
        "Organization",
        "WebSite",
        "WebPage",
        "Article",
        "BreadcrumbList",
        "FAQPage",
      ]);
      const article = root["@graph"][3]!;
      expect(article.headline).toBe(guide.question);
      expect(String(article.headline).length).toBeLessThanOrEqual(110);
      expect(article.datePublished).toBe("2026-11-27");
      expect(article.image).toBe(`https://cortexplus.app${OG_IMAGE.url}`);
      const crumbs = root["@graph"][4] as unknown as { itemListElement: Array<{ name: string }> };
      expect(crumbs.itemListElement.map((item) => item.name)).toEqual(guideCrumbs(guide).map((crumb) => crumb.name));
    });
  }
});

describe("rotalar: başlık, kanonik, paylaşım görseli, yalnız tanımlı adresler", () => {
  it("ders rotası: sekiz adres, başka adres yok; her birinin başlığı ve kanoniği kendi verisinden", async () => {
    expect(subjectRoute.dynamicParams).toBe(false);
    expect(subjectRoute.generateStaticParams()).toEqual(SUBJECT_HUB_LINKS.map((link) => ({ ders: link.id })));
    for (const hub of SUBJECT_HUB_LIST) {
      const meta = (await subjectRoute.generateMetadata({ params: Promise.resolve({ ders: hub.id }) })) as {
        title: string;
        alternates: { canonical: string };
        openGraph: { images: unknown[] };
      };
      expect(meta.title).toBe(hub.metaTitle);
      expect(meta.alternates.canonical).toBe(`https://cortexplus.app${hub.path}`);
      expect(meta.openGraph.images[0]).toEqual(OG_IMAGE);
    }
    expect(await subjectRoute.generateMetadata({ params: Promise.resolve({ ders: "yok" }) })).toEqual({});
  });

  it("rehber rotası: altı adres, başka adres yok", async () => {
    expect(guideRoute.dynamicParams).toBe(false);
    expect(guideRoute.generateStaticParams()).toEqual(GUIDE_LINKS.map((link) => ({ konu: link.slug })));
    for (const guide of GUIDE_LIST) {
      const meta = (await guideRoute.generateMetadata({ params: Promise.resolve({ konu: guide.slug }) })) as {
        title: string;
        alternates: { canonical: string };
      };
      expect(meta.title).toBe(guide.metaTitle);
      expect(meta.alternates.canonical).toBe(`https://cortexplus.app${guide.path}`);
    }
  });

  it("dizin sayfaları: kendi kanoniği, bütün ders ve rehberlere bağlantı", () => {
    expect((subjectIndexMeta.alternates as { canonical: string }).canonical).toBe("https://cortexplus.app/ders");
    expect((guideIndexMeta.alternates as { canonical: string }).canonical).toBe("https://cortexplus.app/rehber");
    const subjects = renderToStaticMarkup(<SubjectIndex />);
    for (const link of SUBJECT_HUB_LINKS) expect(subjects).toContain(`href="${link.path}"`);
    const guides = renderToStaticMarkup(<GuideIndex />);
    for (const link of GUIDE_LINKS) expect(guides).toContain(`href="/rehber/${link.slug}"`);
  });
});

describe("site haritası, /llms.txt, /llms-full.txt ve iç bağlantılar", () => {
  it("16 yeni adres site haritasında ve sayfa listesinde; robots kapatmıyor; başlıklar sayfaların kendi başlığı", () => {
    const urls = sitemap().map((entry) => entry.url);
    const paths = ["/ders", ...SUBJECT_HUB_LIST.map((hub) => hub.path), "/rehber", ...GUIDE_LIST.map((guide) => guide.path)];
    expect(paths).toHaveLength(16);
    for (const path of paths) {
      expect(urls).toContain(`https://cortexplus.app${path}`);
      expect(isCrawlBlocked(path), path).toBe(false);
    }
    for (const hub of SUBJECT_HUB_LIST) expect(PUBLIC_PAGES.find((page) => page.path === hub.path)?.title).toBe(hub.metaTitle);
    for (const guide of GUIDE_LIST) expect(PUBLIC_PAGES.find((page) => page.path === guide.path)?.title).toBe(guide.metaTitle);
  });

  it("/llms.txt tam sürüme bağlanır", async () => {
    supabase.rows = LIVE_ROWS;
    const text = await (await llmsGet()).text();
    expect(text).toContain("(https://cortexplus.app/llms-full.txt)");
    for (const hub of SUBJECT_HUB_LIST) expect(text).toContain(`(https://cortexplus.app${hub.path})`);
  });

  it("/llms-full.txt: 200, düz metin; sınavlar, dersler, rehberler, sık sorulanlar, canlı fiyat ve bütün müfredat programları", async () => {
    supabase.rows = LIVE_ROWS;
    const response = await llmsFullGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    for (const heading of ["## Sınavlara göre hazırlık", "## Dersler", "## Rehberler", "## Sık sorulanlar", "## Resmî müfredat programları", "## Paketler"]) {
      expect(text).toContain(heading);
    }
    for (const landing of EXAM_LANDING_LIST) expect(text).toContain(`Adres: https://cortexplus.app${landing.path}`);
    for (const hub of SUBJECT_HUB_LIST) expect(text).toContain(subjectHubSummary(hub));
    for (const guide of GUIDE_LIST) expect(text).toContain(guide.answer);
    for (const program of CURRICULUM.programs) expect(text).toContain(`(https://cortexplus.app/mufredat/${program.id})`);
    expect(text).toContain("₺349");
    expect(text).toContain("₺1.999");
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it("/llms-full.txt fiyat okunamazsa fiyat uydurmaz", async () => {
    supabase.fail = true;
    const text = await (await llmsFullGet()).text();
    expect(text).not.toMatch(/₺\d/);
    expect(text).toContain("https://cortexplus.app/fiyatlandirma");
  });

  it("sınav sayfaları ilgili ders ve rehberlere bağlanır", async () => {
    supabase.rows = LIVE_ROWS;
    for (const landing of EXAM_LANDING_LIST) {
      const html = renderToStaticMarkup(await ExamLandingPage({ id: landing.id }));
      for (const id of landing.subjects) expect(html, landing.id).toContain(`href="/ders/${id}"`);
      for (const slug of landing.guides) expect(html, landing.id).toContain(`href="/rehber/${slug}"`);
    }
  });

  it("altbilgi ders ve rehber dizinlerine bağlanır; üst menü değişmedi", async () => {
    const actual = await vi.importActual<typeof import("@/components/parity/marketing")>("@/components/parity/marketing");
    const html = renderToStaticMarkup(<actual.ParitySiteFooter />);
    expect(html).toContain('href="/ders"');
    expect(html).toContain('href="/rehber"');
    expect(read("src/components/marketing/parity-site-header.tsx")).not.toMatch(/"\/ders|"\/rehber/);
  });

  it("mobil uygulamada ana sayfaya yönlenir; tarayıcıda dokunulmaz", () => {
    for (const path of ["/ders", "/ders/matematik", "/rehber", "/rehber/tyt-matematik-netleri-nasil-artar"]) {
      expect(nativePaymentDecision(path, "Mozilla/5.0 CortexPlusApp/1 (android)"), path).toEqual({ kind: "redirect", to: "/" });
      expect(nativePaymentDecision(path, "Mozilla/5.0 (Windows NT 10.0)"), path).toBeNull();
    }
  });

  it("yeni bileşenlerdeki her lp-/xl- sınıfının stili var", () => {
    const css = read("src/styles/landing.css") + read("src/styles/exam-landing.css");
    for (const file of [
      "src/components/marketing/subject-hub-page.tsx",
      "src/components/marketing/guide-page.tsx",
      "src/app/ders/page.tsx",
      "src/app/rehber/page.tsx",
    ]) {
      const classes = new Set(
        [...read(file).matchAll(/className=(?:"[^"]*"|\{[^}]*\})/g)].flatMap((match) => match[0].match(/\b(?:lp|xl)-[a-z0-9-]+/g) ?? []),
      );
      const missing = [...classes].filter((name) => !new RegExp(`\\.${name}(?![a-z0-9-])`).test(css));
      expect(missing, file).toEqual([]);
    }
  });
});
