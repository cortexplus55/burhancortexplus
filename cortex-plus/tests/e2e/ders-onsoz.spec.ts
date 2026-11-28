import { expect, test, type Page } from "@playwright/test";

/**
 * Konu başı "Bu Derste Ne Öğreneceğiz?" ve konu sonu "Bu Konudan Aklında Kalsın" (28 Kasım 2026), gerçek ders
 * ekranıyla. Telefonda (390×844) ve masaüstünde (1280×800): yana taşma yok, dokunma hedefi telefonda ≥ 44, masaüstünde
 * ≥ 40 px; ilk açılışta önsöz, başlanmış derste "Ders özeti"; sonda zümrüt kart ve Sınav Sabahı Kağıdı bağlantısı.
 */

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1280", width: 1280, height: 800, mobile: false },
] as const;

async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".als *"))) {
      if (el.closest(".katex-display, .als-reference-table-scroll")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      if (rect.right > vw + 1 || rect.left < -1) offenders.push(`${el.tagName}.${String(el.className).slice(0, 60)}`);
    }
    return { overflow: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 8) };
  });
}

async function tapTargets(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).getBoundingClientRect().width > 0)
      .map((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return { text: (node.textContent ?? "").trim().slice(0, 30), height: Math.round(rect.height), width: Math.round(rect.width) };
      }),
  );
}

async function open(page: Page, query = "") {
  await page.goto(`/e2e/ders-onsoz${query}`);
  await expect(page.locator(".als")).toBeVisible({ timeout: 30_000 });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.mobile, isMobile: viewport.mobile });
    const minTap = viewport.mobile ? 44 : 40;

    test("ilk açılış: önsöz, tek ana düğme 'Derse başla'; taşma yok @public", async ({ page }) => {
      const requests: string[] = [];
      page.on("request", (request) => {
        // Önsöz ve kapanış modelsiz: ders, öğretmen ya da model ucuna istek yok.
        if (/\/api\/(learning|ai|tutor)\//.test(request.url())) requests.push(request.url());
      });
      await open(page);
      const preface = page.locator(".als-preface");
      await expect(preface).toBeVisible();
      await expect(preface.getByText("Bu Derste Ne Öğreneceğiz?")).toBeVisible();
      await expect(page.locator(".als-goal-num")).toHaveText(["01", "02", "03", "04"]);
      await expect(page.locator(".als-preface-concepts li").first()).toBeVisible();
      await expect(page.locator(".als-preface-caution")).toContainText("toplamı ayırmaz");
      await expect(page.locator(".als-preface-badges")).toContainText("Anlatım: Temel");
      const start = page.getByRole("button", { name: "Derse başla" });
      await expect(start).toBeVisible();
      expect(await page.getByRole("button", { name: "Devam et" }).count()).toBe(0);
      const report = await overflowReport(page);
      expect(report.overflow).toBeLessThanOrEqual(0);
      expect(report.offenders).toEqual([]);
      for (const target of await tapTargets(page, ".als-cta")) expect(target.height, target.text).toBeGreaterThanOrEqual(minTap);
      await page.screenshot({ path: `test-results/ders-onsoz-${viewport.name}.png`, fullPage: true });
      await start.click();
      await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible();
      expect(requests).toEqual([]);
    });

    test("başlanmış ders: önsöz kendiliğinden gelmez, 'Ders özeti' pencerede açar @public", async ({ page }) => {
      await open(page, "?durum=baslanmis");
      await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible();
      await expect(page.locator(".als-preface")).toHaveCount(0);
      const reopen = page.getByRole("button", { name: "Ders özeti" });
      for (const target of await tapTargets(page, ".als-brief-reopen")) expect(target.height, target.text).toBeGreaterThanOrEqual(minTap);
      await reopen.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Bu derste ne öğreneceksin?")).toBeVisible();
      // Pencere başından açılır (odak kaydırmaz); "Derse dön" de ekranda.
      await expect(dialog.getByText("Bu Derste Ne Öğreneceğiz?")).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Derse dön" })).toBeInViewport();
      const box = await dialog.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width + 1).toBe(true);
      // "Derse dön" kayan alanın dışında: en alta kaydırınca yapay zekâ notu düğme şeridinin üstünde biter.
      await dialog.locator(".als-dialog-body").evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
      const layout = await dialog.evaluate((node) => {
        const rect = (selector: string) => node.querySelector(selector)!.getBoundingClientRect();
        return {
          bodyBottom: rect(".als-dialog-body").bottom,
          footTop: rect(".als-dialog-foot").top,
          noticeBottom: rect(".cx-ai-notice").bottom,
          ctaTop: rect(".als-dialog-foot .als-cta").top,
          dialogTop: node.getBoundingClientRect().top,
          dialogBottom: node.getBoundingClientRect().bottom,
        };
      });
      expect(layout.bodyBottom).toBeLessThanOrEqual(layout.footTop + 1);
      expect(layout.noticeBottom).toBeLessThanOrEqual(layout.ctaTop);
      if (viewport.mobile) {
        // Telefonda pencere tam ekran: arkadaki ders hiçbir kenardan görünmez.
        expect(layout.dialogTop).toBeLessThanOrEqual(1);
        expect(layout.dialogBottom).toBeGreaterThanOrEqual(viewport.height - 1);
      }
      await dialog.locator(".als-dialog-body").evaluate((node) => node.scrollTo({ top: 0 }));
      await page.screenshot({ path: `test-results/ders-onsoz-pencere-${viewport.name}.png` });
      await dialog.locator(".als-dialog-body").evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
      await page.screenshot({ path: `test-results/ders-onsoz-pencere-alt-${viewport.name}.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible();
    });

    test("konu sonu: 'Bu Konudan Aklında Kalsın' ve Sınav Sabahı Kağıdı bağlantısı; taşma yok @public", async ({ page }) => {
      await open(page, "?kaynak=havuz&durum=baslanmis&plan=ucretsiz");
      for (let guard = 0; guard < 12; guard += 1) {
        if (await page.getByRole("heading", { level: 1, name: "Bu Konudan Aklında Kalsın" }).isVisible().catch(() => false)) break;
        const next = page.getByRole("button", { name: /Devam et/ }).first();
        await next.click();
      }
      await expect(page.getByRole("heading", { level: 1, name: "Bu Konudan Aklında Kalsın" })).toBeVisible();
      // "Son adım!" kıvılcımı akışın içinde: "Ders özeti" düğmesinin altında, adım başlığının üstünde; ikisine de binmez.
      const spark = page.locator(".cp-spark");
      await expect(spark).toBeVisible();
      const heading = page.getByRole("heading", { level: 1, name: "Bu Konudan Aklında Kalsın" });
      const [sparkBox, reopenBox, headingBox] = await Promise.all([
        spark.boundingBox(),
        page.locator(".als-brief-reopen").boundingBox(),
        heading.boundingBox(),
      ]);
      expect(sparkBox && reopenBox && headingBox).toBeTruthy();
      expect(sparkBox!.y).toBeGreaterThanOrEqual(reopenBox!.y + reopenBox!.height);
      expect(sparkBox!.y + sparkBox!.height).toBeLessThanOrEqual(headingBox!.y);
      await page.screenshot({ path: `test-results/ders-kapanis-kivilcim-${viewport.name}.png` });
      // Kendiliğinden kalkıp içeriği kaydırmaz: üç saniye sonra da yerinde, başlık aynı yerde.
      await page.waitForTimeout(3000);
      await expect(spark).toBeVisible();
      expect((await heading.boundingBox())!.y).toBeCloseTo(headingBox!.y, 0);
      await expect(page.locator(".als-closing li")).toHaveCount(3);
      await expect(page.locator(".als-closing-icon")).toHaveCount(3);
      const link = page.getByRole("link", { name: /Sınav Sabahı Kağıdı/ });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toContainText("Plus");
      for (const target of await tapTargets(page, ".als-closing-cram, .als-cta")) expect(target.height, target.text).toBeGreaterThanOrEqual(minTap);
      const report = await overflowReport(page);
      expect(report.overflow).toBeLessThanOrEqual(0);
      expect(report.offenders).toEqual([]);
      await page.screenshot({ path: `test-results/ders-kapanis-${viewport.name}.png`, fullPage: true });
    });

    test("hazır müfredat dersi: önsöz havuzun kavram ve kazanımlarıyla @public", async ({ page }) => {
      await open(page, "?kaynak=havuz");
      await expect(page.locator(".als-goal-num")).toHaveText(["01", "02", "03"]);
      await expect(page.locator(".als-preface-concepts li")).toHaveText(["Kuvvet kazancı", "Destek noktası", "Palanga"]);
      await page.screenshot({ path: `test-results/ders-onsoz-havuz-${viewport.name}.png`, fullPage: true });
    });
  });
}
