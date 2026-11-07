import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { CONSENT_COOKIE } from "./consent-cookie";

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

  /*
    Uyum paketi (7 Kasım 2026): test hesabı bugünkü metinleri onaylamamışsa onay kapısı her sayfayı örter. Test
    hesabı adına okuma kanıtıyla onaylanır (yalnız E2E_USER_* verildiğinde, kullanıcının kendi test hesabı); çerez
    tercihi de verilir ki bant tıklamalara binmesin.
  */
  const now = new Date();
  const opened = new Date(now.getTime() - 60_000).toISOString();
  const evidence = (version: string) => ({ version, openedAt: opened, confirmedAt: now.toISOString(), scrolledToEnd: true });
  const status = await page.request.get("/api/consent/status");
  if (status.ok()) {
    const body = (await status.json()) as { ok?: boolean; missing?: { type: string; version: string }[]; ageNeeded?: boolean };
    if (body.ok && (body.missing?.length || body.ageNeeded)) {
      const documents = Object.fromEntries((body.missing ?? []).map((item) => [item.type, evidence(item.version)]));
      const accepted = await page.request.post("/api/consent/accept", {
        data: { documents, ...(body.ageNeeded ? { age: { minor: false, guardianAck: false } } : {}) },
      });
      expect(accepted.ok()).toBe(true);
    }
  }
  await page.context().addCookies([CONSENT_COOKIE]);

  await page.context().storageState({ path: AUTH_FILE });
});
