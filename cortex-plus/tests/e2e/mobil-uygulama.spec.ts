import { expect, test, type Page } from "@playwright/test";

/*
  Mobil uygulama, Aşama 1 (26 Kasım 2026): sitenin uygulama içindeki hâli, uygulamanın tarayıcı kimliğiyle
  ("CortexPlusApp/1 (android|ios)"). Köprü yokken eklentiler web yedekleriyle çalışır (tercihler localStorage'da).
  - İlk açılış akışı yalnız uygulamada, bir kez; seviye seçimi profile yazılır; telefonda taşma yok, dokunma ≥ 44 px.
  - Bağlantı kopunca üstte "Bağlantı koptu — tekrar dene", gelince kalkar.
  - Girişte Google düğmesi yerine uygulama notu; "Tarayıcıda aç" şeridi yok.
  - iOS'ta görünüm alanı viewport-fit=cover alır; tarayıcıda hiçbir şey değişmez.
*/

const APP_ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 CortexPlusApp/1 (android)";
const APP_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CortexPlusApp/1 (ios)";
const ONBOARDING_STORAGE = "CapacitorStorage.cp.native.onboarding.v1";

async function mockOnboardingApi(page: Page, saved: unknown[]) {
  await page.route("**/api/app/onboarding", async (route) => {
    if (route.request().method() === "POST") {
      saved.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { gradeLevel: null, learningGoal: null, firstName: "Deniz", voiceTutor: false } });
  });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function smallTargets(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((node) => node.offsetParent !== null)
      .map((node) => ({ text: node.textContent?.trim() ?? "", height: node.getBoundingClientRect().height }))
      .filter((item) => item.height < 44);
  }, selector);
}

test.describe("uygulama içinde (Android)", () => {
  test.use({ userAgent: APP_ANDROID, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("ilk açılış: seviye → ilk adım → bildirim; bir kez", async ({ page }) => {
    const saved: unknown[] = [];
    await mockOnboardingApi(page, saved);
    await page.goto("/e2e/ana-ekran");
    await expect(page.locator("html")).toHaveClass(/cx-native/);
    const dialog = page.getByRole("dialog", { name: "Hangi sınava hazırlanıyorsun?" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("Hoş geldin Deniz!")).toBeVisible();
    await noHorizontalOverflow(page);
    expect(await smallTargets(page, ".cx-nob button")).toEqual([]);

    await dialog.getByRole("radio", { name: /Lise \/ YKS/ }).click();
    await dialog.getByRole("radio", { name: "11. sınıf · YKS" }).click();
    await dialog.getByRole("button", { name: "Devam et" }).click();
    await expect(page.getByRole("heading", { name: "İlk adımı şimdi at" })).toBeVisible();
    expect(saved).toEqual([{ group: "lise", choice: "11" }]);
    // Ses bu öğrenciye açık değil: yazılı öğretmen seçeneği.
    await expect(page.getByText("Öğretmenine sor", { exact: true })).toBeVisible();
    await noHorizontalOverflow(page);

    await page.getByRole("button", { name: "Bu adımı geç" }).click();
    await expect(page.getByRole("heading", { name: "Hatırlatmaları açalım mı?" })).toBeVisible();
    await expect(page.getByText("Gece 22:00 ile sabah 08:00 arası hatırlatma göndermeyiz.")).toBeVisible();
    expect(await smallTargets(page, ".cx-nob button")).toEqual([]);
    await page.getByRole("button", { name: "Şimdi değil" }).click();
    await expect(page.locator("[data-native-onboarding]")).toHaveCount(0);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_STORAGE)).toBe("1");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/cx-native/);
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-native-onboarding]")).toHaveCount(0);
  });

  test("bağlantı kopunca çubuk çıkar, gelince kalkar", async ({ page, context }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "1"), ONBOARDING_STORAGE);
    await page.goto("/e2e/ana-ekran");
    await expect(page.locator("html")).toHaveClass(/cx-native/);
    await page.waitForTimeout(800);
    await context.setOffline(true);
    const bar = page.locator("[data-offline-bar]");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Bağlantı koptu — tekrar dene");
    const retry = bar.getByRole("button", { name: "Tekrar dene" });
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page);
    await context.setOffline(false);
    await expect(bar).toHaveCount(0);
  });

  test("girişte Google yerine uygulama notu; tarayıcıda aç şeridi yok", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.getByText("Uygulamada e-posta ve şifrenle giriş yapılıyor.", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Şifremi unuttum" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
    await expect(page.getByText("Tarayıcıda Aç", { exact: false })).toHaveCount(0);
  });
});

test.describe("uygulama içinde (iOS)", () => {
  test.use({ userAgent: APP_IOS, viewport: { width: 390, height: 844 } });

  test("alt güvenli alan için viewport-fit=cover", async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, "1"), ONBOARDING_STORAGE);
    await page.goto("/e2e/ana-ekran");
    await expect(page.locator("html")).toHaveAttribute("data-native-platform", "ios");
    // Üretim derlemesinde iki görünüm alanı etiketi olabiliyor: hepsi düzeltilmiş olmalı.
    await page.waitForLoadState("load");
    const contents = await page
      .locator('meta[name="viewport"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content") ?? ""));
    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) expect(content).toContain("viewport-fit=cover");
  });
});

test.describe("tarayıcıda (web)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("açılış akışı, uygulama sınıfı ve viewport değişikliği yok", async ({ page }) => {
    await page.goto("/e2e/ana-ekran");
    await expect(page.locator(".cp-sor-root").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await expect(page.locator("[data-native-onboarding]")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/cx-native/);
    const contents = await page
      .locator('meta[name="viewport"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content") ?? ""));
    for (const content of contents) expect(content).not.toContain("viewport-fit");
  });
});
