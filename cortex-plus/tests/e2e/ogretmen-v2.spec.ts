import { expect, test } from "@playwright/test";

/*
  teacher.v2 ana sohbeti (`/e2e/ana-ekran?durum=sohbet&ogretmen=v2`, veritabanısız). Faz 11 (21 Kasım 2026): dört
  stillik "Nasıl anlatayım?" menüsünün yerine iki modlu anahtar ("Adım Adım Öğret", "Hızlı Özet"); ipucu/cevap çiplerinin
  yerine tek sıra tepki çipleri. Ayrıntılı ölçüm `ogretmen-faz11.spec.ts`'te.
*/

for (const width of [360, 375, 768, 1280] as const) {
  test.describe(`öğretmen v2 · ${width}px`, () => {
    test.use({ viewport: { width, height: 820 } });

    test("iki modlu anahtar ekranın içinde; soru kartı ve tepki çipleri", { tag: ["@public"] }, async ({ page }) => {
      await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
      await expect(page.getByText("Sıra sende")).toBeVisible();
      await expect(page.getByRole("button", { name: "🤔 Küçük bir ipucu ver" })).toBeVisible();
      await expect(page.getByRole("link", { name: "🎯 Bu konudan mini test aç" })).toBeVisible();
      await expect(page.getByPlaceholder("Cevabını yaz")).toBeVisible();
      await expect(page.getByRole("button", { name: /Nasıl anlatayım/ })).toHaveCount(0);
      const group = page.getByRole("radiogroup", { name: "Anlatım modu" });
      await expect(group.getByRole("radio")).toHaveCount(2);
      const box = (await group.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test("bayrak kapalıyken bugünkü üç düğmeli anahtar, soru kartı yok", { tag: ["@public"] }, async ({ page }) => {
  await page.goto("/e2e/ana-ekran?durum=sohbet");
  await expect(page.getByRole("radiogroup", { name: "Anlatım modu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Nasıl anlatayım/ })).toHaveCount(0);
  await expect(page.getByText("Sıra sende")).toHaveCount(0);
});

for (const width of [360, 375, 1280] as const) {
  test(`Neye baktım paneli ekranın içinde, satırlar kaynağına bağlı · ${width}px`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await page.route("**/api/teacher/dossier**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          empty: false,
          checks: [],
          lines: [
            { key: "weak", source: "mistakes", text: "En çok takıldığın: Mol kavramı (3 kez)", href: "/yanlislarim", sourceLabel: "Yanlışlarım" },
            { key: "exam", source: "exam", text: "AYT Kimya: sınava 10 gün", href: "/deneme-sinavlari/p1", sourceLabel: "Hazırlık" },
          ],
        }),
      }),
    );
    await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
    await page.getByRole("button", { name: /Neye baktım/ }).click();
    const panel = page.getByRole("dialog", { name: "Öğretmenin bildikleri" });
    await expect(panel.getByText("En çok takıldığın: Mol kavramı (3 kez)")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Yanlışlarım" })).toHaveAttribute("href", "/yanlislarim");
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
