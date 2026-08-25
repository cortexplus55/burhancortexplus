import { test, expect } from "@playwright/test";

const PUBLIC_ROUTES: [string, string][] = [
  ["/", "2 kat hızlı öğren"],
  ["/ozellikler", "Özellikler"],
  ["/sinav-hazirligi", "Sınav hazırlığı"],
  ["/fiyatlandirma", "Daha iyi notlar"],
  ["/hakkimizda", "Hakkımızda"],
  ["/iletisim", "İletişim"],
  ["/yardim", "Yardım"],
  ["/gizlilik", "Gizlilik politikası"],
  ["/kvkk", "KVKK"],
  ["/kullanim-kosullari", "Kullanım koşulları"],
  ["/giris", "Giriş yap"],
  ["/kayit", "hoş geldin"],
  ["/sifremi-unuttum", "Şifremi unuttum"],
  ["/email-dogrula", "E-posta doğrulama"],
  ["/mobil-uygulama", "Mobil uygulama"],
  ["/yaratici-program", "Yaratıcı program"],
  ["/ogretmenler-ve-profesorler-icin", "Öğretmenler ve profesörler için"],
];

test.describe("public pages", () => {
  for (const [route, heading] of PUBLIC_ROUTES) {
    test(`${route} renders its heading`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }

  test("unknown routes render the Turkish not-found page", async ({ page }) => {
    await page.goto("/bulunmayan-sayfa");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sayfa bulunamadı",
    );
  });

  test("security headers are applied", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
