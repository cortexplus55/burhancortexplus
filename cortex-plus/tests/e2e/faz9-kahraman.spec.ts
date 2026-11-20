import { expect, test, type Page } from "@playwright/test";

/*
  Faz 9 (20 Kasım 2026), misafir ana sayfası:
  - Kahramanda TEK seçici (dört seçenek; eski dört sekme ve turun branş şeridi birleşti), seçili seçenek yüksek
    kontrastlı; altında tek satır.
  - Turun birinci adımı tek kart ("Akıllı Not Stüdyosu"): ray, bırakma alanı, iki düğme (geniş ekranda yan yana,
    telefonda alt alta).
  - Tam ekran stüdyo ilk kareden opak ve pazarlama menüsünün üstünde (önce ilk karelerde saydamdı, menü üstüne biniyordu).
  - "Formül & Kural → ÇİFT DERECELİ KÖK" kartında yalnız √ görünüyordu: KaTeX yazı tipleri (`font-display: block`) formül
    ekrana gelince isteniyordu. Artık formülden önce istenir; formül eksiksiz çizilir.
*/

const SIZES = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Kahraman ve birinci adımdaki görünen düğme ve bağlantıların en küçük yüksekliği. */
async function smallestHeroTarget(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>(".hm-hero button, .hm-hero a")].filter((node) => node.offsetParent !== null);
    return Math.min(...nodes.map((node) => Math.round(node.getBoundingClientRect().height * 10) / 10));
  });
}

/** Seçili seçeneğin ad ve alt satırının zeminle kontrastı (en düşüğü). */
async function selectedContrast(page: Page): Promise<number> {
  return page.evaluate(() => {
    const lum = (color: string) => {
      const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const on = document.querySelector<HTMLElement>('[data-hero-pick] [aria-checked="true"]')!;
    const ground = getComputedStyle(on).backgroundColor;
    return Math.min(
      ratio(getComputedStyle(on.querySelector(".lp-pick-name")!).color, ground),
      ratio(getComputedStyle(on.querySelector(".lp-pick-field")!).color, ground),
    );
  });
}

test.describe("Faz 9: misafir kahramanı ve birinci adım", { tag: ["@public"] }, () => {
  test.describe.configure({ timeout: 120_000 });

  for (const size of SIZES) {
    test(`kahraman ${size.width}px: tek seçici, ders çekirdeği, tek satır; taşma yok, dokunma ≥ 44 px, seçili seçenek ≥ 4,5:1`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/");
      const picker = page.getByRole("radiogroup", { name: "Hangi sınava hazırlanıyorsun?" });
      await expect(picker.getByRole("radio")).toHaveCount(4);
      // Sayfada tek seçim grubu: turun içinde ikinci bir seçici yok.
      await expect(page.getByRole("radiogroup")).toHaveCount(1);
      await expect(page.locator("section#nasil [role=radiogroup]")).toHaveCount(0);
      // Seçici ortada.
      const pickBox = (await picker.boundingBox())!;
      const center = pickBox.x + pickBox.width / 2;
      if (size.width < 1100) expect(Math.abs(center - size.width / 2)).toBeLessThan(2);
      // Her seçenek seçiliyken okunur; seçim kahramanın düğmesini ve turun örnek notunu birlikte değiştirir.
      const options = [
        ["Üniversite · Mühendislik", "/kayit?hedef=universite", "Akiskanlar_ve_Termodinamik_Vize_Notu.pdf"],
        ["TUS / Tıp · Farmakoloji", "/kayit?hedef=tus", "Kardiyoloji_Antiaritmikler_TUS_Notu.pdf"],
        ["KPSS / Hukuk · Anayasa", "/kayit?hedef=akademik", "Anayasa_Yasama_Sureci_Notu.pdf"],
        ["Lise & YKS · Matematik", "/kayit?hedef=lise", "Köklü_Sayılar_Ders_Notu.pdf"],
      ] as const;
      for (const [name, href, file] of options) {
        await expect(async () => {
          await page.getByRole("radio", { name }).click();
          await expect(page.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true", { timeout: 1500 });
        }).toPass({ timeout: 20_000 });
        await expect(page.locator("[data-hero-cta]")).toHaveAttribute("href", href);
        await expect(page.locator(".lj-note")).toContainText(file);
        await expect.poll(() => selectedContrast(page), { message: name }).toBeGreaterThanOrEqual(4.5);
        expect(await overflow(page), name).toBeLessThanOrEqual(1);
      }
      // Ok tuşları seçimi ve odağı birlikte kaydırır.
      await page.getByRole("radio", { name: "Lise & YKS · Matematik" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Üniversite · Mühendislik" })).toBeFocused();
      await expect(page.getByRole("radio", { name: "Üniversite · Mühendislik" })).toHaveAttribute("aria-checked", "true");

      // Birinci adım (Faz 9.1): ray, örnek not, kendi notunun yuvası ve ders çekirdeği. Geniş ekranda not solda, çekirdek
      // sağda; telefonda not üstte, çekirdek altta. Faz 9'un tek kartı ve iki düğmesi yok.
      const card = page.locator("section#nasil .lj-console");
      await expect(card.locator(".lj-rail button")).toHaveCount(7);
      await expect(card.locator("[data-core]")).toBeVisible();
      await expect(card.locator(".lj-live, .lj-context, .lj-console-head, button.lj-zone, button.lj-file, [data-drop], .lj-door-actions")).toHaveCount(0);
      const start = (await card.locator("[data-sample-start]").boundingBox())!;
      const own = (await card.locator("[data-own-pick]").boundingBox())!;
      const core = (await card.locator(".lj-core-orb").boundingBox())!;
      expect(start.height).toBeGreaterThanOrEqual(44);
      expect(own.height).toBeGreaterThanOrEqual(44);
      expect(own.y).toBeGreaterThan(start.y + start.height - 1);
      if (size.width >= 640) expect(core.x).toBeGreaterThan(start.x + start.width);
      else expect(core.y).toBeGreaterThan(own.y + own.height);
      // Kahramanın altı tek satır; geniş ekranda gerçekten tek satır.
      const foot = page.locator("[data-hero-foot]");
      await expect(foot).toContainText("Kart istemiyoruz");
      await expect(foot.getByRole("link", { name: /hazır müfredattan başla/ })).toHaveAttribute("href", "/mufredat");
      await expect(foot.getByRole("link", { name: "Örnek dersi incele" })).toHaveAttribute("href", "/ornek");
      if (size.width >= 820) expect((await foot.boundingBox())!.height).toBeLessThanOrEqual(46);
      expect(await smallestHeroTarget(page)).toBeGreaterThanOrEqual(44);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/faz9-kahraman-${size.width}.png` });
    });
  }

  for (const size of [SIZES[0], SIZES[2]]) {
    test(`stüdyo ${size.width}px: ilk kareden opak, menünün ve çerez şeridinin üstünde; yalnız içerik belirir`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/");
      for (const at of [2, 3]) {
        await expect(async () => {
          await page.getByRole("button", { name: new RegExp(`^Adım ${at}: `) }).click();
          await expect(page.locator(".lj-studio")).toHaveCount(1, { timeout: 1500 });
        }).toPass({ timeout: 20_000 });
        // Açılır açılmaz (ilk kare): katman opak, kaymıyor ve menünün ortasındaki nokta stüdyonun.
        const state = await page.evaluate(() => {
          const studio = document.querySelector<HTMLElement>(".lj-studio")!;
          const style = getComputedStyle(studio);
          const header = document.querySelector("header.mkh")!.getBoundingClientRect();
          const top = document.elementFromPoint(header.left + header.width / 2, header.top + header.height / 2);
          return {
            opacity: style.opacity,
            transform: style.transform,
            animation: style.animationName,
            z: Number(style.zIndex),
            topIsStudio: Boolean(top?.closest(".lj-studio")),
          };
        });
        expect(state).toMatchObject({ opacity: "1", transform: "none", animation: "none", topIsStudio: true });
        expect(state.z).toBeGreaterThanOrEqual(100);
        await page.getByRole("button", { name: "Kapat", exact: true }).click();
        await expect(page.locator(".lj-studio")).toHaveCount(0);
      }
    });
  }

  test("formül: KaTeX yazı tipleri formül kartından önce istenir; ÇİFT DERECELİ KÖK eksiksiz çizilir (390 ve 1440)", async ({ page }) => {
    // Yavaş ağ: KaTeX yazı tipleri 1,5 sn gecikir. Düzeltmeden önce yazı tipi formül kartı ekrana gelince isteniyordu;
    // kart açıldığında harfler görünmez (font-display: block), yalnız √ çiziliydi.
    await page.route(/KaTeX_.*\.(woff2|woff|ttf)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue().catch(() => undefined);
    });
    for (const size of [SIZES[0], SIZES[2]]) {
      await page.setViewportSize(size);
      await page.goto("/?hedef=lise");
      await expect(async () => {
        await page.getByRole("button", { name: /^Adım 3: / }).click();
        await expect(page.locator(".lj-studio .tp-app .als")).toBeVisible({ timeout: 8000 });
      }).toPass({ timeout: 60_000 });
      const app = page.locator(".lj-studio .tp-app");
      // Dersin ilk ekranında formül kartı yok, ama yazı tipleri çoktan istendi.
      await expect(app.locator(".als-formula-card")).toHaveCount(0);
      const requested = await page.evaluate(() =>
        [...document.fonts].filter((face) => /KaTeX_(Main|Math)/.test(face.family) && face.status !== "unloaded").map((face) => face.family),
      );
      expect(requested).toEqual(expect.arrayContaining(["KaTeX_Main", "KaTeX_Math"]));
      // Öğrenci dersin girişini okur (2 sn), önce dene sorusunu cevaplar: formül kartı açıldığında yazı tipleri hazır.
      await page.waitForTimeout(2000);
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /Yanlış/ }).click();
      const card = app.locator(".als-formula-card").filter({ hasText: "Çift dereceli kök" });
      await expect(card).toBeVisible();
      const ready = await page.evaluate(() => document.fonts.check("1em KaTeX_Main") && document.fonts.check("italic 1em KaTeX_Math"));
      expect(ready).toBe(true);
      // Formülün kendisi: kök derecesi (2n), kökün içi (a ve üssü 2n) ve sağ taraf |a|; kartın içinde, kesilmeden.
      const formula = await card.locator(".als-formula-card-expr").evaluate((node) => {
        const html = node.querySelector(".katex-html")!;
        const sqrt = node.querySelector(".mord.sqrt")!.getBoundingClientRect();
        const rel = node.querySelector(".mrel")?.getBoundingClientRect();
        const box = html.getBoundingClientRect();
        const cardBox = node.closest(".als-formula-card")!.getBoundingClientRect();
        const glyphs = [...html.querySelectorAll<HTMLElement>(".mord, .mrel")].filter((item) => !item.children.length);
        return {
          text: (html.textContent ?? "").replace(/[​\s]/g, "").replace(/∣/g, "|"),
          root: node.querySelector(".sqrt .katex-root")?.textContent,
          inside: box.left >= cardBox.left - 0.5 && box.right <= cardBox.right + 0.5,
          wider: box.width > sqrt.width + 10 && Boolean(rel && rel.width > 1 && rel.left >= sqrt.right - 1),
          visibleGlyphs: glyphs.filter((item) => item.getBoundingClientRect().width > 1).length,
          color: getComputedStyle(html).color,
        };
      });
      expect(formula.text).toBe("2na2n=|a|");
      expect(formula.root).toBe("2n");
      expect(formula.inside).toBe(true);
      expect(formula.wider).toBe(true);
      expect(formula.visibleGlyphs).toBeGreaterThanOrEqual(5);
      // Yüksek kontrast: koyu kartta açık renkli formül.
      expect(formula.color).not.toBe("rgba(0, 0, 0, 0)");
      await card.screenshot({ path: `test-results/faz9-formul-${size.width}.png` });
      await page.getByRole("button", { name: "Kapat", exact: true }).click();
    }
  });

  // TUS ve hukuk derslerinde formül kartı yok (birim test `faz9-kahraman-formul.test.tsx` sayar).
  test("öbür branşın formül kartı: mühendislikte kaldırma kuvveti eksiksiz çizilir, kartın içinde kalır", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?hedef=universite");
    await expect(async () => {
      await page.getByRole("button", { name: /^Adım 3: / }).click();
      await expect(page.locator(".lj-studio .tp-app .als")).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 60_000 });
    const app = page.locator(".lj-studio .tp-app");
    await app.getByRole("button", { name: /^Devam et/ }).click();
    await app.getByRole("button", { name: /Yanlış/ }).click();
    const card = app.locator(".als-formula-card").first();
    await expect(card).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const text = await card.locator(".katex-html").evaluate((node) => (node.textContent ?? "").replace(/[​\s]/g, ""));
    for (const part of ["F", "k", "V", "batan", "d", "sıvı", "g"]) expect(text, part).toContain(part);
    const inside = await card.evaluate((node) => {
      const html = node.querySelector(".katex-html")!.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return html.left >= box.left - 0.5 && html.right <= box.right + 0.5;
    });
    expect(inside).toBe(true);
  });
});
