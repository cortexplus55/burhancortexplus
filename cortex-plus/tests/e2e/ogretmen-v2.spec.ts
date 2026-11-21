import { expect, test } from "@playwright/test";

/*
  teacher.v2 ana sohbeti (`/e2e/ana-ekran?durum=sohbet&ogretmen=v2`, veritabanısız). 21 Kasım 2026'dan beri açık sohbet
  öğretmen v3 ekranında: anlatım seçici, "Sıra sende" soru kartı ve tepki çipleri yok, yazma alanı tek kapsül. Ayrıntılı
  ölçüm `ogretmen-v3.spec.ts`'te. "Neye baktım" ana ekranın kontrol satırında kalır (sohbet açılmadan).
*/

for (const width of [360, 375, 768, 1280] as const) {
  test.describe(`öğretmen v2 · ${width}px`, () => {
    test.use({ viewport: { width, height: 820 } });

    test("açık sohbet v3 tuvalinde: seçici, soru kartı ve çip yok; kapsül ekranın içinde", { tag: ["@public"] }, async ({ page }) => {
      await page.route("**/api/teacher/conversations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ groups: [] }) }));
      await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
      await expect(page.locator(".cx-v3-thread")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Sıra sende")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "🤔 Küçük bir ipucu ver" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "🎯 Bu konudan mini test aç" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Nasıl anlatayım/ })).toHaveCount(0);
      await expect(page.getByRole("radiogroup", { name: "Anlatım modu" })).toHaveCount(0);
      const input = page.getByPlaceholder("Sor, konuş veya dosya gönder");
      await expect(input).toBeVisible();
      const box = (await page.locator(".cx-v3-capsule").boundingBox())!;
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
  await expect(page.locator(".cx-v3")).toHaveCount(0);
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
    // Öğretmen v3: "Neye baktım" ana ekranın kontrol satırında (açık sohbet çerçevesiz, kontrol satırı yok).
    await page.goto("/e2e/ana-ekran?ogretmen=v2");
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
