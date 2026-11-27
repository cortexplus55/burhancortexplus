import { expect, test } from "@playwright/test";
import { PRODUCT_DEFINITION } from "../../src/lib/marketing/product-definition";

/**
 * GEO (27 Kasım 2026): yapay zekâ aramalarının çoğu JavaScript çalıştırmaz. Burada tarayıcı açılmaz; sayfanın ilk sunucu
 * HTML'i (`request.get`) okunur: geçerli JSON-LD (`JSON.parse`, tek `@graph`), kanonik adres ve ilk 100 kelimede ürünün
 * tanımı. Ayrıca `/robots.txt` ve `/llms.txt` çıktıları.
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

test.describe("GEO: ilk sunucu HTML'i", { tag: ["@public"] }, () => {
  for (const [path, canonical] of [
    ["/", "https://cortexplus.app"],
    ["/ozellikler", "https://cortexplus.app/ozellikler"],
    ["/fiyatlandirma", "https://cortexplus.app/fiyatlandirma"],
    ["/mufredat", "https://cortexplus.app/mufredat"],
    ["/ornek", "https://cortexplus.app/ornek"],
  ] as const) {
    test(`${path}: geçerli @graph, kanonik adres, ilk 100 kelimede ürünün tanımı`, async ({ request }) => {
      const response = await request.get(path, { headers: { "user-agent": UA } });
      expect(response.status()).toBe(200);
      const html = await response.text();

      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      expect(blocks).toHaveLength(1);
      const root = JSON.parse(blocks[0]!) as { "@context": string; "@graph": Array<{ "@type": string; "@id"?: string }> };
      expect(root["@context"]).toBe("https://schema.org");
      const types = root["@graph"].map((node) => node["@type"]);
      expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
      const ids = root["@graph"].flatMap((node) => (node["@id"] ? [node["@id"]] : []));
      expect(new Set(ids).size).toBe(ids.length);
      if (path === "/" || path === "/fiyatlandirma") {
        expect(types).toEqual(expect.arrayContaining(["SoftwareApplication", "FAQPage"]));
        expect(blocks[0]).not.toMatch(/aggregateRating|"review"/);
      }
      if (path === "/ozellikler") expect(types).toContain("FAQPage");
      if (path === "/mufredat") expect(types).toEqual(expect.arrayContaining(["CollectionPage", "BreadcrumbList"]));

      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);

      // Tanımın ilk kelimeleri (ilk 12 kelime) görünür metnin ilk 100 kelimesinde başlar.
      const words = visibleWords(html);
      const head = PRODUCT_DEFINITION.split(/\s+/).slice(0, 12).join(" ");
      const first = words.slice(0, 100).join(" ");
      expect(first, `${path}: ${first}`).toContain(head.split(" ").slice(0, 6).join(" "));
      // Tanımın tamamı sunucu HTML'inde, gizli değil.
      expect(words.join(" ")).toContain(PRODUCT_DEFINITION);
    });
  }

  test("SSS cevapları tıklamadan ilk HTML'de: ana sayfa, Özellikler, Fiyatlandırma", async ({ request }) => {
    for (const path of ["/", "/ozellikler", "/fiyatlandirma"]) {
      const html = await (await request.get(path, { headers: { "user-agent": UA } })).text();
      const root = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
        "@graph": Array<{ "@type": string; mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> }>;
      };
      const faq = root["@graph"].find((node) => node["@type"] === "FAQPage")!;
      expect(faq.mainEntity!.length, path).toBeGreaterThanOrEqual(4);
      const text = visibleWords(html).join(" ");
      for (const item of faq.mainEntity!) {
        expect(text, `${path}: ${item.name}`).toContain(item.name);
        expect(text, `${path}: ${item.name}`).toContain(item.acceptedAnswer.text.split(/\s+/).slice(0, 8).join(" "));
      }
      expect((html.match(/<details/g) ?? []).length, path).toBeGreaterThanOrEqual(faq.mainEntity!.length);
    }
  });

  test("/robots.txt: yapay zekâ tarayıcıları açık, özel yollar kapalı, harita satırı", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    for (const bot of ["OAI-SearchBot", "ChatGPT-User", "GPTBot", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Googlebot", "Google-Extended", "Applebot"]) {
      expect(text).toMatch(new RegExp(`User-Agent: ${bot}\\n`));
    }
    for (const path of ["/admin", "/api/", "/pay", "/ayarlar", "/ogretmen", "/giris", "/kayit"]) {
      expect(text.match(new RegExp(`Disallow: ${path.replace(/\//g, "\\/")}\\n`, "g")) ?? [], path).toHaveLength(2);
    }
    expect(text).toContain("Sitemap: https://cortexplus.app/sitemap.xml");
  });

  test("/llms.txt: girişsiz 200, düz metin, tam adresler", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    expect(text.startsWith("# Cortex Plus")).toBe(true);
    expect(text).toContain(PRODUCT_DEFINITION);
    const links = [...text.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThanOrEqual(9);
    // Sayfa adresleri ve tam sürüm metin dosyası (/llms-full.txt, 27 Kasım 2026).
    for (const url of links) expect(url).toMatch(/^https:\/\/cortexplus\.app((\/[a-z0-9-]+)*|\/llms-full\.txt)$/);
  });
});
