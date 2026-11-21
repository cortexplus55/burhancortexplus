import { expect, test, type Page } from "@playwright/test";

/*
  El yazısı çözüm kontrolünün kartı (21 Kasım 2026, `teacher.v2`): `/e2e/ic-ekran?ekran=kontrol` (sentetik soru, işaret
  hatası 2. satırda, uzun bir son satır). Telefonda ve masaüstünde, koyu ve açık temada: yatay taşma yok, satır metni
  kendi kutusunda kırılır, düğmeler en az 44 px, yazılar okunur (≥ 4,5:1); doğru cevap "Doğrusunu göster"e kadar DOM'da
  yok, açılınca odak başlığa gider.
*/

async function readContrast(page: Page, selectors: string[]) {
  return page.evaluate((list) => {
    const parse = (value: string) => {
      const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    // Yarı saydam zeminleri ataların zeminiyle karıştırarak gerçek zemin rengini bulur.
    const background = (element: Element) => {
      const stack: { r: number; g: number; b: number; a: number }[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.a > 0) stack.push(color);
        if (color.a >= 1) break;
      }
      let base = { r: 255, g: 255, b: 255 };
      for (const layer of stack.reverse()) {
        base = {
          r: layer.r * layer.a + base.r * (1 - layer.a),
          g: layer.g * layer.a + base.g * (1 - layer.a),
          b: layer.b * layer.a + base.b * (1 - layer.a),
        };
      }
      return base;
    };
    const out: Record<string, number> = {};
    for (const selector of list) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const [x, y] = [lum(parse(getComputedStyle(element).color)), lum(background(element))].sort((m, n) => n - m);
      out[selector] = Math.round(((x! + 0.05) / (y! + 0.05)) * 100) / 100;
    }
    return out;
  }, selectors);
}

for (const theme of ["dark", "light"] as const) {
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    test(`çözüm kontrolü kartı ${theme === "dark" ? "koyu" : "açık"} ${size.width} px`, { tag: ["@public"] }, async ({ page }) => {
      await page.addInitScript((value) => {
        try {
          window.localStorage.setItem("theme", value);
        } catch {
          /* yok */
        }
      }, theme);
      await page.setViewportSize(size);
      await page.goto("/e2e/ic-ekran?ekran=kontrol");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme === "dark" ? "\\bdark\\b" : "\\blight\\b"));
      const card = page.locator(".cp-solver-check");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.locator(".cp-solver-check-lines li")).toHaveCount(5);
      await expect(card.locator('.cp-solver-check-lines li[data-first]')).toContainText("2x = 19 + 7");
      await expect(page.locator(".cp-solver-answer")).toHaveCount(0);

      const layout = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        lines: [...document.querySelectorAll(".cp-solver-check-text")].map((node) => node.scrollWidth - node.clientWidth),
        card: (() => {
          const box = document.querySelector(".cp-solver-check-card")!.getBoundingClientRect();
          return { left: box.left, right: box.right, width: window.innerWidth };
        })(),
      }));
      expect(layout.page).toBeLessThanOrEqual(1);
      expect(Math.max(...layout.lines)).toBeLessThanOrEqual(1);
      expect(layout.card.left).toBeGreaterThanOrEqual(0);
      expect(layout.card.right).toBeLessThanOrEqual(layout.card.width);

      for (const name of [/Doğrusunu göster/, /Hatamı Öğretmenle Bulayım/]) {
        const box = await page.getByRole(name.source.startsWith("Hatamı") ? "link" : "button", { name }).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      const contrast = await readContrast(page, [
        ".cp-solver-check-badge",
        ".cp-solver-check-explain",
        ".cp-solver-check-question",
        ".cp-solver-check-lines li[data-first] .cp-solver-check-text",
        ".cp-solver-check-lines li[data-first] .cp-solver-check-note",
        ".cp-solver-check-lines li[data-status='ok'] .cp-solver-check-text",
      ]);
      for (const [selector, ratio] of Object.entries(contrast)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `test-results/foto-kontrol-${theme}-${size.width}.png`, fullPage: true });

      // İlk derlemede düğme hidrasyondan önce çizilmiş olabilir: açılana kadar yeniden bas.
      const heading = page.getByRole("heading", { name: "Doğru çözüm" });
      await expect(async () => {
        const reveal = page.getByRole("button", { name: /Doğrusunu göster/ });
        if (await reveal.count()) await reveal.click();
        await expect(heading).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 30_000 });
      await expect(heading).toBeFocused();
      await expect(page.locator(".cp-solver-answer")).toBeVisible();
      await expect(page.locator(".cp-solver-answer-value")).toHaveText("B) 6");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}
