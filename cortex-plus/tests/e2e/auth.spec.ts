import { test, expect, type Page } from "@playwright/test";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/ogretmen",
  "/dokumanlar",
  "/krediler",
  "/admin",
];

/** Öğrenci kayıt — hesap adımına en kısa yol. */
async function openSignupAccountStep(page: Page) {
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
  await expect(page.getByRole("heading", { name: "Hesabını oluştur" })).toBeVisible();
}

test.describe("authentication guards", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects anonymous visitors to sign in`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`/giris\\?next=${route.replace("/", "%2F")}`));
    });
  }

  test("legacy teacher panel URL redirects to student hub", async ({ page }) => {
    await page.goto("/ogretmen-paneli");
    await expect(page).toHaveURL(/\/ogretmen$/);
  });

  test("sign-in form validates required fields", async ({ page }) => {
    await page.goto("/giris");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    const email = page.getByLabel("E-posta");
    await expect(email).toHaveJSProperty("validity.valueMissing", true);
  });

  test("registration blocks a weak password", async ({ page }) => {
    await openSignupAccountStep(page);
    await page.getByLabel("Ad soyad").fill("Test Kullanıcı");
    await page.getByLabel("E-posta").fill("ornek@cortexplus.app");
    await page.getByLabel("Şifre", { exact: true }).fill("zayifsifre1");
    await page.getByLabel("Şifre tekrar").fill("zayifsifre1");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Hesabı oluştur" }).click();
    await expect(page.getByText("En az bir büyük harf gerekli.")).toBeVisible();
  });

  test("password reset never reveals whether an account exists", async ({ page }) => {
    await page.goto("/sifremi-unuttum");
    await page.getByLabel("E-posta").fill("bilinmeyen@cortexplus.app");
    await page.getByRole("button", { name: /Sıfırlama bağlantısı gönder/ }).click();
    await expect(page.getByText(/hesap varsa/i)).toBeVisible({ timeout: 20000 });
  });
});
