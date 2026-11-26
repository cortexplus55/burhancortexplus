import { expect, test, type Page } from "@playwright/test";

/*
  Mağaza uyumluluğu (26 Kasım 2026): App Store 3.1.1 / 3.1.2 / 5.1.1(v), Google Play ödeme ve hesap silme politikası.
  - Hukuki sayfalar giriş yapmadan 200 OK döner ve telefonda yana taşmaz.
  - Uygulamanın tarayıcı kimliğiyle (CortexPlusApp) hiçbir ekranda PayTR, veli ödeme bağlantısı ya da web fiyatına
    yönlendirme görünmez; ödeme sayfaları yönlenir, ödeme ucu reddeder.
  - Mağaza abonelik ekranında zorunlu cümleler; kalıcı hesap silme ve herkese açık silme formu.
  Veritabanısız: silme formu yalnız cevap verir (hesap yoksa da aynı cümle), hiçbir hesap silinmez.
*/

const APP_ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 CortexPlusApp/1 (android)";
const APP_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CortexPlusApp/1 (ios)";

const LEGAL_PAGES = [
  { path: "/gizlilik", heading: "Gizlilik politikası" },
  { path: "/kullanim-sartlari", heading: "Kullanım koşulları" },
  { path: "/kullanim-kosullari", heading: "Kullanım koşulları" },
  { path: "/kvkk", heading: "KVKK aydınlatma metni" },
  { path: "/hesap-silme", heading: "Hesap ve veri silme" },
];

/** Uygulamada görünmemesi gereken ödeme sözleri (hukuki metinler hariç: orada PayTR ödeme kuruluşu olarak yazılı). */
const WEB_PAYMENT_TEXT = /PayTR|Velime (WhatsApp'tan )?[Öö]deme|veli ödeme bağlantısı|veline WhatsApp|web('den| sitesinden) (daha )?ucuz/i;

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function visibleText(page: Page) {
  return page.evaluate(() => document.body.innerText);
}

test.describe("Mağaza uyumluluğu", { tag: ["@public"] }, () => {
  test.describe("hukuki sayfalar giriş yapmadan açılır", () => {
    for (const width of [375, 360]) {
      test(`${width}px: beş sayfa 200 OK, başlık görünür, yana taşma yok`, async ({ page }) => {
        // Beş sayfa tek testte: süre sayfa sayısına göre (geliştirme sunucusunda her sayfa ilk açılışta derlenir).
        test.setTimeout(30_000 + LEGAL_PAGES.length * 20_000);
        await page.setViewportSize({ width, height: 800 });
        for (const item of LEGAL_PAGES) {
          const response = await page.goto(item.path);
          expect(response?.status(), item.path).toBe(200);
          await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
          expect(await horizontalOverflow(page), item.path).toBeLessThanOrEqual(1);
        }
      });
    }

    test("Gizlilik Politikası istenen verileri ve sağlayıcıları sayar; silme sayfasına bağlanır", async ({ page }) => {
      await page.goto("/gizlilik");
      const text = await visibleText(page);
      for (const word of ["Bildirim cihaz anahtarı", "Sesli öğretmen", "Ödeme geçmişi", "OpenAI", "Supabase", "Vercel", "Resend", "PayTR", "Sentry", "RevenueCat"]) {
        expect(text).toContain(word);
      }
      await expect(page.getByRole("link", { name: "Hesap silme" }).first()).toHaveAttribute("href", "/hesap-silme");
    });

    test("Kullanım Koşulları mağaza aboneliğini ayrı yazar", async ({ page }) => {
      await page.goto("/kullanim-kosullari");
      const text = await visibleText(page);
      expect(text).toContain("Mobil uygulamada mağaza aboneliği");
      expect(text).toMatch(/en az 24 saat önce iptal edilmezse/);
      expect(text).toMatch(/Web sitesinden alınan abonelikler otomatik olarak yenilenmez/);
    });
  });

  test.describe("herkese açık hesap silme", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("iki yol, silinen ve kalan veriler, mağaza uyarısı; form aynı cevabı verir", async ({ page }) => {
      await page.route("**/api/hesap-silme/talep", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
      );
      await page.goto("/hesap-silme");
      const text = await visibleText(page);
      expect(text).toMatch(/Uygulamadan ya da web sitesinden sil/);
      expect(text).toMatch(/Giriş yapmadan sil/);
      expect(text).toMatch(/Silinenler/);
      expect(text).toMatch(/Mevzuat gereği kalanlar/);
      expect(text).toMatch(/kendiliğinden iptal olmaz/);
      await page.getByLabel("Hesabının e-posta adresi").fill("ogrenci@ornek.com");
      await page.getByRole("button", { name: "Silme onay bağlantısı gönder" }).click();
      await expect(page.getByTestId("deletion-request-sent")).toContainText("Bu adresle bir hesap varsa");
    });

    test("geçersiz onay bağlantısı hiçbir şey silmez, yeni bağlantı ister", async ({ page }) => {
      const response = await page.goto("/hesap-silme/onay?t=sil.gecersiz");
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("deletion-confirm-invalid")).toBeVisible();
      await expect(page.getByRole("button", { name: "Kalıcı olarak sil" })).toHaveCount(0);
    });

    test("Ayarlar'daki bölüm: kalıcı silme düğmesi ve onay penceresi", async ({ page }) => {
      await page.goto("/e2e/magaza?ekran=silme");
      await expect(page.getByTestId("account-delete-store-warning")).toBeVisible();
      await page.getByRole("button", { name: "Hesabımı kalıcı olarak sil" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("geri alınamaz");
      await dialog.getByRole("button", { name: "Vazgeç" }).click();
      await expect(dialog).toBeHidden();
    });
  });

  test.describe("uygulamada web ödemesi yok (Android)", () => {
    test.use({ userAgent: APP_ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("oturumsuz ana sayfa kayda gider", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/kayit/);
    });

    test("fiyat, veli ödeme ve ödeme dönüşü sayfaları abonelik ekranına yönlenir (oturumsuzken giriş)", async ({ page }) => {
      test.setTimeout(90_000);
      for (const path of ["/fiyatlandirma", "/veli-odeme/deneme-belirteci", "/odeme/basarili"]) {
        await page.goto(path, { waitUntil: "load" });
        await expect(page, path).toHaveURL(/\/giris\?next=(%2F|\/)pay/);
      }
    });

    test("tanıtım sayfaları açılmaz", async ({ page }) => {
      await page.goto("/ozellikler", { waitUntil: "load" });
      await expect(page).toHaveURL(/\/kayit/);
    });

    test("ödeme başlatan uçlar reddeder; okuyan uç açık", async ({ request }) => {
      for (const path of ["/api/payments/paytr/create-token", "/api/payments/parent-link", "/api/promo/redeem"]) {
        const response = await request.post(path, { headers: { "user-agent": APP_ANDROID }, data: {} });
        expect(response.status(), path).toBe(403);
        expect((await response.json()).error).toBe("native_store_only");
      }
      // Tarayıcıdan gelen istek mağaza kuralına takılmaz (oturumsuz olduğu için kendi kapısında durur).
      const web = await request.post("/api/payments/paytr/create-token", {
        data: {},
        headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" },
      });
      const webBody = (await web.json().catch(() => ({}))) as { error?: string };
      expect(webBody.error).not.toBe("native_store_only");
    });

    test("uygulamada açılan sayfalarda PayTR, veli bağlantısı ya da web fiyatı yok", async ({ page }) => {
      test.setTimeout(30_000 + 6 * 20_000);
      for (const path of ["/kayit", "/giris", "/yardim", "/mufredat", "/hesap-silme", "/e2e/magaza?platform=android"]) {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        expect(await visibleText(page), path).not.toMatch(WEB_PAYMENT_TEXT);
        const leaks = await page
          .locator('a[href*="/veli-odeme"], a[href*="/odeme/veli"], a[href*="paytr.com"], a[href^="/fiyatlandirma"]')
          .evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).offsetParent !== null).length);
        expect(leaks, path).toBe(0);
      }
    });

    test("Yardım ve Hakkımızda'da yenileme cümlesi uygulamaya göre", async ({ page }) => {
      test.setTimeout(80_000);
      await page.goto("/yardim");
      await page.getByText("Plus ile ücretsiz arasındaki fark nedir?").click();
      await expect(page.getByText("Uygulamada alınan abonelik", { exact: false })).toBeVisible();
      await expect(page.getByText("Abonelik kendiliğinden yenilenmez.", { exact: false })).toBeHidden();
      await page.goto("/hakkimizda");
      await expect(page.getByText("Uygulamada alınan abonelik", { exact: false })).toBeVisible();
      await expect(page.getByText("Abonelik kendiliğinden yenilenmez", { exact: false })).toBeHidden();
    });

    test("mağaza abonelik ekranı: plan, dönem, fiyat, 24 saat, geri yükleme, iki hukuki bağlantı", async ({ page }) => {
      await page.goto("/e2e/magaza?platform=android");
      const text = await visibleText(page);
      expect(text).toMatch(/Sınav Haftası/);
      expect(text).toMatch(/aylık otomatik yenilenir/);
      expect(text).toMatch(/en az 24 saat önce iptal edilmezse/);
      await expect(page.getByRole("button", { name: "Satın Alımları Geri Yükle" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Gizlilik Politikası" })).toHaveAttribute("href", "/gizlilik");
      await expect(page.getByRole("link", { name: "Kullanım Şartları" })).toHaveAttribute("href", "/kullanim-kosullari");
      await expect(page.getByRole("link", { name: /Google Play aboneliklerini yönet/ })).toBeVisible();
      for (const name of ["Satın Alımları Geri Yükle", "Gizlilik Politikası", "Kullanım Şartları"]) {
        const box = await page.getByRole(name.includes("Yükle") ? "button" : "link", { name }).boundingBox();
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  });

  test.describe("tarayıcıda değişen bir şey yok", () => {
    test("web'de fiyat sayfası açılır; Yardım'da web cümlesi görünür", async ({ page }) => {
      const response = await page.goto("/fiyatlandirma");
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/fiyatlandirma/);
      await page.goto("/yardim");
      await page.getByText("Plus ile ücretsiz arasındaki fark nedir?").click();
      await expect(page.getByText("Abonelik kendiliğinden yenilenmez.", { exact: false })).toBeVisible();
      await expect(page.getByText("Uygulamada alınan abonelik", { exact: false })).toBeHidden();
    });
  });

  test.describe("uygulamada web ödemesi yok (iOS)", () => {
    test.use({ userAgent: APP_IOS, viewport: { width: 390, height: 844 } });

    test("App Store abonelik yönetimi bağlantısı ve oturumsuz ana sayfa kayda", async ({ page }) => {
      await page.goto("/e2e/magaza?platform=ios");
      await expect(page.getByRole("link", { name: /App Store aboneliklerini yönet/ })).toHaveAttribute(
        "href",
        "https://apps.apple.com/account/subscriptions",
      );
      await page.goto("/");
      await expect(page).toHaveURL(/\/kayit/);
    });
  });
});
