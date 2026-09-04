import { test, expect } from "@playwright/test";

/**
 * Her herkese açık sayfada **tek** bir `h1` olmalı ve o `h1` sayfanın konusunu
 * söylemeli. Bu tablo bir zamanlar sayfalarla uyuşmuyordu; uyuşmayan yerlerin
 * çoğu testin değil sayfanın hatasıydı (giriş/kayıt ekranlarında `h1` sağdaki
 * forma değil soldaki dekoratif panele veriliyordu, `/fiyatlandirma` ve
 * `/kayit`'ta iki tane `h1` vardı).
 *
 * `/ogretmenler-ve-profesorler-icin` bilerek yok: o rota emekli, middleware
 * `/ogretmen`'e yönlendiriyor. Yönlendirmenin kendisi `auth.spec.ts`'te.
 */
const PUBLIC_ROUTES: [string, string][] = [
  ["/", "2 kat hızlı öğren"],
  ["/ozellikler", "Özellikler"],
  ["/sinav-hazirligi", "Sınav hazırlığı"],
  ["/fiyatlandirma", "Fiyatlandırma"],
  ["/hakkimizda", "Hakkımızda"],
  ["/iletisim", "İletişim"],
  ["/yardim", "Yardım"],
  ["/gizlilik", "Gizlilik politikası"],
  ["/kvkk", "KVKK"],
  ["/kullanim-kosullari", "Kullanım koşulları"],
  ["/giris", "Tekrar hoş geldin"],
  ["/kayit", "Hangi sınıftasın?"],
  ["/sifremi-unuttum", "Şifremi unuttum"],
  ["/email-dogrula", "E-posta doğrulama"],
  ["/mobil-uygulama", "Mobil uygulama"],
  ["/yaratici-program", "Yaratıcı program"],
];

test.describe("public pages", () => {
  for (const [route, heading] of PUBLIC_ROUTES) {
    test(`${route} renders its heading`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      const h1 = page.getByRole("heading", { level: 1 });
      // Sayısı ayrıca kontrol ediliyor: iki `h1` olduğunda Playwright'ın
      // "strict mode violation" hatası sorunu gizliyor, bu satır adıyla söylüyor.
      await expect(h1).toHaveCount(1);
      await expect(h1).toContainText(heading);
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
