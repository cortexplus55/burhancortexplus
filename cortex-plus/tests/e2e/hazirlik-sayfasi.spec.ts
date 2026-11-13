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
