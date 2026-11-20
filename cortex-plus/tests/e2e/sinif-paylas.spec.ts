import { expect, test, type Page } from "@playwright/test";

/**
 * Faz 7 (20 Kasım 2026): "📲 Sınıfla Paylaş" penceresi ve misafirin gördüğü `/davet/<kod>` önizlemesi; gerçek bileşenler,
 * veritabanısız fikstür (`/e2e/sinif-paylas`). Telefon, tablet ve masaüstünde yana taşma yok, dokunma hedefleri 44 px.
 */

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const URL_SHARED = "https://cortexplus.app/davet/abcdefghjk";

for (const width of [390, 820, 1440]) {
  test(`davet önizlemesi ${width} px: üniteler, klon düğmesi; taşma yok`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/sinif-paylas");
    const card = page.getByTestId("shared-prep-card");
    await expect(card.getByRole("heading", { level: 1 })).toHaveText("Örnek sınav hazırlığı");
    await expect(card).toContainText("Ay*** paylaştı");
    await expect(card.getByRole("list", { name: "Üniteler" }).locator("li")).toHaveCount(12);
    await expect(card).toContainText("+2 ünite daha");
    await noHorizontalOverflow(page);
    const cta = card.getByTestId("clone-signup");
    await expect(cta).toHaveText("Bu Çalışma Yolunu Hesabıma Klonla (1. Ünite Ücretsiz)");
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await card.getByRole("link", { name: "Hesabın var mı? Giriş yap" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await card.locator(".cp-invite-unit").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const href = new URL((await cta.getAttribute("href"))!, "https://cortexplus.app");
    expect(href.searchParams.get("next")).toBe("/davet/abcdefghjk?otomatik=1");
    expect(href.searchParams.get("ref")).toBe("AB12CD34");
  });

  test(`Sınıfla Paylaş ${width} px: pencere, mutlak bağlantı, 44 px düğmeler`, async ({ page }) => {
    await page.route("**/api/learning/exam-prep/share-code", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "clone", code: "abcdefghjk", url: URL_SHARED, whatsappHref: `https://wa.me/?text=${encodeURIComponent(`x ${URL_SHARED}`)}` }),
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/sinif-paylas?ekran=paylas", { waitUntil: "networkidle" });
    const pill = page.getByRole("button", { name: "📲 Sınıfla Paylaş" });
    expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const dialog = page.getByRole("dialog");
    // Geliştirme sunucusunda hidrasyon gecikebilir: ilk tıklama işleyiciden önce gelirse yeniden basılır.
    await expect(async () => {
      if (!(await dialog.count())) await pill.click();
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(dialog.getByTestId("class-share-url")).toHaveText(URL_SHARED);
    // Açılış hareketi (ölçek 0,96 → 1) bitmeden ölçülmez.
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
    await expect(dialog).toContainText("+50 Bonus Kredi");
    const whatsapp = dialog.getByRole("link", { name: /WhatsApp'ta paylaş/ });
    expect((await whatsapp.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await dialog.getByRole("button", { name: "Bağlantıyı kopyala" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await noHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(pill).toBeFocused();
  });
}
