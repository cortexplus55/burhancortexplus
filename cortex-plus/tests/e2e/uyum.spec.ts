import { expect, test } from "@playwright/test";

/*
  Uyum paketi (7 Kasım 2026): çerez bandı, tercih penceresi, çerez politikası ve kayıtta okumadan işaretlenemeyen
  KVKK kutusu. Veritabanısız: kayıt adımında yalnız pencere denenir, hesap açılmaz.
*/

test.describe("Uyum paketi", { tag: ["@public"] }, () => {
  test.describe("çerez bandı (tercih verilmemiş tarayıcı)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("ilk ziyarette bant; üç düğme eşit; Reddet kapatır ve bir daha sorulmaz", async ({ page, context }) => {
      await page.goto("/kvkk");
      const banner = page.getByRole("region", { name: "Çerez tercihi" });
      await expect(banner).toBeVisible();
      const heights: number[] = [];
      for (const name of ["Reddet", "Tercihler", "Kabul et"]) {
        const box = await banner.getByRole("button", { name }).boundingBox();
        heights.push(box?.height ?? 0);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

      await banner.getByRole("button", { name: "Reddet" }).click();
      await expect(banner).toBeHidden();
      await page.reload();
      await expect(page.getByRole("heading", { name: "KVKK aydınlatma metni" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Çerez tercihi" })).toBeHidden();
      const cookie = (await context.cookies()).find((item) => item.name === "cp_consent");
      expect(JSON.parse(decodeURIComponent(cookie?.value ?? "{}")).a).toBe(false);
    });

    test("Tercihler: analitik kapalı başlar; açılıp kaydedilince izin yazılır", async ({ page, context }) => {
      await page.goto("/cerez-politikasi");
      await page.getByRole("region", { name: "Çerez tercihi" }).getByRole("button", { name: "Tercihler" }).click();
      const toggle = page.getByRole("switch", { name: "Analitik" });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await page.getByRole("button", { name: "Seçimi kaydet" }).click();
      await expect(page.getByRole("region", { name: "Çerez tercihi" })).toBeHidden();
      const cookie = (await context.cookies()).find((item) => item.name === "cp_consent");
      expect(JSON.parse(decodeURIComponent(cookie?.value ?? "{}")).a).toBe(true);
    });
  });

  test("çerez politikası: tablo kendi kutusunda kayar, telefonda sayfa yana kaymaz; tercih penceresi açılır", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/cerez-politikasi");
    await expect(page.getByRole("table")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Sayfadaki ve altbilgideki düğme aynı pencereyi açar.
    await page.getByRole("button", { name: "Çerez tercihleri" }).first().click();
    await expect(page.getByRole("dialog", { name: "Çerez tercihleri" })).toBeVisible();
  });

  test("kayıtta KVKK kutusu metin açılıp sonuna kadar okunmadan işaretlenmez", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/kayit");
    await page.locator(".signup-wizard .grid-cols-3 button").first().click();
    await page.locator(".signup-wizard .grid-cols-2 .signup-choice").first().click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.locator(".signup-choice").first().click();
    await page.getByRole("button", { name: "Devam" }).click();

    const box = page.getByRole("checkbox", { name: /KVKK Aydınlatma Metni'ni okudum/ });
    await expect(box).not.toBeChecked();
    await box.click();
    // Pencere açıkken sayfanın geri kalanı ekran okuyucudan gizlidir (modal); kutu pencere kapanınca sorulur.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Kısaca")).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Okudum, onaylıyorum" });
    await expect(confirm).toBeDisabled();

    // Okumadan kapatılırsa kutu boş kalır.
    await dialog.getByRole("button", { name: "Kapat" }).last().click();
    await expect(dialog).toBeHidden();
    await expect(box).not.toBeChecked();

    // Yeniden açılır, sonuna kadar kaydırılır, onaylanır: kutu işaretlenir.
    await box.click();
    await expect(dialog).toBeVisible();
    await expect(confirm).toBeDisabled();
    await dialog.locator(".cp-legal-dialog-body").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(box).toBeChecked();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
