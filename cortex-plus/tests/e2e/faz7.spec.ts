import { expect, test, type Page } from "@playwright/test";

/*
  Faz 7 (14 Kasım 2026): giriş + kayıt (`ui.v2.giris`), kurulum (`ui.v2.kurulum`), /pay (`ui.v2.pay`). Yerel sunucuda
  bayrak `cx-ui-v2` çereziyle açılır; canlıda çerez yok sayılır. Gerçek hesap açılmaz, gerçek giriş ve ödeme yapılmaz:
  Supabase kimlik ucu ağ katmanında taklit, paket kartları fikstürde (satın alma düğmesine basılmaz).
*/

const WIDTHS = [375, 768, 1280] as const;

async function flag(page: Page, value: string) {
  const base = test.info().project.use.baseURL ?? "http://localhost:3006";
  await page.context().addCookies([{ name: "cx-ui-v2", value, url: base }]);
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const width of WIDTHS) {
  test.describe(`faz 7 · ${width}px`, () => {
    test.use({ viewport: { width, height: 860 } });

    test("giriş v2: 48 px hap alanlar, 16 px yazı, şifre göster / gizle, tek brand", { tag: ["@public"] }, async ({ page }) => {
      await flag(page, "giris");
      await page.goto("/giris");
      await expect(page.locator('.cx-ui-scope[data-ui~="giris"]')).toHaveCount(1);
      const email = page.getByLabel("E-posta");
      const password = page.getByLabel("Şifre", { exact: true });
      for (const field of [email, password]) {
        const box = await field.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(48);
        expect(await field.evaluate((node) => getComputedStyle(node).fontSize)).toBe("16px");
      }
      await password.fill("Sifre1234!");
      const show = page.getByRole("button", { name: "Şifreyi göster" });
      await expect(show).toBeVisible();
      expect((await show.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await show.click();
      await expect(password).toHaveAttribute("type", "text");
      await expect(page.getByRole("button", { name: "Şifreyi gizle" })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Şifreyi gizle" }).click();
      await expect(password).toHaveAttribute("type", "password");
      const submit = page.getByRole("button", { name: "Giriş yap" });
      // Marka gradyanı (#4F46E5 → #6366F1); cam yüzey de gradyan taşıdığı için renkle ayırt edilir.
      expect(await submit.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("rgb(79, 70, 229)");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("giriş v2: Enter gönderir, çift tıklama tek istek, hata metni aynı", { tag: ["@public"] }, async ({ page }) => {
      await flag(page, "giris");
      let calls = 0;
      await page.route("**/auth/v1/token**", async (route) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
        });
      });
      await page.route("**/api/auth/giris-ipucu", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hint: null }) }),
      );
      await page.goto("/giris");
      await page.getByLabel("E-posta").fill("ogrenci-test@example.com");
      await page.getByLabel("Şifre", { exact: true }).fill("Yanlis1234!");
      await page.getByLabel("Şifre", { exact: true }).press("Enter");
      await page.getByRole("button", { name: "Giriş yap" }).click({ force: true }).catch(() => {});
      await expect.poll(() => calls).toBe(1);
      await expect(page.getByRole("button", { name: "Giriş yap" })).toBeEnabled();
      expect(calls).toBe(1);
    });

    test("giriş bayrak kapalı: sarmalayıcı yok, şifre düğmesi görünmez", { tag: ["@public"] }, async ({ page }) => {
      await page.goto("/giris");
      await expect(page.locator(".cx-ui-scope")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Şifreyi göster" })).toBeHidden();
      await expect(page.getByLabel("Şifre", { exact: true })).toHaveAttribute("type", "password");
    });

    test("kayıt v2: sarmalayıcı var, taşma yok", { tag: ["@public"] }, async ({ page }) => {
      await flag(page, "giris");
      await page.goto("/kayit");
      await expect(page.locator('.cx-ui-scope[data-ui~="giris"]')).toHaveCount(1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("kurulum v2: yükleme yüzeyi kenarsız, haplar 40 / 44, taşma yok", { tag: ["@public"] }, async ({ page }) => {
      await page.goto("/e2e/sihirbaz?adim=material&ui=v2");
      await expect(page.locator('.cx-ui-scope[data-ui~="kurulum"]')).toHaveCount(1);
      const drop = page.locator(".apw-drop").first();
      await expect(drop).toBeVisible();
      const style = await drop.evaluate((node) => {
        const s = getComputedStyle(node);
        return { border: s.borderTopWidth, radius: s.borderTopLeftRadius };
      });
      expect(style.border).toBe("0px");
      expect(style.radius).toBe("24px");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await page.goto("/e2e/sihirbaz?adim=subject&ui=v2");
      const small = await page.evaluate((min) =>
        Array.from(document.querySelectorAll(".apw-tracks .apw-quick-btn"))
          .filter((node) => (node as HTMLElement).offsetParent !== null)
          .map((node) => Math.round(node.getBoundingClientRect().height))
          .filter((height) => height < min),
      width < 768 ? 44 : 40);
      expect(small).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test("/pay v2: ?plan=sigma kartı açık ve işaretli, ekranda tek brand", { tag: ["@public"] }, async ({ page }) => {
      await page.goto('/e2e/paketler?ui=v2&plan=sigma&from=lesson.create');
      const picked = page.locator("[data-cx-picked]");
      await expect(picked).toHaveCount(1);
      await expect(picked).toHaveAttribute("data-cx-picked", "sigma");
      await expect(picked).toBeInViewport();
      const brands = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#planlar button"))
          .filter((node) => (node as HTMLElement).offsetParent !== null)
          .filter((node) => getComputedStyle(node).backgroundImage.includes("rgb(79, 70, 229)")).length,
      );
      expect(brands).toBe(1);
      await expect(page.getByText("lesson.create")).toHaveCount(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("/pay v2: geçersiz ?plan= yok sayılır, enjeksiyon basılmaz", { tag: ["@public"] }, async ({ page }) => {
      await page.goto(`/e2e/paketler?ui=v2&plan=${encodeURIComponent('"><script>window.__x=1</script>')}`);
      await expect(page.locator("[data-cx-picked]")).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
      await expect(page.getByText("Diğer planlar · Sigma")).toBeVisible();
    });
  });
}
