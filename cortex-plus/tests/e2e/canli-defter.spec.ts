import { expect, test, type Page } from "@playwright/test";

/**
 * Canlı Defter Modu (28 Kasım 2026), gerçek ders ekranıyla. Telefonda (390×844) ve masaüstünde (1280×800):
 * kelime kelime yazım, kalem ucu, formülün tek parça açılması (ham "$" hiç görünmez), "Hepsini göster" / "Tekrar oynat",
 * 1× → 2×, Gece / Defter tercihinin kalıcılığı, geri dönülen adımda ve hareket azaltmada tam açık metin; yana taşma
 * ve üst üste binme yok; düğmeler 44 px. Ekran görüntüleri yazım sürerken (fosforlu vurgu ve formül kutusu açıkken).
 */

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1280", width: 1280, height: 800, mobile: false },
] as const;

const SCOPE = ".als-step-content";

async function start(page: Page, query = "") {
  await page.goto(`/e2e/canli-defter${query}`);
  await expect(page.locator(".als")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Derse başla" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible();
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Görünür kutular birbirinin üstüne binmesin (akış içindeki satırlar). */
async function overlaps(page: Page, selectors: string[]) {
  return page.evaluate((list) => {
    const boxes = list.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden")
        .map((el) => ({ selector, rect: el.getBoundingClientRect() })),
    );
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!.rect;
        const b = boxes[j]!.rect;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) out.push(`${boxes[i]!.selector} × ${boxes[j]!.selector}`);
      }
    }
    return out;
  }, selectors);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.mobile, isMobile: viewport.mobile });

    test("ilk giriş: kelime kelime yazılır, kalem görünür, formül tek parça; Gece ekran görüntüsü @public", async ({ page }) => {
      const requests: string[] = [];
      page.on("request", (request) => {
        if (/\/api\//.test(request.url())) requests.push(request.url());
      });
      await start(page);
      const scope = page.locator(SCOPE);
      await expect(scope).toHaveClass(/lw-playing/);
      // Yazım sürerken: bir kısım açık, bir kısım bekliyor; formül kutusu açılmış, sonraki not henüz değil.
      await page.waitForFunction(
        () => {
          const card = document.querySelector(".als-formula-card.is-in, .lw-block.is-in .als-formula-card");
          const waiting = document.querySelectorAll(".als-step-content .lw:not(.is-in)").length;
          return Boolean(card) && waiting > 0;
        },
        undefined,
        { polling: "raf", timeout: 15_000 },
      );
      await expect(page.locator(".lw-pen.is-on")).toHaveCount(1);
      await page.screenshot({ path: `test-results/canli-defter-gece-${viewport.name}.png` });
      // Formül tek parça: satır içi formül bir birim, ham "$" yok.
      const atoms = page.locator(`${SCOPE} .lw-atom`);
      expect(await atoms.count()).toBeGreaterThan(0);
      expect(await page.locator(`${SCOPE} .lw-atom .katex`).count()).toBeGreaterThan(0);
      expect(await scope.innerText()).not.toContain("$");
      // Fosforlu vurgu: kilit bilgi ve terim birer parça.
      await expect(page.locator(`${SCOPE} mark.lw-hl--key`)).toHaveCount(1);
      await expect(page.locator(`${SCOPE} strong.lw-hl--term`)).toHaveCount(1);
      // Yazım biter: hepsi açık, kalem kaybolur, "Tekrar oynat" görünür.
      await expect(page.getByRole("button", { name: "Tekrar oynat" })).toBeVisible({ timeout: 15_000 });
      expect(await page.locator(`${SCOPE} .lw:not(.is-in)`).count()).toBe(0);
      await expect(page.locator(".lw-pen.is-on")).toHaveCount(0);
      expect(requests).toEqual([]);
    });

    test("Hepsini göster anında tam açar; Tekrar oynat baştan yazar; 1× → 2× saklanır @public", async ({ page }) => {
      await start(page);
      await expect(page.locator(SCOPE)).toHaveClass(/lw-playing/);
      const showAll = page.getByRole("button", { name: "Hepsini göster" });
      await showAll.click();
      await expect(page.locator(SCOPE)).not.toHaveClass(/lw-playing/);
      await expect(page.locator(".als-formula-card")).toBeVisible();
      await expect(page.locator(".als-note--exam")).toBeVisible();
      const replay = page.getByRole("button", { name: "Tekrar oynat" });
      await expect(replay).toBeVisible();
      const speed = page.getByRole("button", { name: /Yazım hızı 1 kat/ });
      await speed.click();
      await expect(page.getByRole("button", { name: /Yazım hızı 2 kat/ })).toBeVisible();
      expect(await page.evaluate(() => window.localStorage.getItem("cp:ders:hiz"))).toBe("2");
      await replay.click();
      await expect(page.locator(SCOPE)).toHaveClass(/lw-playing/);
      await expect(page.getByRole("button", { name: "Hepsini göster" })).toBeVisible();
      // 2× hızda adım kısa sürede biter.
      await expect(page.getByRole("button", { name: "Tekrar oynat" })).toBeVisible({ timeout: 8_000 });
    });

    test("Defter görünümü: kâğıt zemin, kareli doku, tercih kalıcı; Defter ekran görüntüsü @public", async ({ page }) => {
      await start(page);
      await page.getByRole("button", { name: "Defter" }).click();
      const sheet = page.locator("article.als");
      await expect(sheet).toHaveAttribute("data-gorunum", "defter");
      const look = await sheet.evaluate((el) => {
        const style = getComputedStyle(el);
        return { bg: style.backgroundColor, image: style.backgroundImage };
      });
      expect(look.bg).toBe("rgb(250, 246, 238)");
      expect(look.image).toContain("linear-gradient");
      expect(await page.evaluate(() => window.localStorage.getItem("cp:ders:gorunum"))).toBe("defter");
      // Sayfa yenilenince Defter kalır; yazım yeniden ilk girişte başlar.
      await start(page);
      await expect(page.locator("article.als")).toHaveAttribute("data-gorunum", "defter");
      await page.waitForFunction(
        () => Boolean(document.querySelector(".als-formula-card.is-in, .lw-block.is-in .als-formula-card")) && document.querySelectorAll(".als-step-content .lw:not(.is-in)").length > 0,
        undefined,
        { polling: "raf", timeout: 15_000 },
      );
      await page.screenshot({ path: `test-results/canli-defter-defter-${viewport.name}.png` });
      await expect(page.getByRole("button", { name: "Tekrar oynat" })).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: `test-results/canli-defter-defter-tam-${viewport.name}.png`, fullPage: true });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("Defter: önsöz, sınav tuzağı, hafıza çivisi ve 'Ders özeti' penceresi kâğıtta okunur @public", async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("cp:ders:gorunum", "defter"));
      await page.goto("/e2e/canli-defter");
      await expect(page.locator("article.als")).toHaveAttribute("data-gorunum", "defter", { timeout: 30_000 });
      await page.screenshot({ path: `test-results/canli-defter-defter-onsoz-${viewport.name}.png`, fullPage: true });
      await page.getByRole("button", { name: "Derse başla" }).click();
      await page.getByRole("button", { name: "Hepsini göster" }).click();
      await page.getByRole("button", { name: /Devam et/ }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: "Toplam köke dağılmaz" })).toBeVisible();
      await page.getByRole("button", { name: "Hepsini göster" }).click();
      await page.screenshot({ path: `test-results/canli-defter-defter-tuzak-${viewport.name}.png`, fullPage: true });
      // Kâğıtta metin koyu mürekkep: başlık ve gövde metni ile zemin arasında güçlü karşıtlık.
      const ink = await page.locator(".als-heading").first().evaluate((el) => getComputedStyle(el).color);
      expect(ink).toBe("rgb(27, 34, 56)");
      await page.getByRole("button", { name: "Ders özeti" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: `test-results/canli-defter-defter-pencere-${viewport.name}.png` });
      await page.keyboard.press("Escape");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("taşma yok, şerit üst üste binmez, düğmeler 44 px; son adımda da @public", async ({ page }) => {
      await start(page);
      await page.getByRole("button", { name: "Hepsini göster" }).click();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const rows = [".als-top", ".als-toolbar", ".lw-controls", ".cp-spark", ".als-heading"];
      expect(await overlaps(page, rows)).toEqual([]);
      // Şeridin bütün düğmeleri 44 px; "Ders özeti" önsözün kuralıyla (telefonda 44, masaüstünde 40).
      const heights = await page
        .locator(".lw-controls button")
        .evaluateAll((nodes) => nodes.map((node) => Math.round((node as HTMLElement).getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThanOrEqual(4);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
      const reopen = await page.locator(".als-brief-reopen").boundingBox();
      expect(reopen!.height).toBeGreaterThanOrEqual(viewport.mobile ? 44 : 40);
      // Telefonda şerit tek satır.
      const strip = await page.locator(".lw-controls").boundingBox();
      expect(strip!.height).toBeLessThanOrEqual(52);
      // Son adım (kapanış): "Son adım!" kıvılcımı, şerit ve "Ders özeti" ayrı satırlarda.
      for (let guard = 0; guard < 6; guard += 1) {
        if (await page.getByRole("heading", { level: 1, name: "Bu Konudan Aklında Kalsın" }).isVisible().catch(() => false)) break;
        await page.getByRole("button", { name: /Devam et/ }).first().click();
      }
      await expect(page.getByRole("heading", { level: 1, name: "Bu Konudan Aklında Kalsın" })).toBeVisible();
      await expect(page.locator(".cp-spark")).toBeVisible();
      expect(await overlaps(page, rows)).toEqual([]);
      await expect(page.getByRole("button", { name: "Tekrar oynat" })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".als-closing li")).toHaveCount(3);
      // Kapanış maddeleri de kelime kelime yazıldı ve hepsi açık.
      expect(await page.locator(".als-closing .lw").count()).toBeGreaterThan(10);
      expect(await page.locator(".als-closing .lw:not(.is-in)").count()).toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/canli-defter-kapanis-${viewport.name}.png`, fullPage: true });
    });

    test("geri dönülen adım ve başlanmış ders tam açık gelir @public", async ({ page }) => {
      await start(page);
      await page.getByRole("button", { name: "Hepsini göster" }).click();
      await page.getByRole("button", { name: /Devam et/ }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: "Toplam köke dağılmaz" })).toBeVisible();
      await expect(page.locator(SCOPE)).toHaveClass(/lw-playing/);
      await page.getByRole("button", { name: "Geri" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible();
      await expect(page.locator(SCOPE)).not.toHaveClass(/lw-playing/);
      await expect(page.getByRole("button", { name: "Tekrar oynat" })).toBeVisible();
      // Başlanmış ders: hiçbir adım kendiliğinden yazılmaz.
      await page.goto("/e2e/canli-defter?durum=baslanmis");
      await expect(page.getByRole("heading", { level: 1, name: "Kök dışına çıkarma" })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(SCOPE)).not.toHaveClass(/lw-playing/);
      await expect(page.locator(".als-formula-card")).toBeVisible();
    });

    test("hareket azaltma: yazım yok, içerik ve vurgular anında tam @public", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await start(page);
      await expect(page.locator(SCOPE)).not.toHaveClass(/lw-playing/);
      await expect(page.locator(".als-formula-card")).toBeVisible();
      await expect(page.locator(".als-note--exam")).toBeVisible();
      await expect(page.locator(`${SCOPE} mark.lw-hl--key`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Hepsini göster" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Yazım hızı/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Defter" })).toBeVisible();
    });
  });
}
