import { expect, test } from "@playwright/test";

test.describe("Hakimiyet Haritası + Kişisel Program", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Isı haritası etiketleri, kazanım açılımı, 'Zaman kalırsa' listesi ve pekiştirme", async ({ page }) => {
    await page.goto("/e2e/hakimiyet");
    const map = page.getByTestId("mastery-map");
    const units = map.getByTestId("mm-unit");
    await expect(units).toHaveCount(4);
    await expect(units.nth(0)).toHaveAttribute("data-tone", "high");
    await expect(units.nth(0)).toContainText("Bu konuya %80 hakimsin · 3 yanıta dayalı");
    await expect(units.nth(1)).toHaveAttribute("data-tone", "low");
    await expect(units.nth(1)).toContainText("Bu konuya %19 hakimsin · 4 yanıta dayalı");
    await expect(units.nth(2)).toContainText("Henüz yeterli veri yok");
    await expect(units.nth(2)).toContainText("Kendi işaretin: Biliyorum");
    await expect(units.nth(3)).toHaveAttribute("data-tone", "none");
    await expect(map).not.toContainText(/· \d+\. /);

    await units.nth(0).getByRole("button").click();
    const outcomes = units.nth(0).getByTestId("mm-outcomes").locator("li");
    await expect(outcomes).toHaveCount(2);
    await expect(outcomes.nth(0)).toContainText("Bu konuya %75 hakimsin · tahmini");

    await expect(page.getByTestId("plan-totals")).toHaveText("Planın 5 saat 24 dk, senin 3 saatin var.");
    await expect(page.getByTestId("plan-list").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("plan-list").locator("li").first()).toContainText("Fikstür Ünitesi B");
    const later = page.getByTestId("plan-if-time");
    await expect(map).toContainText("Zaman kalırsa");
    await expect(later.locator("li")).toHaveCount(2);
    await expect(later).toContainText("Fikstür Ünitesi D");

    await map.getByRole("button", { name: /Fikstür Ünitesi B: 2 zayıf kazanım/ }).click();
    await page.getByRole("button", { name: "Ek soruları çöz" }).click();
    for (let i = 0; i < 2; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 2`);
      await page.getByTestId("level-runner").getByRole("button", { name: /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("reinforce-result")).toContainText("2 ek sorudan 2 doğru");
    await expect(page.getByTestId("reinforce-missing")).toContainText("Bu kazanım için ek soru hazır değil");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
