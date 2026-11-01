import { expect, test, type Page } from "@playwright/test";

/*
  Mobil yerleşim (1 Kasım 2026): 375 px'te akış şeması harf harf dikey kırılıyor, tablo sağdan
  taşıyordu. Hiçbir öğe görüş alanını aşmaz; akış adımlarının metin kutusu ≥ 60 px genişliktedir.
*/

async function openFirstScreen(page: Page) {
  await page.goto("/e2e/ders-mobil");
  const start = page.getByRole("button", { name: /Devam et|Başla/ }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.locator(".als-flow")).toBeVisible();
}

for (const width of [360, 375, 414]) {
  test(`ders ekranı ${width} px: yana taşma yok, akış adımları okunur @public`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openFirstScreen(page);
    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const pageOverflow = document.documentElement.scrollWidth - vw;
      const offenders: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        // Kendi kutusunda kayan tablonun içi sayılmaz; kutunun kendisi sayılır.
        if (el.closest(".als-reference-table-scroll") && !el.classList.contains("als-reference-table-scroll")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.position === "fixed" || style.visibility === "hidden") continue;
        if (rect.right > vw + 1 || rect.left < -1) offenders.push(`${el.tagName}.${el.className}`.slice(0, 80));
      }
      const narrow = Array.from(document.querySelectorAll<HTMLElement>(".als-flow-text, .als-flow-title, .als-flow-detail"))
        .map((el) => el.getBoundingClientRect().width)
        .filter((w) => w < 60);
      return { pageOverflow, offenders: offenders.slice(0, 10), narrow };
    });
    expect(report.pageOverflow).toBeLessThanOrEqual(0);
    expect(report.offenders).toEqual([]);
    expect(report.narrow).toEqual([]);
  });
}

test("akış şeması 375 px'te alt alta numaralı liste; tablo kendi kutusunda kayar @public", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openFirstScreen(page);
  const steps = page.locator(".als-flow-step");
  await expect(steps).toHaveCount(4);
  const boxes = await steps.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  for (let i = 1; i < boxes.length; i += 1) expect(boxes[i]!).toBeGreaterThan(boxes[i - 1]!);
  await expect(page.getByText("İfadelerin doğruluk değerlerini kullan")).toBeVisible();
  const table = page.locator(".als-reference-table-scroll");
  const fits = await table.evaluate((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1);
  expect(fits).toBe(true);
  // Tablonun altı bir sonraki bloğun üstüne binmez.
  const gap = await page.evaluate(() => {
    const t = document.querySelector(".als-reference-table")!.getBoundingClientRect();
    const d = document.querySelector(".als-diagram-card")!.getBoundingClientRect();
    return d.top - t.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});
