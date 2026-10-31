import { expect, test } from "@playwright/test";

/**
 * Paket J denetimi (31 Ekim 2026): yedi akış, veritabanısız. Sayfalar `/e2e/*` fikstürleri (yalnız E2E_FIXTURE=1),
 * ağ uçları `page.route` ile taklit edilir. Konuya özgü içerik yok.
 */

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

test.describe("Paket J akışları", { tag: ["@public"] }, () => {
  test("3 adımlı kayıt: seviye → anlatım → hesap; sunucu kaydı ve /kayit/tamamla", async ({ page }) => {
    let signupBody: Record<string, unknown> | null = null;
    await page.route("**/api/auth/signup", async (route) => {
      signupBody = route.request().postDataJSON();
      await route.fulfill(json({ ok: true }));
    });
    // Şifreyle giriş: Supabase taklidi (gerçek projeye istek gitmez).
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill(
        json({
          access_token: "e2e.e2e.e2e",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "e2e-refresh",
          user: { id: "00000000-0000-4000-8000-0000000000e2", aud: "authenticated", email: "ogrenci@example.com", app_metadata: {}, user_metadata: {} },
        }),
      ),
    );
    const tamamla = page.waitForRequest((request) => request.url().includes("/kayit/tamamla"));

    await page.goto("/kayit");
    await expect(page.getByRole("heading", { name: "Hangi sınıftasın, hedefin ne?" })).toBeVisible();
    await page.locator(".signup-wizard .grid-cols-3 button").first().click();
    await page.locator(".signup-wizard .grid-cols-2 button").first().click();
    await page.getByRole("button", { name: "Devam" }).click();

    await expect(page.getByRole("heading", { name: "AI öğretmenin nasıl anlatsın?" })).toBeVisible();
    await page.locator(".signup-wizard .space-y-3 button").first().click();
    await page.getByRole("button", { name: "Devam" }).click();

    await expect(page.getByRole("heading", { name: "Hesabını oluştur" })).toBeVisible();
    await page.getByRole("checkbox").click();
    await page.getByLabel("Ad soyad").fill("Deneme Öğrenci");
    await page.getByLabel("E-posta").fill("ogrenci@example.com");
    await page.getByLabel("Şifre", { exact: true }).fill("Guclu1234");
    await page.getByLabel("Şifre tekrar").fill("Guclu1234");
    await page.getByRole("button", { name: "E-postayla hesabı oluştur" }).click();

    await tamamla;
    expect(signupBody).toMatchObject({ email: "ogrenci@example.com", fullName: "Deneme Öğrenci" });
    expect((signupBody as unknown as Record<string, unknown>).gradeLevel).toBeTruthy();
    expect((signupBody as unknown as Record<string, unknown>).tutorStyle).toBeTruthy();
  });

  test("doğrulanmamış e-posta şeridi ve yeniden gönder düğmesi", async ({ page }) => {
    await page.goto("/e2e/paket-j");
    await expect(page.getByText("📩 Hesabını güvenceye almak için e-postanı doğrula.")).toBeVisible();
    await expect(page.locator(".cp-verify-bar-action")).toBeVisible();
  });

  test("ücretsiz duvar: 1. konu bitince kutlamalı yükseltme ekranı", async ({ page }) => {
    await page.goto("/e2e/paket-j");
    await page.getByRole("button", { name: "2. konuyu aç" }).click();
    await expect(page.getByText("🚀 1. Konuyu Başarıyla Tamamladın!")).toBeVisible();
    await expect(page.getByRole("list", { name: "Kazanımların" })).toContainText("2 ders bitirdin");
    await expect(page.getByRole("link", { name: "Plus'a yükselt" })).toBeVisible();
  });

  test("ödeme dönüşü: bekliyor → onay gelince paket hazır", async ({ page }) => {
    let polls = 0;
    await page.route("**/api/payments/status**", (route) => {
      polls += 1;
      return route.fulfill(
        json(polls < 3 ? { plus: false, payment: { status: "pending" } } : { plus: true, badge: "Plus", payment: { status: "paid" } }),
      );
    });
    await page.goto("/e2e/odeme");
    await expect(page.getByText(/🎉 Ödemen alındı/)).toBeVisible();
    await expect(page.getByText("Plus paketin hazır! 🎉")).toBeVisible({ timeout: 15_000 });
    expect(polls).toBeGreaterThanOrEqual(3);
  });

  test("deneme: yenilemeden sonra cevap ve soru yerinde", async ({ page }) => {
    const deadlineAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await page.route("**/api/learning/exam/session**", (route) => {
      const url = route.request().url();
      if (url.includes("action=start")) {
        return route.fulfill(json({ startedAt: new Date().toISOString(), deadlineAt, timeLeftSec: 1800, answers: {}, flaggedIds: [], cursorIndex: 0, updatedAt: null }));
      }
      return route.fulfill(json({ ok: true }));
    });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/e2e/deneme");
    await expect(page.getByText("1 / 20", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Seçenek 1 B/ }).click();
    await page.getByRole("button", { name: "Sonraki →" }).click();
    await page.getByRole("button", { name: /Seçenek 2 C/ }).click();
    await page.getByRole("button", { name: "Sonraki →" }).click();
    await expect(page.getByText("3 / 20", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("3 / 20", { exact: true })).toBeVisible();
    await expect(page.getByText("2 / 20 yanıtlandı")).toBeVisible();
    await page.getByRole("button", { name: "← Önceki" }).click().catch(() => undefined);
    await expect(page.getByRole("button", { name: /Seçenek 2 C/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("soruda hata bildir: neden seç, gönder, yanıtı gör", async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/learning/question-report", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill(json({ verdict: "valid", message: "Haklısın, soru düzeltildi. Teşekkürler!" }));
    });
    await page.goto("/e2e/paket-j");
    await page.getByRole("button", { name: "Soruda hata bildir" }).click();
    await page.getByRole("radio", { name: "Cevap anahtarı yanlış" }).click();
    await page.getByRole("button", { name: "Bildir" }).click();
    await expect(page.getByText("Haklısın, soru düzeltildi. Teşekkürler!")).toBeVisible();
    expect(sent).toMatchObject({ source: "node", targetId: "e2e-attempt", questionRef: "0", reason: "key" });
  });

  test("ikiz soru: aç, seç, kontrol et", async ({ page }) => {
    await page.route("**/api/learning/twin-question", async (route) => {
      const body = route.request().postDataJSON() as { action: string; answer?: string };
      if (body.action === "create") {
        return route.fulfill(json({ token: "e2e-token", question: { text: "İkiz madde: doğru seçenek hangisi?", options: ["Birinci", "İkinci", "Üçüncü"], multi: false } }));
      }
      return route.fulfill(json({ correct: body.answer === "İkinci", correctOptions: ["İkinci"], explanation: null, message: "Doğru! +5 ⭐" }));
    });
    await page.goto("/e2e/paket-j");
    await page.getByRole("button", { name: /Şimdi İkiz Soruyu Çöz/ }).click();
    await expect(page.getByText("İkiz madde: doğru seçenek hangisi?")).toBeVisible();
    await page.getByRole("radio", { name: /İkinci/ }).click();
    await page.getByRole("button", { name: "Kontrol et" }).click();
    await expect(page.getByText("Doğru! +5 ⭐")).toBeVisible();
  });

  test("sınav sabahı kâğıdı: konu başlıkları ve zayıf noktalar", async ({ page }) => {
    await page.goto("/e2e/paket-j");
    const sheet = page.locator("article").filter({ has: page.locator("#cram-title") });
    await expect(sheet.locator("#cram-title")).toBeVisible();
    await expect(sheet).toContainText("Birinci konu");
    await expect(sheet).toContainText("İkinci konunun sınavda sorulan maddesi");
    await expect(sheet).toContainText("Sık karıştırdığın ifade");
  });
});

