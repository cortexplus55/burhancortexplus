import { expect, test, type Page } from "@playwright/test";

/**
 * Faz 7 (20 Kasım 2026): Sınav Radyosu çubuğu ve Kırmızı Kalemli Hoca kâğıdı; 390, 820 ve 1440 px, koyu ve açık tema.
 * Taşma yok, dokunma alanı en az 44 px, yazılar okunur (≥ 4,5:1), radyo ucu yalnız radyo ucudur (podcast ses ucu
 * hiç çağrılmaz). Gerçek bileşenler, veritabanısız fikstürler (`/e2e/sinav-radyosu`, `/e2e/kirmizi-kalem`).
 */

const WIDTHS = [390, 820, 1440] as const;
const THEMES = ["dark", "light"] as const;

async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {
      /* yok */
    }
  }, theme);
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Seçicideki öğelerin yazı rengi ile ilk opak atasının zemini arasındaki en düşük kontrast. */
async function minContrast(page: Page, selector: string) {
  return page.evaluate((query) => {
    const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const c = [r!, g!, b!].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const background = (node: Element | null): number[] => {
      for (let at: Element | null = node; at; at = at.parentElement) {
        const value = rgba(getComputedStyle(at).backgroundColor);
        if (value.length === 3 || (value[3] ?? 1) > 0.9) return value.slice(0, 3);
      }
      return [255, 255, 255];
    };
    let min = Infinity;
    for (const node of document.querySelectorAll(query)) {
      if (!(node as HTMLElement).offsetParent && getComputedStyle(node).position !== "fixed") continue;
      min = Math.min(min, ratio(rgba(getComputedStyle(node).color).slice(0, 3), background(node)));
    }
    return min;
  }, selector);
}

async function stubRadio(page: Page) {
  // Geliştirme sunucusunda React katı kipi ilk yükleme etkisini iki kez koşar (ilki iptal edilir): sayı değil, hangi
  // bölümün istendiği denetlenir.
  const requested: { path: string; podcastId: string | null }[] = [];
  await page.route("**/api/learning/**", async (route) => {
    const url = new URL(route.request().url());
    const body = (route.request().postDataJSON() ?? {}) as { podcastId: string };
    requested.push({ path: url.pathname, podcastId: body.podcastId ?? null });
    if (url.pathname !== "/api/learning/exam-prep/radio") return route.fulfill({ status: 404, json: { code: "not_found" } });
    const lines = [0, 1].map((index) => ({
      chapterIndex: 0,
      speaker: index ? "kerem" : "ada",
      text: `${body.podcastId.slice(0, 4)} satır ${index + 1}`,
      url: "/ornek/podcast-ornek.mp3",
      durationMs: 6000,
    }));
    return route.fulfill({ json: { ok: true, item: { id: body.podcastId, title: "x", topicLabel: "x" }, lines, creditsSpent: 0 } });
  });
  return requested;
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`Sınav Radyosu ${width} px ${theme}: çubuk ekranda, taşma yok, 44 px, okunur, yalnız radyo ucu`, async ({ page }) => {
      await useTheme(page, theme);
      const requested = await stubRadio(page);
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await page.goto("/e2e/sinav-radyosu");
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));

      const entry = page.getByRole("button", { name: /Sınav Radyosu \(Ücretsiz Dinle\)/ });
      await expect(entry).toBeVisible();
      expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await entry.click();

      const bar = page.getByRole("region", { name: "Sınav Radyosu" });
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("button", { name: /^(Duraklat|Oynat)$/ })).toBeEnabled();
      await expect(page.locator("html")).toHaveAttribute("data-cx-radio", "open");
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // Giriş hareketi (8 px yukarı kayma) bitince ölçülür.
      await bar.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      const box = (await bar.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      // Telefonda alt sekme çubuğunun (8 + 64 px) üstünde.
      if (width < 768) expect(height - (box.y + box.height)).toBeGreaterThanOrEqual(79);

      for (const button of await bar.getByRole("button").all()) {
        const size = (await button.boundingBox())!;
        const name = await button.getAttribute("aria-label");
        expect(size.height, name ?? "").toBeGreaterThanOrEqual(44);
        expect(size.width, name ?? "").toBeGreaterThanOrEqual(44);
      }
      expect(await minContrast(page, ".cp-prep-radio-title, .cp-prep-radio-kicker > span, .cp-prep-radio-speed")).toBeGreaterThanOrEqual(4.5);
      expect(await minContrast(page, ".cp-prep-radio-entry-title, .cp-prep-radio-entry-sub")).toBeGreaterThanOrEqual(4.5);

      await page.screenshot({ path: `test-results/sinav-radyosu-${width}-${theme}.png` });
      await bar.getByRole("button", { name: "Sonraki bölüm" }).click();
      await expect.poll(() => requested.at(-1)?.podcastId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      expect(requested[0]?.podcastId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
      await bar.getByRole("button", { name: /^Hız:/ }).click();
      await expect(bar.getByRole("button", { name: /^Hız:/ })).toHaveText("1,25×");
      expect(requested.every((entry) => entry.path === "/api/learning/exam-prep/radio")).toBe(true);

      await bar.getByRole("button", { name: "Radyoyu kapat" }).click();
      await expect(bar).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveAttribute("data-cx-radio", "open");
      await expect(entry).toBeFocused();
    });
  }
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`Kırmızı Kalemli Hoca ${width} px ${theme}: kâğıt taşmaz, yazı ≥ 12 px ve okunur`, async ({ page }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/e2e/kirmizi-kalem");
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
      const sheets = page.getByRole("region", { name: "Kırmızı Kalemli Hoca" });
      await expect(sheets).toHaveCount(3);
      await expect(page.locator(".e2e-redpen-partial")).toContainText("Hoca buradan kırar:");
      await expect(page.locator(".e2e-redpen-partial")).toContainText("+4 Puan");
      await expect(page.locator(".e2e-redpen-partial")).toContainText("−1 Puan");
      await expect(page.locator(".e2e-redpen-capped")).toContainText("Yöntem yazılmadan yalnız sonuç verilmiş.");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      for (const sheet of await sheets.all()) {
        const box = (await sheet.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      }
      const smallest = await page.evaluate(() =>
        Math.min(
          ...[...document.querySelectorAll(".cp-redpen *")]
            .filter((node) => node.childNodes.length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
            .map((node) => parseFloat(getComputedStyle(node).fontSize)),
        ),
      );
      expect(smallest).toBeGreaterThanOrEqual(12);
      expect(
        await minContrast(page, ".cp-redpen-kicker, .cp-redpen-total, .cp-redpen-text, .cp-redpen-plus, .cp-redpen-step, .cp-redpen-note, .cp-redpen-note strong, .cp-redpen-circle"),
      ).toBeGreaterThanOrEqual(4.5);
      await page.locator(".e2e-redpen-partial").screenshot({ path: `test-results/kirmizi-kalem-${width}-${theme}.png` });
    });
  }
}
