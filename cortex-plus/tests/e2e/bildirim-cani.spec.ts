import { expect, test, type Page } from "@playwright/test";

/*
  Faz 6 (20 Kasım 2026): öğrenci kabuğundaki bildirim çanı. 375 ve 1280 px'te: çan üst çubukta görünür, rozet okunmamış
  sayısını yazar, pencere açılır (masaüstünde çanın altında 360 px, telefonda alttan tam genişlik), yana taşma yok,
  telefonda dokunma hedefleri ≥ 44 px; "Tümünü okundu işaretle" rozeti siler; Esc kapatır ve odak çana döner.
  Uçlar `page.route` ile karşılanır (fikstür veritabanısız).
*/

const NOW = Date.now();
const ITEMS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "podcast_ready",
    title: "Podcast'in hazır",
    body: "Hücre bölünmesi bölümü dinlenmeye hazır. Uzun bir açıklama satırı telefonda iki satırda kesilir.",
    actionUrl: "/e2e/bildirim-cani?ekran=liste",
    isRead: false,
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "blind_spot_detected",
    title: "Yeni sınav tuzağı",
    body: "Mol kavramında sık yapılan bir hata yakalandı.",
    actionUrl: null,
    isRead: false,
    createdAt: new Date(NOW - 3 * 3_600_000).toISOString(),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "payment",
    title: "Ödemen alındı",
    body: "Plus planın açıldı.",
    actionUrl: null,
    isRead: true,
    createdAt: new Date(NOW - 3 * 86_400_000).toISOString(),
  },
];

async function stubApi(page: Page) {
  const state = { unread: 12, reads: [] as unknown[] };
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* yok */
    }
  });
  await page.route("**/api/notifications**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/notifications/read") {
      const body = route.request().postDataJSON() as { all?: boolean; ids?: string[] };
      state.reads.push(body);
      state.unread = body.all ? 0 : Math.max(0, state.unread - (body.ids?.length ?? 0));
      return route.fulfill({ json: { ok: true, unread: state.unread } });
    }
    const limit = url.searchParams.get("limit");
    return route.fulfill({ json: { items: limit === "0" ? [] : ITEMS, unread: state.unread } });
  });
  await page.route("**/api/bildirim-tercihleri", (route) => route.fulfill({ json: { ok: true } }));
  return state;
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const theme of ["dark", "light"] as const) {
  test(`bildirim çanı ${theme === "dark" ? "koyu" : "açık"} tema: yazılar okunur (≥ 4,5:1)`, { tag: ["@public"] }, async ({ page }) => {
    await stubApi(page);
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem("theme", value);
      } catch {
        /* yok */
      }
    }, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/e2e/bildirim-cani");
    await expect(page.locator("html")).toHaveClass(new RegExp(theme === "dark" ? "\\bdark\\b" : "\\blight\\b"));
    const bell = page.locator("header.cx-home-top .cx-bell-btn");
    const panel = page.getByRole("dialog", { name: "Bildirimler" });
    await expect(async () => {
      if (!(await panel.count())) await bell.click();
      await expect(panel).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(panel.getByRole("button", { name: /Podcast'in hazır/ })).toBeVisible();
    await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: `test-results/bildirim-cani-${theme}.png` });
    const ratios = await page.evaluate(() => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const c = [r!, g!, b!].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
      };
      const contrast = (a: string, b: string) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m);
        return (x! + 0.05) / (y! + 0.05);
      };
      const panelBg = getComputedStyle(document.querySelector(".cx-bell-panel")!).backgroundColor;
      const out: Record<string, number> = {};
      for (const selector of [".cx-bell-title", ".cx-bell-item.is-unread .cx-bell-item-title", ".cx-bell-item-body", ".cx-bell-item-time", ".cx-bell-all"]) {
        out[selector] = contrast(getComputedStyle(document.querySelector(selector)!).color, panelBg);
      }
      const badge = document.querySelector(".cx-bell-badge");
      if (badge) out.badge = contrast(getComputedStyle(badge).color, getComputedStyle(badge).backgroundColor);
      return out;
    });
    for (const [selector, ratio] of Object.entries(ratios)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
  });
}

for (const width of [360, 375, 1280]) {
  const phone = width < 768;

  test(`bildirim çanı ${width} px: görünür, açılır, taşma yok`, { tag: ["@public"] }, async ({ page }) => {
    const state = await stubApi(page);
    await page.setViewportSize({ width, height: phone ? 812 : 900 });
    await page.goto("/e2e/bildirim-cani");

    const bell = page.locator("header.cx-home-top .cx-bell-btn");
    await expect(bell).toBeVisible();
    await expect(bell).toHaveAttribute("aria-label", "Bildirimler, 12 okunmamış");
    await expect(page.locator(".cx-bell-badge")).toHaveText("9+");
    const bellBox = (await bell.boundingBox())!;
    expect(Math.round(bellBox.width)).toBe(phone ? 44 : 40);
    expect(Math.round(bellBox.height)).toBe(phone ? 44 : 40);
    expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(width);
    expect(await overflow(page), "kapalıyken yana taşma").toBeLessThanOrEqual(1);

    // Yük altında ilk tıklama sayfa canlanmadan düşebilir: pencere açılana kadar yeniden basılır.
    const panel = page.getByRole("dialog", { name: "Bildirimler" });
    await expect(async () => {
      if (!(await panel.count())) await bell.click();
      await expect(panel).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(panel.getByRole("button", { name: /Podcast'in hazır/ })).toBeVisible();
    await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: `test-results/bildirim-cani-${width}.png` });

    const box = (await panel.boundingBox())!;
    if (phone) {
      expect(Math.round(box.x)).toBe(8);
      expect(Math.round(box.width)).toBe(width - 16);
    } else {
      expect(Math.round(box.width)).toBe(360);
      expect(box.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
    }
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await overflow(page), "açıkken yana taşma").toBeLessThanOrEqual(1);

    if (phone) {
      const targets = await panel.locator("button, a").evaluateAll((elements) =>
        elements
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => ({
            label: element.getAttribute("aria-label") ?? element.textContent ?? "",
            height: Math.round(element.getBoundingClientRect().height),
            width: Math.round(element.getBoundingClientRect().width),
          })),
      );
      expect(targets.length).toBeGreaterThan(3);
      for (const target of targets) {
        expect(target.height, `${target.label} yüksekliği`).toBeGreaterThanOrEqual(44);
        expect(target.width, `${target.label} genişliği`).toBeGreaterThanOrEqual(44);
      }
    }

    await panel.getByRole("button", { name: "Tümünü okundu işaretle" }).click();
    await expect(page.locator(".cx-bell-badge")).toHaveCount(0);
    await expect(bell).toHaveAttribute("aria-label", "Bildirimler");
    expect(state.reads).toContainEqual({ all: true });

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(bell).toBeFocused();
  });

  test(`bildirimler listesi ve tercih paneli ${width} px: taşma yok, hedefler yeterli`, { tag: ["@public"] }, async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width, height: phone ? 812 : 900 });

    await page.goto("/e2e/bildirim-cani?ekran=liste");
    await expect(page.locator(".cx-nl-item")).toHaveCount(3);
    expect(await overflow(page), "liste yana taşma").toBeLessThanOrEqual(1);
    const listTargets = await page.locator(".cx-nl button, .cx-nl a").evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().height)),
    );
    for (const height of listTargets) expect(height).toBeGreaterThanOrEqual(phone ? 44 : 40);

    await page.goto("/e2e/bildirim-cani?ekran=tercihler");
    const radios = page.getByRole("radio");
    await expect(radios).toHaveText(["18:30", "19:00", "20:00", "21:00"]);
    expect(await overflow(page), "tercihler yana taşma").toBeLessThanOrEqual(1);
    for (const radio of await radios.all()) {
      expect(Math.round((await radio.boundingBox())!.height)).toBeGreaterThanOrEqual(phone ? 44 : 40);
    }
    await expect(page.getByText("Gece 22:00–08:00 arası hatırlatma e-postası göndermeyiz", { exact: false })).toBeVisible();
    await page.screenshot({ path: `test-results/bildirim-tercihleri-${width}.png`, fullPage: true });
  });
}

for (const [theme, width] of [
  ["light", 375],
  ["dark", 1280],
] as const) {
  test(`e-postadaki tercih sayfası (${theme === "dark" ? "koyu" : "açık"} tema, ${width} px): okunur, taşmaz, düğmeler anahtarla gönderir`, { tag: ["@public"] }, async ({ page }) => {
    const posts: { url: string; body: string | null }[] = [];
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem("theme", value);
      } catch {
        /* yok */
      }
    }, theme);
    await page.route("**/api/bildirim-tercihleri**", async (route) => {
      posts.push({ url: route.request().url(), body: route.request().postData() });
      return route.fulfill({ json: { ok: true } });
    });
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.goto("/e2e/bildirim-cani?ekran=misafir");
    const allOff = page.getByRole("button", { name: "Hepsini kapat" });
    await allOff.scrollIntoViewIfNeeded();
    await expect(allOff).toBeVisible();
    expect(await overflow(page), "yana taşma").toBeLessThanOrEqual(1);

    const ratios = await page.evaluate(() => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const c = [r!, g!, b!].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
      };
      const contrast = (a: string, b: string) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m);
        return (x! + 0.05) / (y! + 0.05);
      };
      const bg = getComputedStyle(document.querySelector(".cx-np-guest")!).backgroundColor;
      const out: Record<string, number> = {};
      for (const selector of [".cx-np-row-title", ".cx-np-row-hint", ".cx-np-marketing-text"]) {
        out[selector] = contrast(getComputedStyle(document.querySelector(selector)!).color, bg);
      }
      return out;
    });
    for (const [selector, ratio] of Object.entries(ratios)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/bildirim-misafir-${theme}-${width}.png`, fullPage: true });

    await allOff.click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]!.url).toMatch(/\/api\/bildirim-tercihleri$/);
    expect(JSON.parse(posts[0]!.body ?? "{}")).toEqual({
      token: "f".repeat(64),
      patch: { studyRemindersEmail: false, examCountdownEmail: false, weeklyDigestEmail: false, inAppNotifications: false },
    });
    await page.getByRole("button", { name: "Duyuru ve kampanya e-postalarından çık" }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1]!.url).toContain(`/api/bildirim-tercihleri/abonelik?token=${"f".repeat(64)}&c=marketing`);
    await expect(page.getByText("Tamam, artık duyuru ve kampanya e-postası göndermeyeceğiz.")).toBeVisible();
  });
}
