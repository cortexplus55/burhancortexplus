import { test, expect } from "@playwright/test";

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

/** Retired in favour of the student-only surface (see RETIRED_PREFIXES). */
const RETIRED_ROUTES = ["/ogretmenler-ve-profesorler-icin", "/veli"];

test.describe("public pages", () => {
  for (const [route, heading] of PUBLIC_ROUTES) {
    test(`${route} renders its heading`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }

  for (const route of RETIRED_ROUTES) {
    test(`${route} sends visitors to the student hub`, async ({ page }) => {
      await page.goto(route);
      // Anonymous visitors bounce again off /ogretmen, which is protected.
      await expect(page).toHaveURL(/\/(ogretmen|giris)/);
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
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).toContain("base-uri 'self'");
  });

  test("the report-only policy still allows what the app loads", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const policy = response?.headers()["content-security-policy-report-only"];
    // Losing either of these silently breaks checkout or the hero video once
    // the policy is promoted to enforcing.
    expect(policy).toContain("frame-src https://www.paytr.com");
    expect(policy).toContain("media-src 'self' https://videos.pexels.com");
  });
});
