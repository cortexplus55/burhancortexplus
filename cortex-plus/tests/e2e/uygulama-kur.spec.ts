import { expect, test, type Locator, type Page } from "@playwright/test";

/*
  "📱 Telefonuna Uygulama Gibi Ekle" (20 Kasım 2026, Faz 8). 390 px telefonda, Android ve iPhone tarayıcı kimliğiyle,
  koyu ve açık temada: kart yana taşmaz, alt çubuğun ve hazırlık sayfasının sabit "Devam et" kartının üstünde durur,
  dokunma alanları 44 px, yazı 12 px ve üstü, metin/zemin karşıtlığı 4,5:1 ve üstü. Android'de tarayıcının kurulum
  olayı taklit edilir (gerçek kurulum yok); iPhone'da iki adımlı rehber. Instagram tarayıcısında kart çıkmaz.
*/

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0",
};

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function open(page: Page, path: string, theme: "dark" | "light") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("cortex-gamification-v1", "1");
    window.localStorage.setItem("theme", value);
  }, theme);
  await page.goto(path);
}

/** Tarayıcının kurulum olayını taklit eder; `__promptCalls` pencerenin kaç kez açıldığını sayar. */
async function firePrompt(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((choice) => {
    const target = window as unknown as { __promptCalls?: number };
    target.__promptCalls ??= 0;
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = () => {
      target.__promptCalls = (target.__promptCalls ?? 0) + 1;
      return Promise.resolve();
    };
    event.userChoice = Promise.resolve({ outcome: choice });
    window.dispatchEvent(event);
  }, outcome);
}

/** Yana taşma yok, kart ekranın içinde, dokunma alanları 44 px, yazı 12 px ve üstü, karşıtlık 4,5:1 ve üstü. */
async function checkCard(page: Page, card: Locator) {
  await card.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(390);
  for (const button of await card.getByRole("button").all()) {
    const target = (await button.boundingBox())!;
    expect(target.height, await button.innerText()).toBeGreaterThanOrEqual(44);
    expect(target.width, await button.innerText()).toBeGreaterThanOrEqual(44);
  }
  const audit = await card.evaluate((element) => {
    const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const c = [r!, g!, b!].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const contrast = (a: string, b: string) => {
      const [x, y] = [lum(rgba(a)), lum(rgba(b))].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const solid = (value: string) => {
      const parts = rgba(value);
      return parts.length === 3 || (parts.length === 4 && parts[3] === 1);
    };
    const cardBg = getComputedStyle(element).backgroundColor;
    const out: { text: string; size: number; ratio: number }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("[aria-hidden='true']")) continue;
      let bg = cardBg;
      for (let at: HTMLElement | null = parent; at && at !== element; at = at.parentElement) {
        const own = getComputedStyle(at).backgroundColor;
        if (solid(own)) {
          bg = own;
          break;
        }
      }
      const style = getComputedStyle(parent);
      out.push({ text, size: parseFloat(style.fontSize), ratio: contrast(style.color, bg) });
    }
    return out;
  });
  expect(audit.length).toBeGreaterThan(2);
  for (const item of audit) {
    expect(item.size, item.text).toBeGreaterThanOrEqual(12);
    expect(item.ratio, item.text).toBeGreaterThanOrEqual(4.5);
  }
  return box;
}

/** Kart, üstünde durması gereken sabit parçaların (alt çubuk, "Devam et" kartı) üstünde biter. */
async function expectAboveBottomChrome(page: Page, box: { y: number; height: number }) {
  const tops = await page.evaluate(() =>
    [".cp-sor-bottomnav", ".cp-prep-layout .cp-path-next"]
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => Boolean(element && element.getBoundingClientRect().height > 0))
      .map((element) => element.getBoundingClientRect().top),
  );
  expect(tops.length).toBeGreaterThan(0);
  for (const top of tops) expect(box.y + box.height).toBeLessThanOrEqual(top);
}

for (const theme of ["dark", "light"] as const) {
  test.describe(`telefona ekle · Android · ${theme}`, () => {
    test.use({ ...PHONE, userAgent: UA.android });

    test("hazırlık sayfası: olay gelince kart alt çubuğun ve 'Devam et'in üstünde; tek dokunuş pencereyi bir kez açar", { tag: ["@public"] }, async ({ page }) => {
      await open(page, "/e2e/uygulama-kur", theme);
      await expect(page.locator(".cp-sor-bottomnav")).toBeVisible();
      const card = page.locator('[data-install-card="android"]');
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
      // Olay, modül yüklenince bağlanan dinleyiciye gelir; sayfa canlanana kadar yeniden gönderilir.
      await expect(async () => {
        await firePrompt(page);
        await expect(card).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await expect(card.getByRole("heading", { name: /Telefonuna Uygulama Gibi Ekle/ })).toBeVisible();
      const box = await checkCard(page, card);
      await expectAboveBottomChrome(page, box);
      await page.screenshot({ path: `test-results/uygulama-kur-android-${theme}.png` });

      await card.getByRole("button", { name: "Ana Ekrana Ekle" }).click();
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __promptCalls?: number }).__promptCalls)).toBe(1);
      const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("cp:install-card") ?? "{}"));
      expect(stored.installed).toBe(true);

      // Kurulduktan sonra olay yeniden gelse de kart çıkmaz.
      await page.reload();
      await firePrompt(page);
      await page.waitForTimeout(500);
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
    });
  });

  test.describe(`telefona ekle · iPhone · ${theme}`, () => {
    test.use({ ...PHONE, userAgent: UA.ios });

    test("hazırlık sayfası: iki adımlı rehber; 'Şimdi değil' kapatır, 30 gün çıkmaz", { tag: ["@public"] }, async ({ page }) => {
      await open(page, "/e2e/uygulama-kur", theme);
      const card = page.locator('[data-install-card="ios"]');
      await expect(card).toBeVisible();
      await expect(card.locator("ol > li")).toHaveText([/Alttaki Paylaş simgesine dokun/, /'Ana Ekrana Ekle'yi seç/]);
      await expect(card.locator("img")).toHaveCount(0);
      const box = await checkCard(page, card);
      await expectAboveBottomChrome(page, box);
      await page.screenshot({ path: `test-results/uygulama-kur-ios-${theme}.png` });

      await card.getByRole("button", { name: "Şimdi değil" }).click();
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
      await page.reload();
      await expect(page.locator(".cp-sor-bottomnav")).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
    });

    test("ders sonucu: kart akışta, klavyeyle kapanır", { tag: ["@public"] }, async ({ page }) => {
      await open(page, "/e2e/uygulama-kur?yer=sonuc", theme);
      const card = page.locator('[data-install-card="ios"]');
      await expect(card).toBeVisible();
      expect(await card.evaluate((element) => getComputedStyle(element).position)).toBe("static");
      await checkCard(page, card);
      await card.screenshot({ path: `test-results/uygulama-kur-sonuc-${theme}.png` });
      await card.getByRole("button", { name: "Kartı kapat" }).focus();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-install-card]")).toHaveCount(0);
    });
  });
}

test.describe("telefona ekle · Instagram tarayıcısı", () => {
  test.use({ ...PHONE, userAgent: UA.instagram });

  test("kurulum yapamayan tarayıcıda kart çıkmaz", { tag: ["@public"] }, async ({ page }) => {
    await open(page, "/e2e/uygulama-kur", "dark");
    await expect(page.locator(".cp-sor-bottomnav")).toBeVisible();
    await firePrompt(page);
    await page.waitForTimeout(500);
    await expect(page.locator("[data-install-card]")).toHaveCount(0);
  });
});
