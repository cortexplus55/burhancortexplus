import { expect, test } from "@playwright/test";

/** UX tur 2, bulgu 3: Konular adımında ders düzeyinde toplu "Biliyorum / Orta / Zayıf" işaretleme (320/375/412). */
for (const width of [320, 375, 412]) {
  test(`Konular: ders düzeyinde toplu işaretleme @ ${width}px`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/resmi-kurulum");
    await page.getByRole("button", { name: /YKS \(TYT · AYT · YDT\)/ }).click();
    await page.getByRole("radio", { name: "🎯 Sadece TYT (Temel)" }).click();
    await page.getByRole("button", { name: "Konuları gör" }).click();
    const ders = page.locator("details", { hasText: "TYT Türkçe" });
    await ders.locator("summary").click();
    const bulk = ders.getByTestId("setup-bulk");
    await expect(bulk).toContainText("(0/16 ünite işaretli)");
    await bulk.getByRole("button", { name: "Zayıf" }).click();
    await expect(bulk).toContainText("(16/16 ünite işaretli)");
    const units = ders.getByTestId("setup-unit");
    await expect(units.first().getByRole("radio", { name: "Zayıf" })).toHaveAttribute("aria-checked", "true");
    await expect(units.last().getByRole("radio", { name: "Zayıf" })).toHaveAttribute("aria-checked", "true");
    // Tek ünite yine ayrı değiştirilebilir.
    await units.first().getByRole("radio", { name: "Biliyorum" }).click();
    await expect(units.first().getByRole("radio", { name: "Biliyorum" })).toHaveAttribute("aria-checked", "true");
    await expect(units.nth(1).getByRole("radio", { name: "Zayıf" })).toHaveAttribute("aria-checked", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (process.env.UX_SHOTS) await page.screenshot({ path: `${process.env.UX_SHOTS}/b3_konular_${width}.png` });
  });
}
