import { expect, test } from "@playwright/test";

const badge = {
  id: "roket",
  name: "İlk ders",
  task: "İlk dersini bitir",
  goal: "İlk dersini bitir",
  kind: "task",
  unlocked: true,
  unlockedAt: "2026-11-02T05:00:00.000Z",
};

for (const width of [320, 375, 412]) {
  test(`@public rozet penceresi ${width}px: Esc ile kapanır`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => localStorage.setItem("cortex-badges-seen", "[]"));
    await page.route("**/api/rozetler", (route) =>
      route.fulfill({
        json: { streak: {}, badges: [badge], unlockedCount: 1, next: null, nextStreak: null },
      }),
    );
    await page.goto("/e2e/rozet");
    const dialog = page.getByRole("dialog", { name: "Yeni rozet" });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
