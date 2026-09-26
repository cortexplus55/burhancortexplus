import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Oturum bir kez alınır, `playwright/.auth/user.json` olarak saklanır.
 * `chromium-authenticated` projesi bu dosyayı `storageState` olarak kullanır.
 *
 * Gerekli env (kod/commit'e yazılmaz):
 * - E2E_USER_EMAIL
 * - E2E_USER_PASSWORD
 * - Gerçek NEXT_PUBLIC_SUPABASE_* (`.env.local` veya CI secret)
 */
const AUTH_FILE = path.join(__dirname, "../../playwright/.auth/user.json");

function writeEmptyAuthState() {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify({ cookies: [], origins: [] }, null, 2),
  );
}

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    writeEmptyAuthState();
    setup.skip(
      true,
      "E2E_USER_EMAIL / E2E_USER_PASSWORD yok — authenticated suite atlanır",
    );
    return;
  }

  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!publishable || publishable === "sb-e2e-local-only") {
    writeEmptyAuthState();
    setup.skip(
      true,
      "Gerçek NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY gerekli (sahte E2E anahtarıyla giriş olmaz)",
    );
    return;
  }

  await page.goto("/giris?next=/ogretmen");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  await expect(page).toHaveURL(/\/ogretmen/, { timeout: 45_000 });
  await expect(page.locator("header.cp-sor-top")).toBeVisible({
    timeout: 30_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
