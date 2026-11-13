import { expect, test, type Page } from "@playwright/test";

/*
  13 Kasım 2026, ürün sahibinin kararı: hazırlığı olan öğrencinin boş ana ekranı beş parça (üst çubuk ve logo, sınav
  şeridi, konu halkası, metin bloğu, ince yazma çubuğu). Telefon, tablet ve masaüstünde: yana taşma yok, parçalar
  görünür, dokunma alanları yeterli; masaüstünde üst çubuğun üç grubu aynı dikey çizgide (y = 48), logo soldan 24 px,
  ince çubuk alttan 28 px. Ana ekranda etkileşimler sunucuya istek atmaz (seçim sayfa değiştirmez).
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* yok */
    }
  });
}

for (const size of SIZES) {
  test(`ana ekran göstergesi ${size.width}×${size.height}: beş parça, taşma yok, ölçüler`, { tag: ["@public"] }, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(size);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/") && !request.url().includes("/api/streak")) apiCalls.push(request.url());
    });
    await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1");

    await expect(page.getByRole("link", { name: "Cortex Plus Ana Sayfa" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Sınavlar" })).toBeVisible();
    await expect(page.locator(".cx-ring")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".cx-slim-bar")).toBeVisible();
    // Ana ekrandan çıkarılanlar: selam, büyük Başla, devam kartı, geri sayım şeridi, plan rozeti, yıldızlar.
    await expect(page.locator(".cp-sor-hero, .cp-resume, .cp-countdown, .cp-sor-plan, .cp-stars-btn")).toHaveCount(0);
    // Plus hesabında yükseltme yok.
    await expect(page.locator(".cx-home-buy")).toHaveCount(0);

    const m = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return rect.width ? rect : null;
      };
      // Şeridin okları ürün sahibinin ölçüsüyle 28 px yüksek; tıklama alanı ::before ile 44 px (ayrı denetlenir).
      const small = [...document.querySelectorAll<HTMLElement>(".cx-home-top a, .cx-home-top button, .cx-home-stage a, .cx-home-stage button:not(.cx-strip-arrow), .cx-slim button, .cx-slim input")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.width < 40 || rect.height < 40);
        })
        .map((element) => element.getAttribute("aria-label") ?? element.textContent);
      const centers = [".cx-home-logo", ".cx-home-tray", ".cx-home-actions"].map((selector) => {
        const rect = box(selector);
        return rect ? Math.round(rect.top + rect.height / 2) : null;
      });
      const mark = box(".cx-home-logo-mark");
      const slim = box(".cx-slim-bar");
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small,
        centers,
        markLeft: mark ? Math.round(mark.left) : null,
        markHeight: mark ? Math.round(mark.height) : null,
        slimBottom: slim ? Math.round(innerHeight - slim.bottom) : null,
      };
    });
    expect(m.overflow).toBeLessThanOrEqual(1);
    expect(m.small).toEqual([]);
    expect(m.markHeight).toBe(24);
    if (size.width >= 768) {
      expect(m.centers).toEqual([48, 48, 48]);
      expect(m.markLeft).toBe(24);
      expect(m.slimBottom).toBe(28);
    }
    await page.screenshot({ path: `test-results/ana-ekran-kokpit-${size.width}.png` });
    if (size.width >= 768) {
      const arrowHit = await page.evaluate(() => {
        const arrow = document.querySelector(".cx-strip-arrow");
        return arrow ? Number.parseFloat(getComputedStyle(arrow, "::before").height) : null;
      });
      expect(arrowHit).toBeGreaterThanOrEqual(44);
    }

    // Kabuğun açılış istekleri (profil, rozetler) bitsin; buradan sonra ana ekran etkileşimleri istek atmaz.
    await page.waitForLoadState("networkidle");
    apiCalls.length = 0;

    // Seçim sayfa değiştirmez: şerit ve kaydırıcı yerinde günceller.
    const url = page.url();
    const before = await page.getByRole("heading", { level: 1 }).innerText();
    await page.getByRole("slider", { name: "Konular" }).focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(before);
    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute("aria-label", "TYT Fizik");
    expect(page.url()).toBe(url);

    // Tepsi sekiz araçla açılır, Escape kapatır.
    await page.getByRole("button", { name: "Çalışma Stüdyosu" }).click();
    await expect(page.locator("#cx-home-tray .cx-tray-item")).toHaveCount(8);
    const trayOverflow = await page.evaluate(() => {
      const rect = document.querySelector("#cx-home-tray")!.getBoundingClientRect();
      return rect.left < 0 || rect.right > innerWidth;
    });
    expect(trayOverflow).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.locator("#cx-home-tray")).toHaveCount(0);

    // Alana dokununca geniş kutu; Escape ile ince çubuğa döner.
    await page.locator(".cx-slim-field").click();
    await expect(page.locator(".cp-sor-composer-box textarea")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cx-slim-bar")).toBeVisible();
    expect(apiCalls).toEqual([]);
  });
}

test("ücretsiz hesap: Plus'a geç altın hap seri sayacının solunda; tepside kilit rozetleri", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/ana-ekran?hazirlik=1");
  const buy = page.locator(".cx-home-buy");
  // Masaüstünde tam etiket; telefonda mevcut kısa etiket ("Plus") görünür.
  await expect(buy).toBeVisible();
  expect(await buy.innerText()).toBe("Plus'a geç");
  const [buyBox, streakBox] = await Promise.all([buy.boundingBox(), page.locator(".cx-home-streak").boundingBox()]);
  expect(buyBox!.x + buyBox!.width).toBeLessThanOrEqual(streakBox!.x);
  await page.getByRole("button", { name: "Çalışma Stüdyosu" }).click();
  expect(await page.locator("#cx-home-tray .cx-tray-plus").count()).toBeGreaterThanOrEqual(5);

  // Telefonda logo, kısa "Plus" hapı, seri ve "Daha fazla" tek satıra sığar; üst üste binmez.
  for (const width of [375, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/ana-ekran?hazirlik=1");
    const boxes = await page.evaluate(() =>
      [".cx-home-logo-word", ".cx-home-buy", ".cx-home-streak", ".cx-home-more--phone"].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.left, `${width}px ${index}`).toBeGreaterThanOrEqual(boxes[index - 1]!.right);
    }
    expect(boxes[boxes.length - 1]!.right).toBeLessThanOrEqual(width);
  }
});

test("12'den fazla konu: halka kesintisiz, seçim kaydırıcıyla, seçili konu işaretli", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1&konu=cok");
  await expect(page.locator(".cx-ring-marker")).toHaveCount(1);
  expect(await page.locator(".cx-ring-arc").count()).toBeLessThanOrEqual(2);
  await expect(page.getByRole("slider", { name: "Konular" })).toHaveAttribute("aria-valuetext", "6 / 18");
});

test("hazırlığı olmayan hesap: boş durum bugünkü hâlinde, üst çubuk yeni; Başla öğretmenin ilk sözünü açar", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/ana-ekran?plan=plus");
  await expect(page.locator(".cx-home-top")).toBeVisible();
  await expect(page.locator(".cx-home-stage")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
  await page.locator(".cx-home-start").click();
  await expect(page.locator(".cp-teacher-greeting")).toContainText("Bugün ne çalışmak istersin?");
});
