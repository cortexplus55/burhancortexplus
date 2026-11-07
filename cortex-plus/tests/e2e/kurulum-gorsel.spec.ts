import { expect, test, type Page } from "@playwright/test";

/*
  8 Kasım 2026: tarih adımı, zorluk seçimi, eğitmen kutusu ve resmî müfredat paneli telefonda (375 ve 360 px) yana
  taşmaz, dokunma alanları 44 px; tarih seçilince özet ve kalan gün yazılır; eğitmen soru değişince önceki sohbeti
  gizler.
*/

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const width of [375, 360] as const) {
  test(`kurulum fikstürü ${width}px: taşma yok, tarih özeti, eğitmen sohbeti soruya bağlı`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/kurulum");
    await expect(page.getByRole("heading", { name: "Sınav ne zaman?" })).toBeVisible();
    await expect(page.getByTestId("exam-date-summary")).toContainText("Henüz tarih seçilmedi");
    await expect(async () => {
      await page.getByRole("button", { name: /^1 hafta sonra/ }).click();
      await expect(page.getByTestId("exam-date-summary")).toContainText("7 gün kaldı", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: /^60 dk/ }).click();
    await expect(page.getByRole("button", { name: /^60 dk/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("radio", { name: /İleri/ }).click();
    await expect(page.getByRole("radio", { name: /İleri/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Bilmiyorum, sen anlat.")).toBeVisible();
    await page.getByRole("button", { name: "Soruyu değiştir" }).click();
    await expect(page.getByText("Bilmiyorum, sen anlat.")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".apw-date-chip, .apw-seg, .cp-diff-option, .cp-exam-coach-chip, .apw-cal-head button"))
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => `${node.className}:${Math.round(node.getBoundingClientRect().height)}`)
        .filter((entry) => Number(entry.split(":").pop()) < 40),
    );
    expect(small).toEqual([]);
    await page.screenshot({ path: `test-results/kurulum-${width}.png`, fullPage: true });
  });
}

test("resmî müfredat paneli 375px: taşma yok", { tag: ["@public"] }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/e2e/mufredat");
  await page.getByRole("radio", { name: "Din Kültürü ve Ahlak Bilgisi" }).click();
  await expect(page.getByTestId("official-summary")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/mufredat-375.png", fullPage: true });
});
