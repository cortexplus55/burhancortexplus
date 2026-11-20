import { expect, test } from "@playwright/test";

/*
  Faz 13 PR-1 (teacher.v2): ana sohbette "Nasıl anlatayım?" menüsü, soru kartı ve ipucu/cevap çipleri. Fikstür
  veritabanısız (`/e2e/ana-ekran?durum=sohbet&ogretmen=v2`). Menü satırın ortasındaki hapta açılır; 15 Kasım 2026'da
  375 px'te sağdan 20 px taşıyordu (açılınca ölçülüp kaydırılıyor).
*/

for (const width of [360, 375, 768, 1280] as const) {
  test.describe(`öğretmen v2 · ${width}px`, () => {
    test.use({ viewport: { width, height: 820 } });

    test("menü ekranın içinde açılır; soru kartı ve iki çip; Esc kapatır", { tag: ["@public"] }, async ({ page }) => {
      await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
      await expect(page.getByText("Sıra sende")).toBeVisible();
      await expect(page.getByRole("button", { name: "💡 İpucu ver" })).toBeVisible();
      await expect(page.getByRole("button", { name: "⚡ Cevabı göster" })).toBeVisible();
      await expect(page.getByPlaceholder("Cevabını yaz")).toBeVisible();
      const pill = page.getByRole("button", { name: /Nasıl anlatayım\? Şu an: Rehberli/ });
      await pill.click();
      const menu = page.getByRole("menu", { name: "Nasıl anlatayım?" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
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
