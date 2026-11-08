import { expect, test, type Page } from "@playwright/test";

/*
  8 Kasım 2026: öğrencinin ana ekranı (/ogretmen fikstürü). Telefon, tablet ve masaüstünde: yana taşma yok; mod
  düğmeleri ortada ve kırpılmıyor; selamın altındaki son kart ve sohbetin son satırı en alta kaydırınca yazma alanının
  (ve üstündeki geçişin) üstünde kalıyor; stüdyo kartlarının ortasına tıklanınca kartın kendisi yakalanıyor.
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

async function scrollToEnd(page: Page) {
  // Yazma alanı ölçülene kadar (hidrasyon) alt boşluk ilk boyamadaki tahmindir.
  await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".cp-sor-hero, .cp-sor-messages")) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await page.waitForTimeout(400);
}

async function layout(page: Page, lastSelector: string) {
  return page.evaluate((selector) => {
    const zone = document.querySelector(".cp-sor-composer-zone")!.getBoundingClientRect();
    const items = [...document.querySelectorAll(selector)].filter((node) => (node as HTMLElement).offsetParent !== null);
    const last = items[items.length - 1]!.getBoundingClientRect();
    const mode = document.querySelector(".cp-tutor-mode")!;
    const pills = [...mode.querySelectorAll(".cp-tutor-mode-pill")].map((pill) => pill.getBoundingClientRect());
    const modeBox = mode.getBoundingClientRect();
    const left = pills[0]!.left - modeBox.left;
    const right = modeBox.right - pills[pills.length - 1]!.right;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Geçiş (::before) bestecinin 1.75rem üstünden başlıyor.
      gap: Math.round(zone.top - 28 - last.bottom),
      centered: Math.abs(left - right) <= 2,
      clipped: mode.scrollWidth > mode.clientWidth + 1,
    };
  }, lastSelector);
}

for (const size of SIZES) {
  test(`ana ekran ${size.width}×${size.height}: üst üste binme yok`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);

    await page.goto("/e2e/ana-ekran");
    await expect(page.getByRole("heading", { name: "Bugün nasıl çalışmak istersin?" })).toBeVisible();
    await expect(page.locator(".hs-card")).toHaveCount(8);
    await scrollToEnd(page);
    const empty = await layout(page, ".hs, .cp-first-step, .pm-card");
    expect(empty.overflow).toBeLessThanOrEqual(1);
    expect(empty.gap).toBeGreaterThanOrEqual(0);
    expect(empty.centered).toBe(true);
    expect(empty.clipped).toBe(false);
    await page.screenshot({ path: `test-results/ana-ekran-${size.width}-bos.png` });

    await page.goto("/e2e/ana-ekran?durum=sohbet");
    await expect(page.getByRole("link", { name: /Plus'a geç/ })).toBeAttached();
    await scrollToEnd(page);
    const thread = await layout(page, ".cp-sor-upgrade-row");
    expect(thread.overflow).toBeLessThanOrEqual(1);
    expect(thread.gap).toBeGreaterThanOrEqual(0);
    expect(thread.centered).toBe(true);
    await page.screenshot({ path: `test-results/ana-ekran-${size.width}-sohbet.png` });
  });
}

test("stüdyo kartları tıklanabilir: ortalarında başka bir katman yok, dokunma alanı yeterli", { tag: ["@public"] }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/ana-ekran");
  const cards = page.locator(".hs-card");
  await expect(cards).toHaveCount(8);
  await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
  for (let index = 0; index < 8; index += 1) {
    const card = cards.nth(index);
    // Klavyeyle odaklanır gibi: kaydırma kartı yazma alanının üstüne getirmeli (scroll-padding-bottom).
    await card.focus();
    await page.waitForTimeout(300);
    const box = (await card.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const hit = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest(".hs-card")),
      [box.x + box.width / 2, box.y + box.height / 2] as const,
    );
    expect(hit, `kart ${index}`).toBe(true);
  }
});
