import { expect, test, type Page } from "@playwright/test";

/*
  21 Kasım 2026, Faz 11 (teacher.v2): öğretmen ana ekranının geçmiş paneli ve Geçmiş konuşmalar sayfasının hazırlık
  grupları (/e2e/sohbet-gecmisi fikstürü, veritabanısız). Panelin verisi `/api/teacher/conversations`'tan; test o isteği
  kendi cevabıyla karşılar. Telefonda (360, 390) ve masaüstünde (1280): yana taşma yok, çekmece açılır ve kapanır (Esc,
  odak düğmeye döner), geniş ekranda yan panel daralır ve açılır, sohbet sütunu 48rem'in altına inmez, panel yazma alanına
  ve üst çubuğa binmez, dokunma hedefleri ≥40 px (telefonda ≥44 px). Öğretmen v3 (21 Kasım 2026): açık sohbette geçmiş
  48 px şeridin saat düğmesinden ("Sohbet geçmişi") açılır; ana ekrandaki "Geçmiş" düğmesi sohbet açılmadan kalır.
*/

const GROUPS = {
  grouped: true,
  groups: [
    {
      key: "p-hucre",
      prepId: "p-hucre",
      title: "Hücre Bölünmeleri ve Kalıtım",
      examDate: "2026-12-26",
      conversations: [
        { id: "c-mayoz", title: "Mayoz ve krossing over", updatedAt: "2026-11-21T10:00:00.000Z" },
        { id: "c-mitoz", title: "Mitoz evreleri", updatedAt: "2026-11-20T10:00:00.000Z" },
      ],
    },
    {
      key: "p-tarih",
      prepId: "p-tarih",
      title: "Osmanlı Yenileşme Dönemi ve Anayasal Gelişmeler",
      examDate: "2027-03-28",
      conversations: [{ id: "c-tanzimat", title: "Tanzimat Fermanı hangi hakları güvenceye aldı ve neden önemli", updatedAt: "2026-11-19T10:00:00.000Z" }],
    },
    {
      key: "genel",
      prepId: null,
      title: "Genel sohbetler",
      examDate: null,
      conversations: [{ id: "c-plan", title: "Çalışma planı önerisi", updatedAt: "2026-11-18T10:00:00.000Z" }],
    },
  ],
};

async function serveHistory(page: Page) {
  let calls = 0;
  await page.route("**/api/teacher/conversations", async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GROUPS) });
  });
  return () => calls;
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * Sayfadaki sonlu animasyonların bitmesini bekler (sonsuz olanlar, ör. yükleniyor dalgası, beklenmez). Giriş animasyonu
 * (`translate`) sürerken ölçülen kutu ondalık hata taşıyor: 44 px'lik düğme 43,99997 px okunup testi kararsız
 * düşürüyordu (26 Kasım 2026, CI). Ölçüm her zaman animasyon bittikten sonra; 44 px kuralı aynen.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
      // Duraklatılmış bir animasyon beklemeyi kilitlemesin.
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
}

async function rect(page: Page, selector: string) {
  await settle(page);
  return page.locator(selector).first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  });
}

/** Görünen etkileşimli öğelerin en küçük kenarı. */
async function smallestTarget(page: Page, scope: string) {
  await settle(page);
  return page.locator(scope).evaluate((root) => {
    const items = [...root.querySelectorAll("a, button")].filter((node) => (node as HTMLElement).offsetParent !== null);
    return Math.min(...items.map((node) => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height)));
  });
}

for (const width of [360, 390] as const) {
  test(`telefon ${width} px: şeridin geçmiş düğmesi çekmeceyi açar, Esc kapatır, odak düğmeye döner`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const calls = await serveHistory(page);
    await page.goto("/e2e/sohbet-gecmisi?durum=sohbet");
    await expect(page.locator(".cx-v3-thread")).toBeAttached({ timeout: 30_000 });
    // Ana ekranın "Geçmiş" düğmesi açık sohbette yok; yerine şeridin saat düğmesi.
    await expect(page.getByRole("button", { name: "Geçmiş", exact: true })).toBeHidden();
    const toggle = page.getByRole("button", { name: "Sohbet geçmişi", exact: true });
    await expect(toggle).toBeVisible();
    // Gizli yan panel istek atmaz.
    expect(calls()).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Düğme şeridin "Geri" ile "Yeni sohbet" arasında; ikisine de binmez.
    const button = await rect(page, ".cx-v3-bar [aria-label='Sohbet geçmişi']");
    const barItems = await page.locator(".cx-v3-bar").first().evaluate((bar) =>
      [...bar.querySelectorAll("a, button")].map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right };
      }),
    );
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.left).toBeGreaterThanOrEqual(barItems[0]!.right);
    expect(button.right).toBeLessThanOrEqual(barItems[barItems.length - 1]!.left);

    await toggle.click();
    const drawer = page.getByRole("dialog", { name: "Sohbet geçmişi" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Mayoz ve krossing over" })).toHaveAttribute("aria-current", "page");
    await expect(drawer.getByRole("link", { name: "Mitoz evreleri" })).toHaveAttribute("href", "/ogretmen?sohbet=c-mitoz");
    expect(calls()).toBe(1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallestTarget(page, ".cx-thist-drawer")).toBeGreaterThanOrEqual(44);

    // Çekmece alttaki gezinme çubuğunun üstünde: son öğesi çubuğun arkasında kalmaz.
    const sheet = await rect(page, ".cx-thist-drawer");
    expect(sheet.bottom).toBeLessThanOrEqual(800);
    const footer = await rect(page, ".cx-thist-drawer .cx-thist-all");
    const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".cx-thist-drawer") !== null, {
      x: footer.left + footer.width / 2,
      y: footer.top + footer.height / 2,
    });
    expect(topmost).toBe(true);

    // Odak çekmecenin içinde kalır: son öğeden sonra baştakine döner. Tuzak odağı bir sonraki karede geri koyar
    // (koruyucu öğe → ilk öğe); her basıştan sonra o kareyi bekleriz, süreyle değil.
    const inDrawer = () => page.evaluate(() => document.activeElement?.closest(".cx-thist-drawer") !== null);
    await expect(drawer.getByRole("button", { name: "Kapat" })).toBeFocused();
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      await expect.poll(inDrawer).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    await expect.poll(inDrawer).toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();

    // Grup daralır ve açılır.
    await toggle.click();
    const group = drawer.getByRole("button", { name: /Osmanlı Yenileşme Dönemi/ });
    await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await expect(drawer.getByRole("link", { name: /Tanzimat Fermanı/ })).toBeHidden();
    await group.click();
    await expect(drawer.getByRole("link", { name: /Tanzimat Fermanı/ })).toBeVisible();
    await drawer.getByRole("button", { name: "Kapat" }).click();
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test(`telefon ${width} px: ana ekranda Geçmiş düğmesi yazma alanına binmez, taşma yok`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await serveHistory(page);
    for (const state of ["hazirlik", "bos"]) {
      await page.goto(`/e2e/sohbet-gecmisi?durum=${state}`);
      const toggle = page.getByRole("button", { name: "Geçmiş", exact: true });
      await expect(toggle).toBeVisible({ timeout: 30_000 });
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      const button = await rect(page, ".cx-thist-toggle");
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.right).toBeLessThanOrEqual(width);
      // Üst çubuğun altında.
      const header = await rect(page, ".cx-home-top");
      expect(button.top).toBeGreaterThanOrEqual(header.bottom);
      await toggle.click();
      await expect(page.getByRole("dialog", { name: "Sohbet geçmişi" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
    }
  });

  test(`telefon ${width} px: Geçmiş konuşmalar sayfası hazırlığa göre gruplu, taşma yok`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/sohbet-gecmisi?durum=liste");
    const group = page.getByRole("button", { name: /Hücre Bölünmeleri ve Kalıtım/ });
    await expect(group).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Genel sohbetler/ })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const header = await rect(page, ".cx-hgroup-toggle");
    expect(header.height).toBeGreaterThanOrEqual(44);
    await group.click();
    await expect(page.getByRole("link", { name: "Mayoz ve krossing over" })).toBeHidden();
    await group.click();
    await expect(page.getByRole("link", { name: "Mayoz ve krossing over" })).toBeVisible();
  });
}

test("masaüstü 1280 px: yan panel sütunu daraltmaz, daralır ve açılır", { tag: ["@public"] }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const calls = await serveHistory(page);
  await page.goto("/e2e/sohbet-gecmisi?durum=sohbet");
  const dock = page.getByRole("complementary", { name: "Sohbet geçmişi" });
  await expect(dock).toBeVisible({ timeout: 30_000 });
  await expect(dock.getByRole("link", { name: "Mayoz ve krossing over" })).toHaveAttribute("aria-current", "page");
  expect(calls()).toBe(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  // Öğretmen v3: panel ekranın solunda sabit; şerit, sohbet sütunu ve kapsül onun sağında, sütun daralmaz (44rem).
  const panel = await rect(page, ".cx-thist-dock");
  const bar = await rect(page, ".cx-v3-bar");
  const composer = await rect(page, ".cx-v3-capsule");
  const column = await rect(page, ".cx-v3-col");
  expect(panel.top).toBeGreaterThanOrEqual(0);
  expect(panel.bottom).toBeLessThanOrEqual(800);
  expect(bar.left).toBeGreaterThanOrEqual(panel.right);
  expect(panel.right).toBeLessThanOrEqual(composer.left);
  expect(column.left).toBeGreaterThanOrEqual(panel.right);
  expect(column.width).toBeGreaterThanOrEqual(680);
  expect(await smallestTarget(page, ".cx-thist-dock")).toBeGreaterThanOrEqual(40);
  // Ana ekranın "Geçmiş" düğmesi açık sohbette yok.
  await expect(page.getByRole("button", { name: "Geçmiş", exact: true })).toBeHidden();

  await dock.getByRole("button", { name: "Geçmişi daralt" }).click();
  await expect(dock).toBeHidden();
  const toggle = page.getByRole("button", { name: "Sohbet geçmişi", exact: true });
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeFocused();
  const collapsedComposer = await rect(page, ".cx-v3-capsule");
  expect(Math.round(collapsedComposer.left + collapsedComposer.width / 2)).toBe(640);
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  // Tercih yenilemede korunur.
  await page.reload();
  await expect(page.getByRole("button", { name: "Sohbet geçmişi", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Sohbet geçmişi" })).toBeHidden();

  await page.getByRole("button", { name: "Sohbet geçmişi", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Sohbet geçmişi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Geçmişi daralt" })).toBeFocused();
  // Çekmece açılmadı: geniş ekranda açık sohbette geçmiş yan panelde.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("masaüstü 1280 px: sohbet açılmadan ana ekranda Geçmiş çekmeceyi açar, üst çubuğa binmez", { tag: ["@public"] }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await serveHistory(page);
  await page.goto("/e2e/sohbet-gecmisi?durum=hazirlik");
  const toggle = page.getByRole("button", { name: "Geçmiş", exact: true });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  const button = await rect(page, ".cx-thist-toggle");
  const header = await rect(page, ".cx-home-top");
  expect(button.top).toBeGreaterThanOrEqual(header.bottom);
  // Halkaya ve metin bloğuna binmez.
  for (const selector of [".cx-ring", ".cx-cockpit-text", ".cx-strip"]) {
    const other = await rect(page, selector);
    const overlaps = button.left < other.right && button.right > other.left && button.top < other.bottom && button.bottom > other.top;
    expect(overlaps, selector).toBe(false);
  }
  await expect(page.getByRole("complementary", { name: "Sohbet geçmişi" })).toBeHidden();
  await toggle.click();
  const drawer = page.getByRole("dialog", { name: "Sohbet geçmişi" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("masaüstü 1280 px: Geçmiş konuşmalar sayfası gruplu, taşma yok", { tag: ["@public"] }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/sohbet-gecmisi?durum=liste");
  await expect(page.getByRole("button", { name: /Hücre Bölünmeleri ve Kalıtım/ })).toBeVisible({ timeout: 30_000 });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  expect(await smallestTarget(page, ".cx-page")).toBeGreaterThanOrEqual(40);
});
