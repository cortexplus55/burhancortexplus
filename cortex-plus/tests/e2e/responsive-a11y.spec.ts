import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

  test("pricing page loads on mobile without overflow blocker", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fiyatlandirma");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Fiyatlandırma",
    );

    /*
      E2E sunucusu sahte Supabase anahtarıyla kalkıyor; `plans` boş dönüyor ve
      sayfa bilerek "listelenemiyor" kutusunu çiziyor. Plus başlığı yalnızca
      paket kartları çizildiğinde var. Tutulması gereken söz veri değil:
      mobilde ziyaretçiye bir şeyin görünür çizilmesi ve yatay taşma olmaması.
    */
    await expect(
      page
        .getByRole("heading", { name: /Plus/i })
        .first()
        .or(page.getByText("Paketler şu an listelenemiyor")),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // Alt menü bağlantıları eskiden 20 piksel yüksekliğindeydi, aralarında da
  // 8 piksel vardı; parmakla yanlış sayfaya gitmek kural oluyordu.
  test("footer links are tappable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const heights = await page.evaluate(() =>
      [...document.querySelectorAll("footer .mk-footer-links a")].map(
        (el) => el.getBoundingClientRect().height,
      ),
    );

    expect(heights.length).toBeGreaterThan(5);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(36);
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

const PUBLIC_SCREENS = [
  "/",
  "/fiyatlandirma",
  "/ozellikler",
  "/giris",
  "/kayit",
] as const;

test.describe("design system responsive a11y", () => {
  for (const path of PUBLIC_SCREENS) {
    for (const width of [360, 1280] as const) {
      test(`${path} @ ${width}px: no overflow and no critical axe`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 360 ? 740 : 900 });
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        );
        expect(overflow).toBe(true);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        const serious = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        );
        expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

        await page.screenshot({
          path: `test-results/a11y${path === "/" ? "/home" : path}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }
});
