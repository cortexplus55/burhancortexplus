import { expect, test } from "@playwright/test";

/**
 * Ders ve rehber sayfaları (27 Kasım 2026, SEO ve GEO). Tarayıcı açmadan ilk sunucu HTML'i: 200, tek geçerli JSON-LD
 * `@graph`, kanonik adres, gerçek 200 dönen paylaşım görseli, tanımın ya da doğrudan cevabın üst menü dahil ilk 100
 * görünür kelimede bitmesi, SSS cevaplarının tıklamadan HTML'de olması; `/llms-full.txt` ve site haritası. Sonra tarayıcıda
 * 375 ve 1280 px: yana taşma yok, birincil düğme ve SSS görünür, dokunma hedefleri en az 44 px.
 */

const UA = "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)";

const SUBJECTS = ["matematik", "kimya", "fizik", "biyoloji", "turkce", "tarih", "cografya", "ingilizce"];
const GUIDES = [
  "ders-notundan-calisma-programi-nasil-yapilir",
  "tyt-matematik-netleri-nasil-artar",
  "ayt-kimya-calisma-sirasi-ve-konulari",
  "vize-haftasi-slayt-ozetleme-taktikleri",
  "gece-ders-calisirken-takilan-soru-cozumu",
  "sinav-hazirlik-uygulamasi-nasil-secilir",
];

function visibleWords(html: string): string[] {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split(/\s+/)
    .filter(Boolean);
}

type Root = {
  "@context": string;
  "@graph": Array<{ "@type": string; "@id"?: string; mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> }>;
};

async function checkPage(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  marker: string,
  types: string[],
  faqCount: number,
) {
  const response = await request.get(path, { headers: { "user-agent": UA } });
  expect(response.status(), path).toBe(200);
  const html = await response.text();

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  expect(blocks, path).toHaveLength(1);
  const root = JSON.parse(blocks[0]!) as Root;
  expect(root["@context"]).toBe("https://schema.org");
  expect(root["@graph"].map((node) => node["@type"])).toEqual(expect.arrayContaining(types));
  const ids = root["@graph"].flatMap((node) => (node["@id"] ? [node["@id"]] : []));
  expect(new Set(ids).size).toBe(ids.length);
  expect(blocks[0]).not.toMatch(/aggregateRating|"review"/);

  expect(html).toContain(`<link rel="canonical" href="https://cortexplus.app${path}"/>`);
  const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  expect(og, path).toBeTruthy();
  const image = await request.get(new URL(og!).pathname);
  expect(image.status()).toBe(200);

  // Tanım ya da doğrudan cevap: üst menü dahil ilk 100 görünür kelimede biter.
  const raw = new RegExp(`<p[^>]*${marker}[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1] ?? "";
  const lead = visibleWords(raw).join(" ");
  expect(lead.split(" ").length, path).toBeGreaterThan(20);
  const words = visibleWords(html);
  expect(words.slice(0, 100).join(" "), path).toContain(lead);

  if (faqCount) {
    const faq = root["@graph"].find((node) => node["@type"] === "FAQPage")!;
    expect(faq.mainEntity!.length, path).toBe(faqCount);
    const text = words.join(" ");
    for (const item of faq.mainEntity!) {
      expect(text, item.name).toContain(item.name);
      expect(text, item.name).toContain(item.acceptedAnswer.text.split(/\s+/).slice(0, 8).join(" "));
    }
    expect((html.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(faqCount);
  }
  expect(html).toContain('href="/ornek"');
  return html;
}

test.describe("Ders ve rehber sayfaları: ilk sunucu HTML'i", { tag: ["@public"] }, () => {
  for (const id of SUBJECTS) {
    test(`/ders/${id}`, async ({ request }) => {
      const html = await checkPage(request, `/ders/${id}`, "data-subject-definition", ["LearningResource", "FAQPage", "BreadcrumbList"], 5);
      expect(html).toMatch(/href="\/mufredat\/[a-z0-9-]+"/);
      expect(html).toContain('href="/kayit"');
    });
  }
  for (const slug of GUIDES) {
    test(`/rehber/${slug}`, async ({ request }) => {
      const html = await checkPage(request, `/rehber/${slug}`, "data-guide-answer", ["Article", "FAQPage", "BreadcrumbList"], 3);
      expect(html).toMatch(/href="\/(ders\/[a-z]+|[a-z]+-hazirlik)"/);
    });
  }
  test("/ders ve /rehber dizinleri", async ({ request }) => {
    const subjects = await checkPage(request, "/ders", "data-product-definition", ["CollectionPage", "BreadcrumbList"], 0);
    for (const id of SUBJECTS) expect(subjects).toContain(`href="/ders/${id}"`);
    const guides = await checkPage(request, "/rehber", "data-product-definition", ["CollectionPage", "BreadcrumbList"], 0);
    for (const slug of GUIDES) expect(guides).toContain(`href="/rehber/${slug}"`);
  });

  test("tanımsız ders ve rehber adresi 404", async ({ request }) => {
    expect((await request.get("/ders/astronomi")).status()).toBe(404);
    expect((await request.get("/rehber/yok-boyle-bir-rehber")).status()).toBe(404);
  });

  test("/llms-full.txt, /llms.txt bağlantısı ve site haritası", async ({ request }) => {
    const full = await request.get("/llms-full.txt");
    expect(full.status()).toBe(200);
    expect(full.headers()["content-type"]).toBe("text/plain; charset=utf-8");
    const text = await full.text();
    expect(text.startsWith("# Cortex Plus — tam bilgi")).toBe(true);
    for (const id of SUBJECTS) expect(text).toContain(`Adres: https://cortexplus.app/ders/${id}`);
    for (const slug of GUIDES) expect(text).toContain(`Adres: https://cortexplus.app/rehber/${slug}`);
    expect((text.match(/\(https:\/\/cortexplus\.app\/mufredat\/[a-z0-9-]+\)/g) ?? []).length).toBeGreaterThanOrEqual(150);
    expect(await (await request.get("/llms.txt")).text()).toContain("(https://cortexplus.app/llms-full.txt)");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/ders", ...SUBJECTS.map((id) => `/ders/${id}`), "/rehber", ...GUIDES.map((slug) => `/rehber/${slug}`)]) {
      expect(sitemap).toContain(`<loc>https://cortexplus.app${path}</loc>`);
    }
  });
});

test.describe("Ders ve rehber sayfaları: telefon ve masaüstü", { tag: ["@public"] }, () => {
  const PAGES = [
    "/ders",
    ...SUBJECTS.map((id) => `/ders/${id}`),
    "/rehber",
    ...GUIDES.map((slug) => `/rehber/${slug}`),
  ];
  for (const width of [375, 1280]) {
    test(`${width} px: 16 sayfada taşma yok, dokunma hedefleri en az 44 px`, async ({ page }) => {
      test.setTimeout(30_000 + PAGES.length * 12_000);
      await page.setViewportSize({ width, height: width < 768 ? 812 : 800 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator("h1"), path).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
        for (const link of await page.locator(".xl-scope-links a, .xl-exams a, .xl-programs a, .xl-crumbs a").all()) {
          const box = await link.boundingBox();
          if (box) expect(box.height, `${path}: ${await link.textContent()}`).toBeGreaterThanOrEqual(44);
        }
        const details = page.locator(".lp-faq--answer details");
        if (path.startsWith("/ders/")) await expect(details, path).toHaveCount(5);
        if (path.startsWith("/rehber/")) await expect(details, path).toHaveCount(3);
      }
    });
  }
});
