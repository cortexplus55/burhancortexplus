import { expect, test, type Page } from "@playwright/test";

/*
  13 Kasım 2026, ürün sahibinin kararı (3C, hazırlık sayfası): yalnız görünüm. Sol bilgi kartı 400 px, bg-1, köşe 24,
  dolgu 28, kenarlıksız; akordeon satırları kenarlıksız (kapalı bg-1, açık bg-2), köşe 24; düz 40 px düğümler; altta
  sabit kart ve sayfadaki tek marka düğmesi "Devam et". Telefonda bilgi kartı üstte, yol altta, sabit kart alt sekme
  çubuğunun hemen üstünde.
*/

async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* yok */
    }
  });
}

for (const size of [
  { width: 375, height: 812 },
  { width: 1280, height: 900 },
  { width: 1536, height: 960 },
]) {
  test(`hazırlık sayfası ${size.width} px: kart, akordeon, düğüm, tek marka düğmesi`, { tag: ["@public"] }, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(size);
    await page.goto("/e2e/ic-ekran?ekran=yol");
    await expect(page.locator(".cp-prep-aside")).toBeVisible();
    await expect(page.locator(".cp-path-next")).toBeVisible();
    const m = await page.evaluate(() => {
      const style = (element: Element) => getComputedStyle(element);
      const aside = document.querySelector(".cp-prep-aside")!;
      const asideBox = aside.getBoundingClientRect();
      const sections = [...document.querySelectorAll(".cp-path-section")];
      const nodes = [...document.querySelectorAll(".cp-prep-layout .cx-node")].map((node) => {
        const box = node.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
      });
      // Marka gradyanı (brand-strong → brand) taşıyan görünür düğmeler.
      const brand = [...document.querySelectorAll<HTMLElement>(".cp-prep-layout a, .cp-prep-layout button")].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && style(element).backgroundImage.includes("rgb(79, 70, 229)");
      });
      const card = document.querySelector(".cp-path-next")!.getBoundingClientRect();
      const nav = document.querySelector(".cp-sor-bottomnav");
      const navBox = nav && style(nav).display !== "none" ? nav.getBoundingClientRect() : null;
      return {
        asideWidth: Math.round(asideBox.width),
        asideRadius: style(aside).borderTopLeftRadius,
        asidePadding: style(aside).paddingTop,
        asideBorder: style(aside).borderTopWidth,
        sectionBorders: sections.map((section) => style(section).borderTopWidth),
        sectionRadius: sections.map((section) => style(section).borderTopLeftRadius),
        openBg: sections.filter((section) => section.classList.contains("is-open")).map((section) => style(section).backgroundColor),
        closedBg: sections.filter((section) => !section.classList.contains("is-open")).map((section) => style(section).backgroundColor),
        nodes,
        brand: brand.map((element) => element.textContent?.trim()),
        cardBottom: Math.round(card.bottom),
        navTop: navBox ? Math.round(navBox.top) : null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        puck: document.querySelectorAll(".cp-puck, .cp-path-beam, .cp-path-lines").length,
      };
    });
    expect(m.overflow).toBeLessThanOrEqual(1);
    expect(m.asideRadius).toBe("24px");
    expect(m.asideBorder).toBe("0px");
    if (size.width >= 1024) {
      expect(m.asideWidth).toBe(400);
      expect(m.asidePadding).toBe("28px");
    }
    expect(new Set(m.sectionBorders)).toEqual(new Set(["0px"]));
    expect(new Set(m.sectionRadius)).toEqual(new Set(["24px"]));
    // Açık grup bir basamak açık zeminde (kapalı satırlardan farklı).
    expect(m.openBg.length).toBeGreaterThan(0);
    for (const open of m.openBg) expect(m.closedBg).not.toContain(open);
    for (const [width, height] of m.nodes) {
      expect(width).toBe(40);
      expect(height).toBe(40);
    }
    expect(m.puck).toBe(0);
    expect(m.brand).toEqual(["Devam et"]);
    if (m.navTop != null) {
      // Telefonda sabit kart alt sekme çubuğunun hemen üstünde.
      expect(m.cardBottom).toBeLessThanOrEqual(m.navTop);
      expect(m.navTop - m.cardBottom).toBeLessThanOrEqual(12);
    }
    await page.screenshot({ path: `test-results/hazirlik-${size.width}.png` });
  });
}

test("telefonda sayfanın sonu sabit kartın altında kalmaz", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/ic-ekran?ekran=yol");
  await expect(page.locator(".cp-path-next")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const m = await page.evaluate(() => {
    const card = document.querySelector(".cp-path-next")!.getBoundingClientRect();
    const items = [...document.querySelectorAll(".cp-prep-main > *")].filter((element) => !element.classList.contains("cp-path-next"));
    return { cardTop: card.top, lastBottom: items[items.length - 1]!.getBoundingClientRect().bottom };
  });
  expect(m.lastBottom).toBeLessThanOrEqual(m.cardTop);
});

test("telefonda sabit kart küçük: en çok 104 px, rozet yok, ad tek satır, ⋯ + Devam et; menü ikincil eylemleri gösterir", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/ic-ekran?ekran=yol");
  const card = page.locator(".cp-path-next");
  await expect(card).toBeVisible();
  const m = await card.evaluate((element) => {
    const box = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
    const title = element.querySelector(".cp-path-next-title")!;
    const more = box(".cx-next-more");
    const primary = box(".cp-exam-continue--primary");
    const actions = box(".cp-path-next-actions");
    return {
      height: Math.round(element.getBoundingClientRect().height),
      badges: getComputedStyle(element.querySelector(".cp-prep-badges")!).display,
      titleNowrap: getComputedStyle(title).whiteSpace,
      titleEllipsis: getComputedStyle(title).textOverflow,
      titleFont: getComputedStyle(title).fontSize,
      more: [Math.round(more.width), Math.round(more.height), Math.round(more.left - actions.left)],
      primary: [Math.round(primary.height), Math.round(primary.right - actions.right), primary.left > more.right],
      brandText: element.querySelector(".cp-exam-continue--primary")!.textContent?.trim(),
      moreLabel: element.querySelector(".cx-next-more")!.getAttribute("aria-label"),
    };
  });
  expect(m.height).toBeLessThanOrEqual(104);
  expect(m.badges).toBe("none");
  expect(m.titleNowrap).toBe("nowrap");
  expect(m.titleEllipsis).toBe("ellipsis");
  expect(m.titleFont).toBe("16px");
  expect(m.more).toEqual([44, 44, 0]);
  expect(m.primary[0]).toBe(44);
  expect(Math.abs(m.primary[1] as number)).toBeLessThanOrEqual(1);
  expect(m.primary[2]).toBe(true);
  expect(m.brandText).toBe("Devam et");
  expect(m.moreLabel).toBe("Daha fazla");
  // İkincil eylemler kapalıyken görünmez; ⋯ açar, etiketler aynı; Escape kapatır.
  await expect(card.getByRole("button", { name: "Başka birini seç" })).toBeHidden();
  await card.locator(".cx-next-more").click();
  await expect(card.locator(".cx-next-more")).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByRole("button", { name: "Başka birini seç" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Başka Bir Konu veya Etkinlik Seç" })).toBeVisible();
  const menuInView = await card.locator(".cx-next-secondary").evaluate((menu) => {
    const box = menu.getBoundingClientRect();
    return box.top >= 0 && box.left >= 0 && box.right <= innerWidth;
  });
  expect(menuInView).toBe(true);
  await page.screenshot({ path: "test-results/hazirlik-375-menu.png" });
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "Başka birini seç" })).toBeHidden();
});

test("masaüstünde sabit kart değişmedi: ⋯ yok, ikincil eylemler kartta", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e2e/ic-ekran?ekran=yol");
  const card = page.locator(".cp-path-next");
  await expect(card.locator(".cp-prep-badge")).toHaveCount(2);
  await expect(card.locator(".cx-next-more")).toBeHidden();
  await expect(card.getByRole("button", { name: "Başka birini seç" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Başka Bir Konu veya Etkinlik Seç" })).toBeVisible();
  const primaryHeight = await card.locator(".cp-exam-continue--primary").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(primaryHeight).toBe(52);
});
