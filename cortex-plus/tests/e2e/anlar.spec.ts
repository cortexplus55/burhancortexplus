import { expect, test, type Page } from "@playwright/test";

/*
  Anlar (his katmanı), 13 Kasım 2026, ürün sahibinin kararı. Misafir ana sayfasının turu (A1–A4) ve uygulamanın içi
  (B1–B2). Her an en çok 2,5 sn, tıklama ya da tuş atlar, hareket azaltmada oynamaz (depo kararı 11).
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
] as const;

async function goStep(page: Page, at: number) {
  await page.getByRole("button", { name: new RegExp(`^Adım ${at}: `) }).click();
}

for (const size of SIZES) {
  test(`A1 ${size.width} px: sahne yedi adımda aynı yükseklikte, alt düğme ekranda, uzun adımda yalnız gövde kayar`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const stage = page.locator(".lj-stage");
    await expect(stage).toBeVisible();
    const heights: number[] = [];
    for (let at = 1; at <= 7; at += 1) {
      await goStep(page, at);
      if (at >= 3 && at <= 6) await expect(page.locator(".tp-app")).toBeVisible({ timeout: 30_000 });
      await expect(stage).toHaveAttribute("data-step", /.+/);
      // Adım değişince ilerleme rayı sabit menünün hemen altına hizalanır (1. adım ilk çizim, kaydırılmaz); yumuşak
      // kaydırma bitene kadar beklenir.
      if (at > 1) {
        await expect
          .poll(() =>
            page.evaluate(
              () => document.querySelector(".lj-rail")!.getBoundingClientRect().top - document.querySelector("header.mkh")!.getBoundingClientRect().bottom,
            ),
          )
          .toBeLessThanOrEqual(12);
      }
      const m = await page.evaluate(() => {
        const box = document.querySelector(".lj-stage")!.getBoundingClientRect();
        const foot = document.querySelector(".lj-stage-foot")?.getBoundingClientRect() ?? null;
        const header = document.querySelector("header.mkh")!.getBoundingClientRect().bottom;
        const rail = document.querySelector(".lj-rail")!.getBoundingClientRect().top;
        return {
          height: Math.round(box.height),
          footInView: foot ? foot.top >= 0 && foot.bottom <= innerHeight : true,
          railGap: rail - header,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      heights.push(m.height);
      expect(m.footInView, `adım ${at}: alt düğme ekranda`).toBe(true);
      expect(m.pageOverflow).toBeLessThanOrEqual(1);
      if (at > 1) expect(m.railGap).toBeGreaterThanOrEqual(-1);
    }
    expect(new Set(heights).size, `yükseklikler: ${heights.join(", ")}`).toBe(1);
    // Plus adımı her genişlikte sahneden uzun: sayfa değil gövde kayar.
    const scroll = await page.evaluate(() => {
      const body = document.querySelector(".lj-stage-body")!;
      return { scrollable: body.scrollHeight > body.clientHeight + 4, overflowY: getComputedStyle(body).overflowY };
    });
    expect(scroll).toEqual({ scrollable: true, overflowY: "auto" });
  });
}
