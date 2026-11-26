import { expect, test, type Page } from "@playwright/test";

/*
  Öğretmen v3 ekranı (teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibi: "kalabalık, teknik damgalarla boğulmuş").
  Fikstür veritabanısız: `/e2e/ana-ekran?ogretmen=v2` (`&durum=takip` damgalı yanıt + takip soruları, `&durum=karsilama`
  karşılama, `&konus=1` "Konuş" düğmesi ve sesli mod yeri). Uçlar sahte (`page.route`): model, kredi ve canlı API yok.
  390, 360 ve 1280 px'te: yatay taşma 0; damgalar, uygulamanın üst menüsü ve alt sekme çubuğu yok; sohbet alanı ekranın
  en az %75'i; takip hapları sağa yaslı; Daha fazla menüsü ekranın içinde; dokunma ≥ 44 px (masaüstünde ≥ 40); açık ve
  koyu temada karşıtlık ≥ 4,5:1.
*/

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * Sayfadaki sonlu animasyonların bitmesini bekler (sonsuz olanlar, ör. yükleniyor dalgası, beklenmez). Giriş animasyonu
 * (`translate`) sürerken ölçülen kutu ondalık hata taşıyor: 44 px'lik düğme 43,99997 px okunup testi kararsız
 * düşürüyordu (26 Kasım 2026, CI). Ölçüm her zaman animasyon bittikten sonra; 44 px kuralı aynen.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
      // Duraklatılmış bir animasyon beklemeyi kilitlemesin.
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
}

async function rect(page: Page, selector: string) {
  await settle(page);
  return page.locator(selector).first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  });
}

/** Görünen etkileşimli öğelerin en küçük kenarı (görünmez dokunma alanı sayılmaz). */
async function smallestTarget(page: Page, scope: string) {
  await settle(page);
  return page.locator(scope).first().evaluate((root) => {
    const items = [...root.querySelectorAll("a, button")].filter((node) => (node as HTMLElement).offsetParent !== null);
    return Math.min(...items.map((node) => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height)));
  });
}

/** Yazı ile gerçek zemini (yarı saydam katmanlar atalarla karıştırılarak) arasındaki karşıtlık. */
async function readContrast(page: Page, selectors: string[]) {
  return page.evaluate((list) => {
    const parse = (value: string) => {
      // `color-mix()` sonucu tarayıcıda `color(srgb r g b / a)` (0-1 aralığında) olarak okunur.
      const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/.exec(value);
      if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] ? Number(srgb[4]) : 1 };
      const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const background = (element: Element) => {
      const stack: { r: number; g: number; b: number; a: number }[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.a > 0) stack.push(color);
        if (color.a >= 1) break;
      }
      let base = { r: 255, g: 255, b: 255 };
      for (const layer of stack.reverse()) {
        base = {
          r: layer.r * layer.a + base.r * (1 - layer.a),
          g: layer.g * layer.a + base.g * (1 - layer.a),
          b: layer.b * layer.a + base.b * (1 - layer.a),
        };
      }
      return base;
    };
    const out: Record<string, number> = {};
    for (const selector of list) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const [x, y] = [lum(parse(getComputedStyle(element).color)), lum(background(element))].sort((m, n) => n - m);
      out[selector] = Math.round(((x! + 0.05) / (y! + 0.05)) * 100) / 100;
    }
    return out;
  }, selectors);
}

async function stubSideRequests(page: Page) {
  await page.route("**/api/teacher/conversations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ groups: [] }) }));
  await page.route("**/api/teacher/start-cards", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
}

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 1280, height: 800 },
] as const) {
  const phone = size.width <= 640;
  const minTap = phone ? 44 : 40;

  test.describe(`öğretmen v3 · ${size.width}px`, () => {
    test.use({ viewport: size });

    test("çerçevesiz tuval: damga yok, krom gizli, sohbet alanı geniş, takip hapları sağa yaslı", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip");
      await expect(page.locator(".cx-v3-thread")).toBeVisible({ timeout: 30_000 });
      const text = await page.locator(".cx-v3").innerText();
      for (const stamp of ["Cortex öğretmen", "Belgeden", "Kaynaklar:", "[1]", "Genel bilgiden", "Biyoloji notu"]) {
        expect(text, stamp).not.toContain(stamp);
      }
      await expect(page.getByText("Notunda geçmiyor · genel bilgi")).toBeVisible();
      await expect(page.locator(".cx-home-top")).toBeHidden();
      await expect(page.locator(".cp-sor-bottomnav")).toBeHidden();
      await expect(page.getByRole("radiogroup", { name: "Anlatım modu" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Ders seç/ })).toHaveCount(0);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

      const bar = await rect(page, ".cx-v3-bar");
      expect(bar.height).toBeLessThanOrEqual(48);
      const thread = await rect(page, ".cx-v3-thread");
      expect(thread.height / size.height).toBeGreaterThanOrEqual(phone ? 0.75 : 0.7);

      const group = page.getByRole("group", { name: "Takip soruları" });
      await expect(group.getByRole("button")).toHaveCount(3);
      const column = await rect(page, ".cx-v3-col");
      await settle(page);
      const haps = await group.getByRole("button").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
      for (const hap of haps) {
        // Sağa yaslı: sağ kenar sütunun iç kenarında, sol kenar sütunun solundan içeride.
        expect(Math.abs(column.right - 20 - hap.right)).toBeLessThanOrEqual(24);
        expect(hap.left).toBeGreaterThan(column.left + 20);
        expect(hap.height).toBeGreaterThanOrEqual(44);
      }
      // Beğen, beğenme, sesli dinle, kopyala ve 26 Kasım 2026'dan beri Bildir (mağaza uyumluluğu).
      const acts = page.locator(".cx-v3-acts").getByRole("button");
      await expect(acts).toHaveCount(5);
      expect(await smallestTarget(page, ".cx-v3-acts")).toBeGreaterThanOrEqual(minTap);
      expect(await smallestTarget(page, ".cx-v3-bar")).toBeGreaterThanOrEqual(minTap);
      expect(await smallestTarget(page, ".cx-v3-row")).toBeGreaterThanOrEqual(minTap);
      await page.screenshot({ path: `test-results/ogretmen-v3-takip-${size.width}.png` });
    });

    test("Daha fazla: altı komut, sesli okuma anahtarı üst çubukta; ekranın içinde, Esc kapatır, komut gönderilir", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      const sent: string[] = [];
      await page.route("**/api/ai/chat", async (route) => {
        sent.push((route.request().postDataJSON() as { message: string }).message);
        await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c31" }, body: "Peki, ilk soru geliyor." });
      });
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip");
      const trigger = page.getByRole("button", { name: "Daha fazla" });
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Daha fazla" });
      await expect(menu.getByRole("menuitem")).toHaveCount(6);
      await expect(menu.getByRole("menuitemcheckbox")).toHaveCount(0);
      // "Sesli yanıt" anahtarı üst çubukta, geçmiş düğmesinin yanında.
      await expect(page.locator(".cx-v3-bar").getByRole("button", { name: /Yanıtları sesli oku/ })).toBeVisible();
      const box = await rect(page, ".cx-v3-menu");
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(size.width);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(await smallestTarget(page, ".cx-v3-menu")).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/ogretmen-v3-menu-${size.width}.png` });
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole("menuitem", { name: /Eksik olduğum noktaları bul/ }).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0]).toContain("Eksik olduğum noktaları bul");
      await expect(page.getByText("Peki, ilk soru geliyor.")).toBeVisible();
    });

    test("karşılama: selam ve sağa yaslı üç hap; hap welcomeAnswer ile gider", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      const bodies: Record<string, unknown>[] = [];
      await page.route("**/api/ai/chat", async (route) => {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c32" }, body: "Harika, alıştırmayla başlayalım." });
      });
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=karsilama&hazirlik=1");
      const welcome = page.getByRole("region", { name: "Karşılama" });
      await expect(welcome.getByText(/Selam Öğrenci!/).first()).toBeVisible();
      await expect(welcome.getByText(/Hücre Bölünmeleri ve Kalıtım için nasıl hazırlanmak/).first()).toBeAttached();
      const group = welcome.getByRole("group", { name: "Başlangıç önerileri" });
      await expect(group.getByRole("button")).toHaveCount(3);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/ogretmen-v3-karsilama-${size.width}.png` });
      await group.getByRole("button", { name: /En iyi pratik yaparak öğreniyorum/ }).click();
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0]).toMatchObject({ message: "En iyi pratik yaparak öğreniyorum", welcomeAnswer: true, contextPrepId: "biyoloji", tutorStyle: "tutor_steps" });
      await expect(page.getByText("Harika, alıştırmayla başlayalım.")).toBeVisible();
    });

    test("Konuş ↔ Gönder; Konuş sesli mod yerini açar, kapanınca kapsül döner", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip&konus=1");
      const talk = page.getByRole("button", { name: "Konuş" });
      await expect(talk).toBeVisible();
      await page.getByPlaceholder("Sor, konuş veya dosya gönder").fill("Neden yeşil?");
      await expect(page.getByRole("button", { name: "Gönder" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Konuş" })).toHaveCount(0);
      await page.getByPlaceholder("Sor, konuş veya dosya gönder").fill("");
      await page.getByRole("button", { name: "Konuş" }).click();
      await expect(page.getByTestId("fixture-live-talk")).toBeVisible();
      await expect(page.locator(".cx-v3-input")).toHaveCount(0);
      await page.getByRole("button", { name: "Sesli dersi kapat" }).click();
      await expect(page.locator(".cx-v3-input")).toBeVisible();
    });

    test("düşünme satırı akış boyunca, bitince 'N sn düşündü'; yeni kelimeler yumuşak açılır", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      await page.route("**/api/ai/chat", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2400));
        await route.fulfill({
          status: 200,
          contentType: "text/plain; charset=utf-8",
          headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c33" },
          body: "Klorofil yeşil ışığı yansıttığı için yeşil görünür; kırmızı ve mavi ışığı soğurur.\n\n[[sorular:Kırmızı ışık neden daha çok soğurulur?|Sonbaharda yapraklar neden sararır?]]",
        });
      });
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip");
      await page.getByRole("button", { name: "Klorofil neden yeşil görünür?", exact: true }).click();
      await expect(page.getByRole("status", { name: "Bilgileri birleştiriyor" })).toBeVisible();
      await expect(page.getByRole("status", { name: "Verileri analiz ediyor" })).toBeVisible({ timeout: 4000 });
      await expect(page.locator(".cx-v3-thought").last()).toHaveText(/💡 \d+ sn düşündü/, { timeout: 15_000 });
      const label = await page.locator(".cx-v3-thought").last().innerText();
      expect(Number(/(\d+) sn/.exec(label)?.[1])).toBeGreaterThanOrEqual(2);
      await expect(page.getByText(/kırmızı ve mavi ışığı soğurur/)).toBeVisible();
      // Ham işaret görünmez; yeni sorular sağa yaslı haplar.
      expect(await page.locator(".cx-v3").innerText()).not.toContain("[[");
      await expect(page.getByRole("group", { name: "Takip soruları" }).getByRole("button")).toHaveCount(2);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    });

    test("ders sonu özeti: geri basınca pencere ekranın içinde; Kapat çıkışı sürdürür", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip");
      await page.getByRole("button", { name: "Geri" }).click();
      const sheet = page.getByRole("dialog", { name: "Bugün öğrendiklerin" });
      await expect(sheet).toBeVisible();
      const box = await rect(page, ".cx-v3-sheet");
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(size.width);
      expect(box.bottom).toBeLessThanOrEqual(size.height);
      expect(await smallestTarget(page, ".cx-v3-sheet")).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/ogretmen-v3-ozet-${size.width}.png` });
      await sheet.getByRole("button", { name: "Kapat" }).click();
      await expect(sheet).toBeHidden();
      await expect(page.locator(".cx-v3")).toHaveCount(0);
    });
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`öğretmen v3 ${theme === "dark" ? "koyu" : "açık"} temada okunur (≥ 4,5:1) · 390px`, { tag: ["@public"] }, async ({ page }) => {
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem("theme", value);
      } catch {
        /* yok */
      }
    }, theme);
    await stubSideRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=takip");
    await expect(page.locator("html")).toHaveClass(new RegExp(theme === "dark" ? "\\bdark\\b" : "\\blight\\b"));
    await expect(page.locator(".cx-v3-thread")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("group", { name: "Takip soruları" })).toBeVisible();
    const selectors = [
      ".cx-v3-bubble",
      ".cx-v3-md p",
      ".cx-v3-general",
      ".cx-v3 .cp-callout-label",
      ".cx-v3 .cp-callout-body p",
      ".cx-v3 mark.cp-key",
      ".cx-v3-hap",
      ".cx-v3-new",
      ".cx-v3-more",
      ".cx-v3-input",
    ];
    const contrast = await readContrast(page, selectors);
    expect(Object.keys(contrast)).toHaveLength(selectors.length);
    for (const [selector, ratio] of Object.entries(contrast)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Daha fazla" }).click();
    const menu = await readContrast(page, [".cx-v3-menu-item", ".cx-v3-plus"]);
    for (const [selector, ratio] of Object.entries(menu)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/ogretmen-v3-tema-${theme}.png` });
  });
}
