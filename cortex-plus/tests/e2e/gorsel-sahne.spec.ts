import { expect, test } from "@playwright/test";

/*
  Faz 1-B (19 Kasım 2026; 20 Kasım 2026 kavram yapısıyla yedi): arketipler ders ekranında ve 5 sahneli akış oynatıcıda, gerçek tarayıcıda. Sayfa yatay
  taşmaz; görünen her SVG'de her yazının ölçülen kutusu çizim alanının içindedir ve yazılar üst üste binmez.
*/

const WIDTHS = [390, 1280] as const;
const ARCHETYPES = [
  "MEDICAL_BIOLOGY_PATHWAY",
  "ENGINEERING_PHYSICS_MECHANICS",
  "ARCHITECTURE_SPATIAL_BLUEPRINT",
  "LAW_SOCIAL_FLOWCHART",
  "MATH_ALGORITHMIC_GRAPH",
  "DOCUMENT_FIGURE_SPOTLIGHT",
  "CONCEPT_STRUCTURE_VISUALIZER",
] as const;

async function svgTextIssues(page: import("@playwright/test").Page) {
  // Ölçüm yazı tipi yüklendikten sonra (yedek yazı tipinin genişliği farklı).
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.evaluate(() => {
    const issues: string[] = [];
    const svgs = [...document.querySelectorAll("svg.cp-vs")].filter((svg) => (svg as unknown as HTMLElement).getBoundingClientRect().width > 0);
    for (const svg of svgs) {
      const vb = (svg as SVGSVGElement).viewBox.baseVal;
      const boxes = [...svg.querySelectorAll("text")]
        .filter((el) => (el.textContent ?? "").trim().length > 0 && !el.closest("[aria-hidden='true'] defs"))
        .map((el) => ({ text: el.textContent ?? "", box: (el as SVGTextElement).getBBox(), group: el.closest("[data-text-block]") }));
      for (const { text, box } of boxes) {
        if (box.x < vb.x - 1 || box.y < vb.y - 1 || box.x + box.width > vb.x + vb.width + 1 || box.y + box.height > vb.y + vb.height + 1) {
          issues.push(`taşma: ${text}`);
        }
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!.box;
          const b = boxes[j]!.box;
          const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          if (w > 2 && h > 2) issues.push(`çakışma: ${boxes[i]!.text} / ${boxes[j]!.text}`);
        }
      }
    }
    // Rozet yazısı rozetin ortasında (dolgusu bir önceki kardeş dikdörtgen).
    for (const svg of svgs) {
      const text = svg.querySelector("text[data-text-id='badge']");
      const pill = text?.previousElementSibling;
      if (!text || !pill || pill.tagName !== "rect") continue;
      const t = (text as SVGTextElement).getBBox();
      const r = (pill as SVGRectElement).getBBox();
      // Küçük ölçekte tarayıcı glif genişliklerini yuvarlar: rozet genişliğinin %3ü pay.
      if (Math.abs(t.x + t.width / 2 - (r.x + r.width / 2)) > Math.max(1.5, r.width * 0.03)) issues.push(`rozet ortalı değil: ${text.textContent} ${(t.x + t.width / 2).toFixed(1)} / ${(r.x + r.width / 2).toFixed(1)}`);
    }
    return { count: svgs.length, issues };
  });
}

for (const width of WIDTHS) {
  test(`görsel sahne: yedi arketip ders ekranında ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/gorsel-sahne?mod=ders");
    await expect(page.locator("[data-fixture-archetype]")).toHaveCount(ARCHETYPES.length);
    await expect(page.locator("[data-fixture-concept]")).toHaveCount(5);
    const m = await svgTextIssues(page);
    // Yedi arketip + kavram yapısının öbür beş biçimi + eğilim sahnesi.
    expect(m.count).toBe(ARCHETYPES.length + 5 + 1);
    const trend = (await page.locator("[data-fixture-trend] svg.cp-vs").filter({ visible: true }).first().textContent()) ?? "";
    expect(trend).toContain("EĞİLİM VE YÖN DİYAGRAMI");
    expect(trend).not.toMatch(/KUVVET|FORMÜLÜN/);
    expect(trend).toContain("soldan sağa: azalır");
    expect(trend).not.toContain("…");
    expect(m.issues).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test(`görsel sahne: 5 sahneli akış oynatıcıda ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (let sahne = 0; sahne < 5; sahne += 1) {
      await page.goto(`/e2e/gorsel-sahne?mod=video&sahne=${sahne}`);
      await expect(page.locator(".cp-video-reel svg.cp-vs")).toHaveCount(1);
      expect((await svgTextIssues(page)).issues, `sahne ${sahne} 9:16`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: /Yatay \(16:9\)/ }).click();
      await expect(page.locator(".cp-video-reel svg.cp-vs[data-mode='16:9']")).toHaveCount(1);
      expect((await svgTextIssues(page)).issues, `sahne ${sahne} 16:9`).toEqual([]);
    }
  });

  test(`görsel sahne: ana çizim sahnesi yedi arketiple, iki oranda ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const arketip of ARCHETYPES) {
      await page.goto(`/e2e/gorsel-sahne?mod=video&sahne=1&arketip=${arketip}`);
      await expect(page.locator(`.cp-video-reel svg.cp-vs[data-archetype='${arketip}']`)).toHaveCount(1);
      for (const ratio of ["9:16", "16:9"]) {
        if (ratio === "16:9") await page.getByRole("button", { name: /Yatay \(16:9\)/ }).click();
        await expect(page.locator(`.cp-video-reel svg.cp-vs[data-mode='${ratio}']`)).toHaveCount(1);
        const m = await svgTextIssues(page);
        expect(m.issues, `${arketip} ${ratio}`).toEqual([]);
      }
    }
  });
}
