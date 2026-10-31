import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/*
  Vitrin farkları (1 Kasım 2026): yeni bölümler 375 ve 1280 genişlikte görünür ve sayfa yatay taşmaz.
  VITRIN_SHOTS_DIR verilirse / ve /fiyatlandirma tam sayfa görüntüsü oraya kaydedilir.
*/

const PAGES: { path: string; testIds: string[] }[] = [
  { path: "/", testIds: ["advantage-showcase", "blind-proof", "advantage-badges", "advantage-comparison"] },
  { path: "/fiyatlandirma", testIds: ["pricing-advantage"] },
  { path: "/ozellikler", testIds: ["advantage-compact"] },
  { path: "/ornek", testIds: ["advantage-compact"] },
];

const WIDTHS = [375, 1280];
const SHOTS = process.env.VITRIN_SHOTS_DIR;

for (const width of WIDTHS) {
  for (const pageDef of PAGES) {
    test(`vitrin ${pageDef.path} @${width}px görünür ve taşmaz`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(pageDef.path, { waitUntil: "domcontentloaded" });
      for (const id of pageDef.testIds) {
        const el = page.getByTestId(id).first();
        await el.scrollIntoViewIfNeeded();
        await expect(el).toBeVisible();
        const box = await el.boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      const html = await page.content();
      expect(html).not.toMatch(/astra/i);
      if (SHOTS && (pageDef.path === "/" || pageDef.path === "/fiyatlandirma")) {
        fs.mkdirSync(SHOTS, { recursive: true });
        const name = pageDef.path === "/" ? "home" : "fiyatlandirma";
        await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: true });
      }
    });
  }
}
