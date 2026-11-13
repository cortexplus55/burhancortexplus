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
      const mark = box(".cx-home-logo .lg");
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
    // Faz 2 (13 Kasım 2026, tasarım tahtası): logo 76×49, telefonda 56×36.
    expect(m.markHeight).toBe(size.width >= 768 ? 49 : 36);
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
  // Faz 2 (13 Kasım 2026, tasarım tahtası): sıra Başla, seri, Plus'a geç, profil kapsülü.
  const [buyBox, streakBox] = await Promise.all([buy.boundingBox(), page.locator(".cx-home-streak").boundingBox()]);
  expect(streakBox!.x + streakBox!.width).toBeLessThanOrEqual(buyBox!.x);
  await page.getByRole("button", { name: "Çalışma Stüdyosu" }).click();
  expect(await page.locator("#cx-home-tray .cx-tray-plus").count()).toBeGreaterThanOrEqual(5);

  // Telefonda logo, seri ve kısa "Plus" hapı tek satıra sığar; üst üste binmez (Faz 2: Kütüphane ve profil alt çubukta).
  for (const width of [375, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/ana-ekran?hazirlik=1");
    const boxes = await page.evaluate(() =>
      [".cx-home-logo-word", ".cx-home-streak", ".cx-home-buy"].map((selector) => {
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

test("ince çubuktaki mikrofon dikteyi başlatır: geniş kutu açılır, sesli öğretmen ses dalgasıyla orada", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1");
  await expect(page.locator(".cx-slim-bar").getByRole("button", { name: "Cortex Plus ile konuş" })).toHaveCount(0);
  await page.locator(".cx-slim-bar").getByRole("button", { name: "Mikrofon" }).click();
  await expect(page.locator(".cp-sor-composer-box textarea")).toBeVisible();
  // Geniş kutuda dikte ("Mikrofon" ya da dinlerken "Kaydı bitir") ve ayrı sesli öğretmen düğmesi.
  await expect(page.locator(".cp-sor-mic")).toHaveCount(1);
  await expect(page.locator(".cp-sor-voice-chip")).toContainText("Cortex Plus ile konuş");
});

test("12'den fazla konu: halka kesintisiz, seçim kaydırıcıyla, seçili konu işaretli", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1&konu=cok");
  // Seçili konu halkanın üstünde ince çerçeve; halkanın dışında ayrı çizgi yok.
  await expect(page.locator(".cx-ring-selected")).toHaveCount(1);
  await expect(page.locator(".cx-ring-marker")).toHaveCount(0);
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

/*
  13 Kasım 2026 düzeltmeleri: geniş ekranda şerit sol kenarda 24 px, halka + metin grubu sayfanın yatay merkezinde;
  kaydırıcı grubun en sağ ucunda; seçili yay kendisine yapışık çerçeveyle.
*/
for (const width of [1280, 1536, 1920]) {
  test(`geniş ekran ${width} px: şerit solda 24 px, halka + metin grubu ortada, kaydırıcı en sağda`, { tag: ["@public"] }, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: width >= 1536 ? 960 : 800 });
    await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1");
    await expect(page.locator(".cx-ring")).toBeVisible();
    const m = await page.evaluate(() => {
      const r = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const strip = r(".cx-strip");
      const ring = r(".cx-ring");
      const text = r(".cx-cockpit-text");
      const slider = r(".cx-slider");
      return {
        stripLeft: Math.round(strip.left),
        groupCenter: Math.round((ring.left + text.right) / 2),
        ringCenter: Math.round(ring.left + ring.width / 2),
        pageCenter: Math.round(innerWidth / 2),
        sliderAfterText: slider.left >= text.right,
        stripClear: strip.right < ring.left,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.stripLeft).toBe(24);
    expect(Math.abs(m.groupCenter - m.pageCenter)).toBeLessThanOrEqual(2);
    expect(m.sliderAfterText).toBe(true);
    expect(m.stripClear).toBe(true);
    expect(m.overflow).toBeLessThanOrEqual(1);
    test.info().annotations.push({ type: "ölçü", description: JSON.stringify(m) });
    await page.screenshot({ path: `test-results/ana-ekran-genis-${width}.png` });
  });
}

test("telefonda şerit açılışta seçili (en yakın gelecek) sınavdan başlar; geçmiş sola kaydırınca görünür", { tag: ["@public"] }, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1");
  const list = page.locator(".cx-strip-list");
  await expect(list).toBeVisible();
  // Açılış kaydırması sayfa etkileşime hazır olunca yapılır.
  await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const m = await page.evaluate(() => {
    const listEl = document.querySelector(".cx-strip-list")!;
    const tabs = [...listEl.querySelectorAll<HTMLElement>('[role="tab"]')];
    const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true")!;
    const listBox = listEl.getBoundingClientRect();
    return {
      selectedIndex: tabs.indexOf(selected),
      selectedLeftOffset: Math.round(selected.getBoundingClientRect().left - listBox.left),
      scrollLeft: listEl.scrollLeft,
      firstTabRight: Math.round(tabs[0]!.getBoundingClientRect().right - listBox.left),
    };
  });
  expect(m.selectedIndex).toBe(1);
  expect(Math.abs(m.selectedLeftOffset)).toBeLessThanOrEqual(2);
  expect(m.scrollLeft).toBeGreaterThan(0);
  expect(m.firstTabRight).toBeLessThanOrEqual(2);
  await list.evaluate((element) => element.scrollTo({ left: 0 }));
  await expect(page.locator('[role="tab"]').first()).toBeInViewport();
});

test("seri kutlama penceresi diyalog ölçüsünde: ortalı, 480 px, yükseklik içeriği kadar, köşe 32", { tag: ["@public"] }, async ({ page }) => {
  for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await page.goto("/e2e/ana-ekran?plan=plus&hazirlik=1");
    const dialog = page.locator(".cx-streak-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Serini başlattın!");
    // Açılış ölçeği (0.96 → 1) bitsin; ölçü yerleşimden.
    await page.waitForTimeout(400);
    const m = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        centerX: Math.round(box.left + box.width / 2),
        centerY: Math.round(box.top + box.height / 2),
        radius: getComputedStyle(element).borderTopLeftRadius,
      };
    });
    expect(m.width).toBeLessThanOrEqual(480);
    if (size.width >= 768) expect(m.width).toBe(480);
    expect(m.height).toBeLessThan(size.height / 2);
    expect(Math.abs(m.centerX - size.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.centerY - size.height / 2)).toBeLessThanOrEqual(1);
    expect(m.radius).toBe("32px");
    await page.screenshot({ path: `test-results/seri-penceresi-${size.width}.png` });
    await page.evaluate(() => window.localStorage.removeItem("cortex-gamification-v1"));
  }
});
