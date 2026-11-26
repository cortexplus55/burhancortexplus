import { expect, test, type Page } from "@playwright/test";

/*
  Mobil 1. adım (26 Kasım 2026; App Store 1.2): düello sıralamasında her oyuncu "Bildir" ve "Engelle" ile bildirilebilir.
  Kendi satırında seçenek yok; bildirim gönderilir; misafir engelleyemez, oturumlu öğrenci onaylayınca satır kalkar.
  Telefonda (375 ve 360 px) yana taşma yok, düğmeler en az 40 px. Veritabanısız fikstür `/e2e/duello`.
*/

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("Düelloda bildir ve engelle", { tag: ["@public"] }, () => {
  for (const width of [375, 360]) {
    test(`${width}px: bildirim gönderilir, misafir engelleyemez, taşma yok`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 800 });
      const reports: unknown[] = [];
      await page.route("**/api/duels/ornek1/report", async (route) => {
        reports.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await page.goto("/e2e/duello");
      const menus = page.getByRole("button", { name: /için seçenekler/ });
      await expect(menus).toHaveCount(2);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const box = await menus.first().boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);

      await menus.first().click();
      await page.getByRole("menuitem", { name: /Engelle/ }).click();
      await expect(page.getByText("Engellemek için giriş yap.")).toBeVisible();

      await menus.first().click();
      await page.getByRole("menuitem", { name: /Bildir/ }).click();
      await page.getByRole("radio", { name: "Uygunsuz ad" }).check();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Bildirimi gönder" }).click();
      await expect(page.getByText("Bildirimin alındı.", { exact: false })).toBeVisible();
      expect(reports).toEqual([{ runId: "22222222-2222-4222-8222-222222222222", reason: "offensive_name" }]);
    });
  }

  test("oturumlu öğrenci engeller; satır sıralamadan kalkar", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.route("**/api/duels/ornek1/block", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    await page.goto("/e2e/duello?oturum=1");
    await page.getByRole("button", { name: "Oyuncu için seçenekler" }).click();
    await page.getByRole("menuitem", { name: /Engelle/ }).click();
    await expect(page.getByRole("alertdialog")).toContainText("bir daha görmezsin");
    await page.getByRole("alertdialog").getByRole("button", { name: "Engelle" }).click();
    await expect(page.getByRole("button", { name: "Oyuncu için seçenekler" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /için seçenekler/ })).toHaveCount(1);
  });
});
