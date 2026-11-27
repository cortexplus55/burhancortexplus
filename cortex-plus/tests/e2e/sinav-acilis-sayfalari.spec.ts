import { expect, test } from "@playwright/test";
import { EXAM_LANDING_LIST, examLandingSummary } from "../../src/lib/marketing/exam-landings";

/**
 * Sınav açılış sayfaları (27 Kasım 2026, SEO ve GEO). Önce tarayıcı açmadan ilk sunucu HTML'i (`request.get`): 200, tek
 * geçerli JSON-LD `@graph` (FAQPage + BreadcrumbList), kanonik adres, gerçek 200 dönen paylaşım görseli, iki cümlelik
 * tanımın ilk 100 görünür kelimede bitmesi ve SSS cevaplarının tıklamadan HTML'de olması; site haritası ve `/llms.txt`.
 * Sonra tarayıcıda 375 ve 1280 px: yana taşma yok, birincil düğme ve SSS görünür, dokunma hedefi en az 44 px.
 */

const UA = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";

/** Görünür metin: head, betik, stil ve SVG atılır; etiketler boşluğa döner. */
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

test.describe("Sınav açılış sayfaları: ilk sunucu HTML'i", { tag: ["@public"] }, () => {
  for (const landing of EXAM_LANDING_LIST) {
    test(`${landing.path}: 200, tek @graph, kanonik, paylaşım görseli, tanım ilk 100 kelimede`, async ({ request }) => {
      const response = await request.get(landing.path, { headers: { "user-agent": UA } });
      expect(response.status()).toBe(200);
      const html = await response.text();

      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      expect(blocks).toHaveLength(1);
      const root = JSON.parse(blocks[0]!) as {
        "@context": string;
        "@graph": Array<{ "@type": string; "@id"?: string; mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> }>;
      };
      expect(root["@context"]).toBe("https://schema.org");
      const types = root["@graph"].map((node) => node["@type"]);
      expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "WebPage", "BreadcrumbList", "FAQPage"]));
      const ids = root["@graph"].flatMap((node) => (node["@id"] ? [node["@id"]] : []));
      expect(new Set(ids).size).toBe(ids.length);
      expect(blocks[0]).not.toMatch(/aggregateRating|"review"/);

      const canonical = `https://cortexplus.app${landing.path}`;
      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);
      expect(html).toContain(`<title>${landing.metaTitle.replace(/'/g, "&#x27;")} | Cortex Plus</title>`);
      expect(html).toContain(`<meta property="og:url" content="${canonical}"/>`);

      const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      expect(og).toBeTruthy();
      const image = await request.get(new URL(og!).pathname);
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toContain("image/");

      // İki cümlelik tanımın tamamı görünür metnin ilk 100 kelimesinde biter (üst menü dahil).
      const words = visibleWords(html);
      const first = words.slice(0, 100).join(" ");
      expect(first, `${landing.path}: ${first}`).toContain(examLandingSummary(landing));

      // SSS: dört soru, cevaplar tıklamadan HTML'de; yapılandırılmış veri sayfadakinin aynısı.
      const faq = root["@graph"].find((node) => node["@type"] === "FAQPage")!;
      expect(faq.mainEntity!.map((item) => item.name)).toEqual(landing.faq.map((item) => item.q));
      const text = words.join(" ");
      for (const item of landing.faq) {
        expect(text, item.q).toContain(item.q);
        expect(text, item.q).toContain(item.a.split(/\s+/).slice(0, 10).join(" "));
      }
      expect((html.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(4);

      // İç bağlantılar: müfredat ve kayıtsız örnek ders.
      expect(html).toContain('href="/ornek"');
      expect(html).toMatch(/href="\/mufredat\/[a-z0-9-]+"/);
    });
  }

  test("site haritası ve /llms.txt dört adresi tam adresle verir", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const llms = await request.get("/llms.txt");
    expect(llms.status()).toBe(200);
    const llmsText = await llms.text();
    for (const landing of EXAM_LANDING_LIST) {
      expect(sitemap).toContain(`<loc>https://cortexplus.app${landing.path}</loc>`);
      expect(llmsText).toContain(`(https://cortexplus.app${landing.path})`);
    }
  });

  test("ana sayfanın altbilgisinden tek tıkta ulaşılır", async ({ request }) => {
    const html = await (await request.get("/")).text();
    for (const landing of EXAM_LANDING_LIST) expect(html).toContain(`href="${landing.path}"`);
  });
});

test.describe("Sınav açılış sayfaları: telefon ve masaüstü", { tag: ["@public"] }, () => {
  for (const width of [375, 1280]) {
    for (const landing of EXAM_LANDING_LIST) {
      test(`${landing.path} ${width} px: taşma yok, düğme ve SSS görünür`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 800 });
        await page.goto(landing.path);
        await expect(page.locator("[data-exam-definition]")).toBeVisible();
        const cta = page.locator(".xl-hero").getByRole("link", { name: /Ücretsiz başla/ });
        await expect(cta).toBeVisible();
        const box = await cta.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await expect(page.locator(".lp-faq--answer details")).toHaveCount(4);
        for (const link of await page.locator(".xl-programs a, .xl-exams a").all()) {
          const linkBox = await link.boundingBox();
          expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }
});
