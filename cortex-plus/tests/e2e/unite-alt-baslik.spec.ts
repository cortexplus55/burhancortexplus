import { expect, test, type Page } from "@playwright/test";

/*
  Faz 10 (20 Kasım 2026): kurulumun konu adımı ana üniteleri gösterir; her ünitenin altında küçük alt başlık listesi.
  Telefonda (375 ve 360 px) ve masaüstünde yana taşmaz; ünite kaldırılınca alt başlıkları da gider (seçim ünite
  düzeyinde). Fikstür `/e2e/sihirbaz?adim=topics` (yer tutucu üniteler ve alt başlıklar).
*/

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const width of [375, 360, 1280] as const) {
  test(`konu adımı ${width}px: ünite altında alt başlıklar, taşma yok`, { tag: ["@public"] }, async ({ page }) => {
    // Fikstür Plus kabuğunda açılır; tek seferlik "Seri" karşılaması (`GamificationGate`) tıklamayı keser. Karşılaması
    // görülmüş bir tarayıcıyla başlanır (aynı yol: `donusum.spec.ts`).
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalıysa pencere zaten test edilen şey değil */
      }
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/sihirbaz?adim=topics");
    const lists = page.locator(".apw-topic-subtopics");
    await expect(lists.first()).toBeVisible();
    await expect(lists).toHaveCount(4);
    await expect(lists.first().locator("li")).toHaveCount(3);
    await expect(lists.first()).toHaveAttribute("aria-label", /Birinci ünite: temel kavramlar alt başlıkları/);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // Alt başlık kutusu kendi satırının içinde kalır (uzun ad sarar, kesilmez).
    const escaped = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".apw-topic-subtopics")).filter((node) => {
        const box = node.getBoundingClientRect();
        const row = (node.closest("li") as HTMLElement | null)?.getBoundingClientRect();
        return !row || box.right > row.right + 1 || box.left < row.left - 1;
      }).length,
    );
    expect(escaped).toBe(0);
    // Konu kartının kenarlı `li` görünümü (kenar, iç boşluk) alt başlıklara inmez: düz liste.
    const boxed = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".apw-topic-subtopics li")).filter((node) => {
        const style = getComputedStyle(node);
        return style.borderTopWidth !== "0px" || style.paddingTop !== "0px";
      }).length,
    );
    expect(boxed).toBe(0);
    await page.getByRole("button", { name: "Konuyu kaldır" }).first().click();
    await expect(lists).toHaveCount(3);
    await expect(page.getByText("Alt başlık A 1", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `test-results/unite-alt-baslik-${width}.png`, fullPage: true });
  });
}
