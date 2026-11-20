import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { absoluteUrl, OG_IMAGE, pageMetadata, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  jsonLdString,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import { curriculumBreadcrumb } from "@/lib/seo/curriculum-breadcrumb";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ } from "@/lib/marketing/landing-content";
import { SITE_BASE } from "@/lib/curriculum/seo";
import sitemap from "@/app/sitemap";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** Çizilen betiğin içini ayrıştırır (kaçışlı < geçerli JSON'dur). */
function parseScripts(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
}

/* Faz 3 (20 Kasım 2026): sayfa başına kanonik adres ve paylaşım bilgisi, JSON-LD, site haritası. */

describe("sayfa başına metadata", () => {
  it("kanonik ve paylaşım adresi sayfanın kendisi; görsel açıkça yazılır", () => {
    const meta = pageMetadata({ title: "Özellikler", description: "Açıklama", path: "/ozellikler" });
    expect(meta.alternates?.canonical).toBe("https://cortexplus.app/ozellikler");
    expect(meta.title).toBe("Özellikler");
    const og = meta.openGraph as { url: string; title: string; images: unknown[]; locale: string; siteName: string };
    expect(og.url).toBe("https://cortexplus.app/ozellikler");
    expect(og.title).toBe("Özellikler | Cortex Plus");
    expect(og.locale).toBe("tr_TR");
    expect(og.siteName).toBe("Cortex Plus");
    // Sayfa openGraph verince kökteki görsel düşüyordu (Next.js bütün nesneyi değiştirir).
    expect(og.images).toEqual([OG_IMAGE]);
    const tw = meta.twitter as { card: string; title: string; images: string[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toEqual(["/twitter-image.png"]);
  });

  it("ana sayfa başlığı şablonsuz; kök adres sonda eğik çizgisiz", () => {
    const meta = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/", absoluteTitle: true });
    expect(meta.title).toEqual({ absolute: SITE_TITLE });
    expect(meta.alternates?.canonical).toBe(SITE_URL);
    expect((meta.openGraph as { title: string }).title).toBe(SITE_TITLE);
    expect(absoluteUrl("/mufredat/x/1?a=b#c")).toBe("https://cortexplus.app/mufredat/x/1");
    expect(absoluteUrl("")).toBe(SITE_URL);
  });

  it("taban adres tek kaynaktan (müfredat SEO yardımcısı ve kök düzen aynı değeri okur)", () => {
    expect(SITE_BASE).toBe(SITE_URL);
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("metadataBase: new URL(SITE_URL)");
    expect(layout).toContain("url: SITE_URL");
  });

  const PUBLIC_PAGES: Array<[string, string]> = [
    ["src/app/page.tsx", "/"],
    ["src/app/ozellikler/page.tsx", "/ozellikler"],
    ["src/app/fiyatlandirma/page.tsx", "/fiyatlandirma"],
    ["src/app/sinav-hazirligi/page.tsx", "/sinav-hazirligi"],
    ["src/app/yardim/page.tsx", "/yardim"],
    ["src/app/ornek/page.tsx", "/ornek"],
    ["src/app/mufredat/page.tsx", "/mufredat"],
    ["src/app/resmi/page.tsx", "/resmi"],
  ];

  it.each(PUBLIC_PAGES)("%s kanonik adresini pageMetadata ile yazar", (file, path) => {
    const source = read(file);
    expect(source).toContain("pageMetadata(");
    expect(source).toContain(`path: "${path}"`);
  });

  it("program, ünite ve kazanım sayfaları açıklama + kanonik adres + gezinme yolu verir", () => {
    const program = read("src/app/mufredat/[programId]/page.tsx");
    expect(program).toContain("path: `/mufredat/${program.id}`");
    expect(program).toMatch(/description: shortText\(`\$\{program\.label\}: \$\{program\.badge\} · \$\{program\.scope\}`/);
    expect(program).toContain("breadcrumbJsonLd(curriculumBreadcrumb({ program }))");
    const unit = read("src/app/mufredat/[programId]/[unitId]/page.tsx");
    expect(unit).toContain("path: unitPath(programId, hit.index)");
    expect(unit).toContain("breadcrumbJsonLd(curriculumBreadcrumb({ program, unit: { index, title } }))");
    const outcome = read("src/app/mufredat/[programId]/[unitId]/[outcomeId]/page.tsx");
    expect(outcome).toContain("path: outcomePath(programId, hit.index, hit.oIndex)");
    expect(outcome).toContain("robots: preview ? undefined : { index: false, follow: true }");
    expect(outcome).toContain("<JsonLd");
    expect(outcome).not.toContain('type="application/ld+json"');
  });

  it("noindex seçeneği yalnız verilince yazılır", () => {
    expect(pageMetadata({ title: "a", description: "b", path: "/a" }).robots).toBeUndefined();
    expect(pageMetadata({ title: "a", description: "b", path: "/a", robots: { index: false, follow: true } }).robots).toEqual({
      index: false,
      follow: true,
    });
  });
});

describe("JSON-LD", () => {
  it("ana sayfa: kurum, site ve sayfadaki sık sorulanlar; geçerli JSON, doğru türler", () => {
    const html = renderToStaticMarkup(
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          faqPageJsonLd(FAQ.map((item) => ({ question: item.q, answer: item.a }))),
        ]}
      />,
    );
    const [parsed] = parseScripts(html) as [Array<Record<string, unknown>>];
    expect(parsed.map((item) => item["@type"])).toEqual(["EducationalOrganization", "WebSite", "FAQPage"]);
    for (const item of parsed) expect(item["@context"]).toBe("https://schema.org");
    const [org, site, faq] = parsed as [Record<string, unknown>, Record<string, unknown>, { mainEntity: Array<Record<string, unknown>> }];
    expect(org.url).toBe(SITE_URL);
    expect(org.name).toBe("Cortex Plus");
    expect(org.logo).toBe("https://cortexplus.app/logo-mark-trim.png");
    // Uydurma yok: fiyat, puan, yorum, öğrenci sayısı yazılmaz.
    for (const key of ["aggregateRating", "review", "offers", "numberOfStudents", "priceRange"]) {
      expect(org).not.toHaveProperty(key);
      expect(site).not.toHaveProperty(key);
    }
    expect(site).not.toHaveProperty("potentialAction");
    expect(faq.mainEntity).toHaveLength(FAQ.length);
    expect(faq.mainEntity[0]).toEqual({
      "@type": "Question",
      name: FAQ[0]!.q,
      acceptedAnswer: { "@type": "Answer", text: FAQ[0]!.a },
    });
  });

  it("veri içindeki </script> betiği kapatmaz", () => {
    const data = faqPageJsonLd([{ question: "Soru </script><script>alert(1)</script>", answer: "A & B > C" }]);
    const html = renderToStaticMarkup(<JsonLd data={data} />);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(jsonLdString(data)).not.toMatch(/[<>&]/);
    const [parsed] = parseScripts(html) as [{ mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }];
    expect(parsed.mainEntity[0]!.name).toBe("Soru </script><script>alert(1)</script>");
    expect(parsed.mainEntity[0]!.acceptedAnswer.text).toBe("A & B > C");
  });

  it("yardım sayfası kendi sık sorulanlarını FAQPage olarak verir", () => {
    const page = read("src/app/yardim/page.tsx");
    expect(page).toContain("<JsonLd data={faqPageJsonLd(faqs)} />");
    // Görünen metin ve yapılandırılmış veri aynı diziden.
    expect(page).toContain("{faqs.map((faq) => (");
    const home = read("src/app/page.tsx");
    expect(home).toContain("faqPageJsonLd(FAQ.map((item) => ({ question: item.q, answer: item.a })))");
    expect(read("src/components/landing/landing-page.tsx")).toContain("{FAQ.map((item) => (");
  });

  it("müfredat gezinme yolu: sıra, adlar ve tam adresler", () => {
    const trail = curriculumBreadcrumb({
      program: { id: "lise-9-mat", label: "9. Sınıf Matematik" },
      unit: { index: 1, title: "Kümeler" },
      outcome: { index: 2, code: "M.9.2.1.3" },
    });
    expect(trail.map((step) => step.name)).toEqual(["Cortex Plus", "Resmî Müfredat", "9. Sınıf Matematik", "Kümeler", "M.9.2.1.3"]);
    const ld = breadcrumbJsonLd(trail) as unknown as {
      "@type": string;
      itemListElement: Array<{ position: number; item: string; name: string }>;
    };
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((step) => step.position)).toEqual([1, 2, 3, 4, 5]);
    expect(ld.itemListElement.map((step) => step.item)).toEqual([
      "https://cortexplus.app",
      "https://cortexplus.app/mufredat",
      "https://cortexplus.app/mufredat/lise-9-mat",
      "https://cortexplus.app/mufredat/lise-9-mat/2",
      "https://cortexplus.app/mufredat/lise-9-mat/2/3",
    ]);
    expect(curriculumBreadcrumb({ program: { id: "p", label: "P" } })).toHaveLength(3);
  });
});

describe("site haritası", () => {
  it("örnek çalışma ve resmî takvim sayfaları listede; adresler tek tabandan", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://cortexplus.app/ornek");
    expect(urls).toContain("https://cortexplus.app/resmi");
    expect(urls).toContain("https://cortexplus.app");
    expect(urls.every((url) => url.startsWith(SITE_URL))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
