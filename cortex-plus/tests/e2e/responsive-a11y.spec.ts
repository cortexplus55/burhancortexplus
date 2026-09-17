import { test, expect } from "@playwright/test";

test.describe("responsive layout", () => {
  test("landing page has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("landing subject grid on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Matematik/i }).first()).toBeVisible();
  });

  test("pricing plans visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fiyatlandirma");
    await expect(page.getByRole("heading", { name: /Plus/i }).first()).toBeVisible();
  });

  // Alt menü bağlantıları eskiden 20 piksel yüksekliğindeydi, aralarında da
  // 8 piksel vardı; parmakla yanlış sayfaya gitmek kural oluyordu.
  test("footer links are tappable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const heights = await page.evaluate(() =>
      [...document.querySelectorAll("footer .mk-footer-links a")].map(
        (el) => el.getBoundingClientRect().height,
      ),
    );

    expect(heights.length).toBeGreaterThan(5);
    // 0.7rem dolgu ile 42px oluyordu; Apple'ın asgarisi 44.
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });
});

/*
  DOKUNMATİK KURALLARI.

  Bunlar 17 Eylül 2026'da ölçülen gerçek hatalardan geliyor ve
  yalnızca dokunmatik bir bağlamda sınanabiliyor: düzeltmeler
  `@media (pointer: coarse)` altında duruyor, masaüstü bağlamında
  (varsayılan proje) hiç uygulanmıyor. O yüzden bu blok kendi cihazını
  kuruyor.

  Ölçümde `window.innerWidth` KULLANILMIYOR: Playwright'ın mobil
  emülasyonunda 360 yerine 459 bildiriyor ve taşma ölçümü 99px fazla
  toleranslı çalışıyor — gerçekten taşan sayfa "temiz" görünüyor.
  Doğru değer `documentElement.clientWidth`.
*/
test.describe("mobil dokunma kuralları", () => {
  /*
    Cihaz ayarları açıkça yazılıyor, `devices["iPhone 13"]` ile değil:
    o hazır tanım `defaultBrowserType` de taşıyor ve Playwright bunu bir
    describe içinde kabul etmiyor ("forces a new worker").

    Burada önemli olan tek şey `hasTouch`: `pointer: coarse` medya
    sorgusunu tetikleyen ve dolayısıyla dokunma kurallarını devreye
    sokan şey o.
  */
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });

  for (const route of ["/", "/fiyatlandirma", "/giris", "/kayit"]) {
    test(`${route} telefonda yatay taşmıyor`, async ({ page }) => {
      await page.goto(route);
      const over = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        return Math.max(
          document.documentElement.scrollWidth - vw,
          document.body.scrollWidth - vw,
        );
      });
      expect(over).toBeLessThanOrEqual(1);
    });
  }

  /*
    iOS Safari, yazı tipi 16px'in altındaki bir girdiye dokunulduğunda
    sayfayı kendiliğinden yakınlaştırıyor: düzen büyüyor, öğeler üst üste
    biniyor, odak kalkınca sayfa yana kaymış kalıyor. Ölçümde sohbetin
    ana yazma alanı dahil dokuz girdi 13-15px arasındaydı.
  */
  test("metin girdileri 16px'in altına düşmüyor", async ({ page }) => {
    await page.goto("/giris");
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden])")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
  });

  test("düğmeler parmakla basılabilir boyutta", async ({ page }) => {
    await page.goto("/giris");
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
        })
        .map((el) => `${el.textContent?.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    );
    expect(small).toEqual([]);
  });

  /*
    "Sol tarafa sıfır olmuş yazılar" — yazının başladığı yer ölçülüyor,
    kutunun değil: ortalı bir paragrafın kutusu sıfırdan başlayıp
    dolgusuyla yazıyı içeri alabiliyor.
  */
  test("yazı ekranın kenarına yapışmıyor", async ({ page }) => {
    await page.goto("/");
    const flush = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (own.length < 2) continue;
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 24) continue;
        const left = r.left + (parseFloat(getComputedStyle(el).paddingLeft) || 0);
        if (left < 12) out.push(`${el.tagName.toLowerCase()} ${Math.round(left)}px «${own.slice(0, 24)}»`);
      }
      return out;
    });
    expect(flush).toEqual([]);
  });
});

test.describe("accessibility basics", () => {
  test("document language is Turkish", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  });

  test("exactly one level-one heading per page", async ({ page }) => {
    await page.goto("/ozellikler");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("signup account step exposes accessible names", async ({ page }) => {
    await page.goto("/kayit");
    await page.getByRole("button", { name: "9. sınıf" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Matematik" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "YKS hazırlık" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Adım adım anlat" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Atla" }).click();
    await expect(page.getByLabel("Ad soyad")).toBeVisible();
    await expect(page.getByLabel("E-posta")).toBeVisible();
    await expect(page.getByLabel("Şifre tekrar")).toBeVisible();
  });

  test("keyboard focus reaches the primary navigation", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe("A");
  });

  test("sign-in page exposes labelled email field", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.getByLabel("E-posta")).toBeVisible();
  });
});
