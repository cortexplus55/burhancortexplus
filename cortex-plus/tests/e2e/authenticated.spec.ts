import { test, expect } from "@playwright/test";

/**
 * Oturumlu smoke — `auth.setup.ts` + storageState.
 * Kimlik bilgisi yoksa setup boş state yazar; bu suite de atlanır.
 */
const hasAuthCreds = Boolean(
  process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD,
);
const hasRealSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== "sb-e2e-local-only";

test.describe("authenticated student hub", { tag: ["@auth"] }, () => {
  test.beforeEach(() => {
    test.skip(
      !hasAuthCreds || !hasRealSupabase,
      "E2E_USER_* veya gerçek Supabase anahtarı yok",
    );
  });

  test("kaydedilmiş oturumla /ogretmen paneli ve chrome yüklenir", async ({
    page,
  }) => {
    await page.goto("/ogretmen");

    await expect(page).toHaveURL(/\/ogretmen/);
    await expect(page).not.toHaveURL(/\/giris/);

    const header = page.locator("header.cp-sor-top");
    await expect(header).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cortex Plus Ana Sayfa" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ana bölümler" })).toBeVisible();

    // Üst nav'da metin linki + avatar; ikisi de /profil — avatar erişilebilir adı sabit.
    await expect(page.locator("a.cp-sor-avatar")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Ana bölümler" }).getByRole("link", {
        name: "Profil",
      }),
    ).toBeVisible();

    // Ücretsiz: Satın al; Plus/kurucu: kredi çipi veya Kurucu etiketi.
    const chromeCredit = page
      .locator("a.cp-sor-credit-chip")
      .or(page.getByRole("link", { name: /Satın al/ }))
      .or(page.getByRole("link", { name: /Kurucu/ }))
      .or(page.getByText(/kr\b|Sınırsız/));
    await expect(chromeCredit.first()).toBeVisible();
  });
});
