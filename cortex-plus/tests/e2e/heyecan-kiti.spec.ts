import { expect, test } from "@playwright/test";

/*
  Faz 4A: heyecan kiti galerisi (/arena; üretimde 404). Üç genişlik × hareket azaltma açık/kapalı: taşma yok, dokunma
  hedefleri ≥ 40 (telefonda 44), bot rozeti ve özetler, geri sayım hareket azaltmada beklemeden biter.
*/

const WIDTHS = [1280, 768, 375] as const;

for (const width of WIDTHS) {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`galeri ${width} px · ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto("/arena");
      await expect(page.getByRole("heading", { name: "Heyecan kiti" })).toBeVisible();
      await expect(page.getByRole("img", { name: "Sen 6, Atlas 5, Arkadaşın 4" })).toBeVisible();
      await expect(page.getByText("BOT", { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: /doğru, \d+ yanlış/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const min = width < 768 ? 44 : 40;
      const small = await page.evaluate((limit) => {
        return [...document.querySelectorAll("button")]
          .map((el) => el.getBoundingClientRect())
          .filter((box) => box.width > 0 && Math.min(box.width, box.height) < limit).length;
      }, min);
      expect(small).toBe(0);
      await page.getByRole("button", { name: "Geri sayım" }).click();
      if (reducedMotion === "reduce") {
        await expect(page.getByTestId("launch-done")).toHaveText("bitti");
      } else {
        await expect(page.getByTestId("launch-done")).toHaveText("bitti", { timeout: 5000 });
      }
    });
  }
}
