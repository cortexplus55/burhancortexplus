import { test, expect } from "@playwright/test";

test.describe("responsive layout", () => {
  test("landing page has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("landing subject grid on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Matematik/i }).first()).toBeVisible();
  });

  test("pricing plans visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fiyatlandirma");
    await expect(page.getByRole("heading", { name: /Plus/i }).first()).toBeVisible();
  });
});

test.describe("accessibility basics", () => {
  test("document language is Turkish", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  });

  test("exactly one level-one heading per page", async ({ page }) => {
    await page.goto("/ozellikler");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("signup account step exposes accessible names", async ({ page }) => {
    await page.goto("/kayit");
    await page.getByRole("button", { name: "9. sınıf" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Matematik" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "YKS hazırlık" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Adım adım anlat" }).click();
    await page.getByRole("button", { name: "Devam" }).click();
    await page.getByRole("button", { name: "Atla" }).click();
    await expect(page.getByLabel("Ad soyad")).toBeVisible();
    await expect(page.getByLabel("E-posta")).toBeVisible();
    await expect(page.getByLabel("Şifre tekrar")).toBeVisible();
  });

  test("keyboard focus reaches the primary navigation", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe("A");
  });

  test("sign-in page exposes labelled email field", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.getByLabel("E-posta")).toBeVisible();
  });
});
