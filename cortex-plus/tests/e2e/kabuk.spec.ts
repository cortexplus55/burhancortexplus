import { expect, test, type Page } from "@playwright/test";

/*
  13 Kasım 2026, ürün sahibinin kararı (kabuk): ana ekranda onaylanan üst çubuk ve telefonun alt çubuğu giriş yapılmış
  bütün öğrenci sayfalarında aynı. Ana ekran, sınavlar listesi ve hazırlık sayfası (odak kabuğu) yan yana ölçülür:
  çubuğun her öğesi aynı yerde ve aynı boyda; yana taşma yok; telefonda alt çubuk görünür, 4 sekme, en az 48 px.
  Fikstürlerin üçü de ücretsiz hesap (çubukta "Plus'a geç" var), böylece öğeler birebir karşılaştırılır.
*/

const PAGES = [
  { key: "ana", path: "/e2e/ana-ekran?hazirlik=1" },
  { key: "sinavlar", path: "/e2e/ic-ekran?ekran=sinavlar" },
  { key: "hazirlik", path: "/e2e/ic-ekran?ekran=yol" },
] as const;

const PARTS = [
  ".cx-home-logo",
  ".cx-home-logo-mark",
  ".cx-home-nav",
  ".cx-home-start",
  ".cx-home-buy",
  ".cx-home-streak",
  ".cx-home-avatar",
  ".cx-home-more--phone",
];

async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* yok */
    }
  });
}

async function measure(page: Page) {
  return page.evaluate((parts) => {
    const rects: Record<string, [number, number, number, number] | null> = {};
    for (const selector of parts) {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      rects[selector] =
        rect && rect.width > 0 ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)] : null;
    }
    const bottom = document.querySelector(".cp-sor-bottomnav");
    const bottomVisible = bottom ? getComputedStyle(bottom).display !== "none" : false;
    const tabs = bottomVisible
      ? [...document.querySelectorAll<HTMLElement>(".cp-sor-bottomnav-link")].map((link) => Math.round(link.getBoundingClientRect().height))
      : [];
    return {
      rects,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bottomVisible,
      tabs,
      oldBar: document.querySelectorAll("header.cp-sor-top, .cp-stars-btn, .cp-founder-chip, .cp-exam-back").length,
    };
  }, PARTS);
}

for (const width of [375, 768, 1280]) {
  test(`kabuk ${width} px: üst çubuk üç sayfada aynı, taşma yok`, { tag: ["@public"] }, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    const seen: Awaited<ReturnType<typeof measure>>[] = [];
    for (const item of PAGES) {
      await page.goto(item.path);
      await expect(page.locator("header.cx-home-top")).toBeVisible();
      await page.screenshot({ path: `test-results/kabuk-${item.key}-${width}.png` });
      const m = await measure(page);
      expect(m.overflow, `${item.key} yana taşma`).toBeLessThanOrEqual(1);
      expect(m.oldBar, `${item.key} eski çubuk öğesi`).toBe(0);
      if (width < 768) {
        expect(m.bottomVisible, `${item.key} alt çubuk`).toBe(true);
        expect(m.tabs).toHaveLength(4);
        for (const height of m.tabs) expect(height).toBeGreaterThanOrEqual(48);
      } else {
        expect(m.bottomVisible, `${item.key} alt çubuk masaüstünde yok`).toBe(false);
        expect(m.rects[".cx-home-logo-mark"]?.[0]).toBe(24);
        expect(m.rects[".cx-home-logo-mark"]?.[3]).toBe(24);
      }
      seen.push(m);
    }
    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]!.rects, `${PAGES[index]!.key} ↔ ana ekran`).toEqual(seen[0]!.rects);
    }
  });
}

test("Daha fazla her sayfada aynı paneli açar; Yıldızlar oradan açılır", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e2e/ic-ekran?ekran=yol");
  await page.locator(".cx-home-nav .cx-home-more").click();
  const panel = page.getByRole("dialog", { name: "Menü" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Yıldızlar" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/dialog=stars/);
});

test("alt sayfada Geri içeriğin sol üstünde, 40 px cam; hazırlık sayfasına döner", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/ic-ekran?ekran=alt-podcast");
    const back = page.locator(".cx-shell-back-link");
    await expect(back).toBeVisible();
    const [box, header] = await Promise.all([back.boundingBox(), page.locator("header.cx-home-top").boundingBox()]);
    expect(Math.round(box!.height)).toBe(40);
    expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(Math.round(box!.x)).toBe(width < 768 ? 16 : 24);
    await page.screenshot({ path: `test-results/kabuk-geri-${width}.png` });
  }
  await page.locator(".cx-shell-back-link").click();
  await expect(page).toHaveURL(/ekran=yol/);
  // Hazırlık sayfasının kendisinde Geri yok.
  await expect(page.locator(".cx-shell-back-link")).toHaveCount(0);
});
