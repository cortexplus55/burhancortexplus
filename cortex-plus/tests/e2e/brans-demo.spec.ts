import { expect, test, type Page } from "@playwright/test";

/*
  Faz 7 (20 Kasım 2026): ana sayfanın 7 adımlı turu seçilen branşın örnek notuyla oynanır. Matematik dışındaki bir
  branş (mühendislik) telefonda ve geniş ekranda baştan sona oynanır: yana taşma yok, dokunma alanı 44 px, hiç ağ
  isteği yok, formül ve alt simge karakterleri ekranda.

  Faz 9 (20 Kasım 2026): branş şeridi ve kahramanın sekmeleri TEK seçicide birleşti (kahramanda, dört seçenek). Seçici
  daha geniş bir yedek yazı tipiyle (Verdana) de üst üste binmez, kesilmez, taşmaz; seçili seçenek yüksek kontrastlı.
*/

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function smallestTouchTarget(page: Page, scope: string): Promise<number> {
  return page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(`${selector} button, ${selector} a`)) as HTMLElement[];
    const heights = nodes.filter((node) => node.offsetParent !== null).map((node) => Math.round(node.getBoundingClientRect().height * 10) / 10);
    return heights.length ? Math.min(...heights) : 99;
  }, scope);
}

/** Stüdyodaki en küçük dokunma alanı: çubuklarda ekrandaki ölçü, sığdırılan sahnede düğmenin kendi ölçüsü. */
async function studioTouchTargets(page: Page): Promise<number> {
  return page.evaluate(() => {
    const heights = [...document.querySelectorAll<HTMLElement>(".lj-studio button, .lj-studio a")]
      .filter((node) => node.offsetParent !== null)
      .map((node) => (node.closest(".lj-fit") ? node.offsetHeight : Math.round(node.getBoundingClientRect().height * 10) / 10));
    return heights.length ? Math.min(...heights) : 99;
  });
}

async function studioScrolls(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const studio = document.querySelector(".lj-studio")!;
    const fit = document.querySelector(".lj-studio .lj-fit");
    const inner = document.querySelector(".lj-studio .lj-fit-inner");
    const overflowing = fit && inner ? inner.getBoundingClientRect().bottom > fit.getBoundingClientRect().bottom + 1 : false;
    return studio.scrollHeight > studio.clientHeight + 1 || Boolean(fit && fit.scrollTop) || overflowing;
  });
}

/**
 * Kahramanın tek seçicisi: üst üste binen çift, kesilen yazı (seçeneğin kendisi ya da iki satırından biri), 44 px'ten
 * kısa seçenek, seçicinin dışına taşan seçenek; seçili seçeneğin yazı/zemin kontrastı (ad ve alt satır).
 */
async function stripLayout(page: Page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll<HTMLElement>("[data-hero-pick] .lp-pick-opt")];
    const boxes = chips.map((chip) => chip.getBoundingClientRect());
    const lum = (color: string) => {
      const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const on = chips.find((chip) => chip.getAttribute("aria-checked") === "true")!;
    const ground = getComputedStyle(on).backgroundColor;
    const onContrast = Math.min(
      ratio(getComputedStyle(on.querySelector(".lp-pick-name")!).color, ground),
      ratio(getComputedStyle(on.querySelector(".lp-pick-field")!).color, ground),
    );
    const lines = chips.flatMap((chip) => [...chip.querySelectorAll<HTMLElement>(".lp-pick-name, .lp-pick-field")]);
    let overlaps = 0;
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const x = Math.min(boxes[a]!.right, boxes[b]!.right) - Math.max(boxes[a]!.left, boxes[b]!.left);
        const y = Math.min(boxes[a]!.bottom, boxes[b]!.bottom) - Math.max(boxes[a]!.top, boxes[b]!.top);
        if (x > 0.5 && y > 0.5) overlaps += 1;
      }
    }
    const strip = document.querySelector<HTMLElement>("[data-hero-pick]")!.getBoundingClientRect();
    return {
      count: chips.length,
      checked: chips.filter((chip) => chip.getAttribute("aria-checked") === "true").length,
      overlaps,
      clipped:
        chips.filter((chip) => chip.scrollWidth > chip.clientWidth + 1).length +
        lines.filter((line) => line.scrollWidth > line.clientWidth + 1).length,
      minHeight: Math.min(...boxes.map((box) => Math.round(box.height * 10) / 10)),
      outside: boxes.filter((box) => box.left < strip.left - 0.5 || box.right > strip.right + 0.5).length,
      onContrast: Math.round(onContrast * 100) / 100,
      stripRight: strip.right,
      viewport: document.documentElement.clientWidth,
    };
  });
}

/** Turun birinci adımının birincil düğmesi (örnek notla turu izle): stüdyoyu açar ve tarama anını oynatır. */
const SAMPLE_START = "[data-sample-start]";

const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

test.describe("branşa özel misafir demosu", { tag: ["@public"] }, () => {
  // Tur yedi adım ve ayrı parça olarak yüklenen iki ekran içerir; geliştirme sunucusunda ilk derleme uzun sürer.
  test.describe.configure({ timeout: 120_000 });

  for (const size of SIZES) {
    test(`mühendislik turu ${size.width}px: yedi adım branşın notuyla, taşma yok, dokunma 44 px, ağ isteği yok, formül karakterleri ekranda`, async ({ page, baseURL }) => {
      const apiCalls: string[] = [];
      const origin = new URL(baseURL!).origin;
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin !== origin) return;
        if (/\/api\//.test(url.pathname) && !/\/api\/(health|consent|csp-report)/.test(url.pathname)) apiCalls.push(request.url());
      });
      await page.setViewportSize(size);
      await page.goto("/?hedef=universite");
      const home = page.locator("section.lj");
      // Eski bağlantı ?hedef=universite: kahramanın tek seçicisinde "Üniversite" seçili, tur mühendislik notuyla.
      await expect(page.getByRole("radio", { name: "Üniversite · Mühendislik" })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("link", { name: /Vize-final kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      await expect(home.locator(".lj-drop-badge")).toContainText("Akiskanlar_ve_Termodinamik_Vize_Notu.pdf");
      await expect(home.locator(".lj-drop-badge")).toContainText("14 sayfa");
      // Turun içinde ikinci bir seçici yok.
      await expect(page.getByRole("radiogroup")).toHaveCount(1);
      await expect(home.locator("[data-tracks], .lj-track")).toHaveCount(0);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, "section.lj")).toBeGreaterThanOrEqual(44);
      const strip = await stripLayout(page);
      expect(strip).toMatchObject({ count: 4, checked: 1, overlaps: 0, clipped: 0, outside: 0 });
      expect(strip.minHeight).toBeGreaterThanOrEqual(44);
      // Adresteki seçim açılışta uygulanır; renk geçişi (160 ms) bitince ölçülür.
      await expect.poll(async () => (await stripLayout(page)).onContrast).toBeGreaterThanOrEqual(4.5);

      const tour = page.locator(".lj-studio");
      const fit = () =>
        page.evaluate(() => Number(getComputedStyle(document.querySelector(".lj-studio .lj-fit-inner")!).getPropertyValue("--lj-fit") || 1));
      /**
       * Adıma girişte içerik okunur ölçekte sığar (anlar A1 ile aynı taban, 0,6). Cevaptan sonra açıklama eklenince
       * sahne bir kademe daha küçülebilir; o anlarda yalnız sığması (taban 0,5) ölçülür.
       */
      const check = async (step: string, minScale = 0.6) => {
        expect(await overflow(page), `${step}: yana taşma`).toBeLessThanOrEqual(1);
        expect(await studioTouchTargets(page), `${step}: dokunma alanı`).toBeGreaterThanOrEqual(44);
        await expect.poll(() => studioScrolls(page), { message: `${step}: stüdyo kaymaz`, timeout: 3000 }).toBe(false);
        await expect.poll(fit, { message: `${step}: ölçek`, timeout: 3000 }).toBeGreaterThanOrEqual(minScale);
      };

      // 1-2. Not ve yol: tarama bulguları ve yol haritası branşın.
      await expect(async () => {
        const start = home.locator(SAMPLE_START);
        if ((await tour.count()) === 0 && (await start.isEnabled({ timeout: 500 }).catch(() => false))) await start.click();
        await expect(tour.getByRole("button", { name: "Şimdi 1. dersi aç" })).toBeVisible({ timeout: 4000 });
      }).toPass({ timeout: 25_000 });
      await expect(tour.getByText("Kaldırma Kuvveti Vektörleri")).toBeVisible();
      await expect(tour.getByText("Bernoulli Denklemi")).toBeVisible();
      await expect(tour.getByText("Vizene 7 gün var")).toBeVisible();
      await expect(tour.locator("[data-warning]")).toContainText("Hoca uyarısı");
      await check("yol");
      await tour.getByRole("button", { name: "Şimdi 1. dersi aç" }).click();

      // 3. Ders: ürünün ders ekranı, mühendislik dersi; formül KaTeX ile, alt simgeler düşmeden.
      const app = tour.locator(".tp-app");
      await expect(app.locator(".als")).toBeVisible({ timeout: 30_000 });
      await expect(app).toContainText("Kaldırma kuvveti: hangi yoğunluk, hangi hacim?");
      await check("ders");
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /Yanlış/ }).click();
      await expect(app.locator(".katex").first()).toBeVisible();
      const formula = await app.locator(".katex-html").evaluateAll((nodes) => nodes.map((node) => node.textContent ?? "").join(" "));
      for (const part of ["batan", "sıvı"]) expect(formula, part).toContain(part);
      await expect(app).toContainText("−5 puan");
      await check("ders: kural");
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /kaldırma kuvveti uygular/ }).first().click();
      await check("ders: soru", 0.5);
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /Dersi bitir/ }).click();

      // 4. Konu testi: beş şık; iki şık ipucu sunucuya gitmeden gelir ve cevabı söylemez.
      await expect(tour.locator('.tp-frame[data-screen="question"][data-track="muhendislik"]')).toBeVisible();
      await expect(app.locator('[role="radiogroup"] > button')).toHaveCount(5);
      await expect(app).toContainText("kg/m³");
      await app.getByRole("button", { name: /İki Şık Arasında Kaldım/ }).click();
      await app.locator(".cp-two-option").nth(1).click();
      await app.locator(".cp-two-option").nth(4).click();
      await expect(app.locator(".cp-two-hint")).toBeVisible();
      expect(await app.locator(".cp-two-hint").innerText()).not.toMatch(/[0-9]/);
      await check("soru");
      await app.getByRole("button", { name: /^B\s*40 N$/ }).click();
      await app.getByRole("button", { name: /Kontrol et/ }).click();
      await check("soru: açıklama", 0.5);
      await tour.getByRole("button", { name: "Akıllı kartlara geç" }).click();

      // 5. Kartlar.
      await app.locator("button.cp-exam-flash").click();
      await check("kart");
      await app.getByRole("button", { name: /Bildim/ }).click();
      await app.locator("button.cp-exam-flash").click();
      await app.getByRole("button", { name: /Bildim/ }).click();

      // 6. Doğru / Yanlış: mühendisliğin önermeleri; sonuç gerçek cevaplardan.
      await expect(tour.locator('.tp-frame[data-screen="check"][data-track="muhendislik"]')).toBeVisible();
      await app.getByRole("button", { name: /^Doğru/ }).click();
      await check("doğru/yanlış");
      await app.getByRole("button", { name: "Sonraki önerme" }).click();
      await app.getByRole("button", { name: /^Yanlış/ }).click();
      await app.getByRole("button", { name: "Sonucu gör" }).click();
      await expect(tour.getByText("3 sorudan 3 doğru")).toBeVisible();
      await tour.getByRole("button", { name: /Plus önizlemelerini gör/ }).click();

      // 7. Plus: kuvvet diyagramı sahnesi ve kâğıt; podcast sekmesi yalnız branşın kesiti varsa.
      const tabs = tour.getByRole("tab");
      const names = await tabs.allInnerTexts();
      expect(names.some((name) => /Çizimli video/.test(name))).toBe(true);
      expect(names.some((name) => /Sınav sabahı kâğıdı/.test(name))).toBe(true);
      expect(names.length).toBeGreaterThanOrEqual(2);
      if (names.some((name) => /Podcast/.test(name))) {
        await expect(tour.locator('[data-preview="podcast"]')).toBeVisible({ timeout: 30_000 });
        await check("plus: podcast");
      }
      await tabs.filter({ hasText: "Çizimli video" }).click();
      await expect(tour.locator('[data-preview="video"][data-video="reel"] svg[data-archetype="ENGINEERING_PHYSICS_MECHANICS"]')).toBeVisible({ timeout: 30_000 });
      await expect(tour.locator('[data-preview="video"] .cp-video-caption')).toBeVisible();
      await check("plus: video");
      // Büyüt (Faz 7): sahne sığdırma katmanının dışında ekrana sığan en büyük boyutta; en küçük yazı ≥12 px, taşma yok.
      await tour.getByRole("button", { name: "Büyüt" }).click();
      const enlarged = page.locator(".tpp-enlarge[role=dialog]");
      await expect(enlarged.locator('svg[data-archetype="ENGINEERING_PHYSICS_MECHANICS"]')).toBeVisible();
      const smallestFont = await enlarged.locator("svg[data-archetype]").evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        const unit = box.width / (svg as SVGSVGElement).viewBox.baseVal.width;
        return Math.min(...[...svg.querySelectorAll("text")].map((text) => parseFloat(getComputedStyle(text).fontSize) * unit));
      });
      expect(smallestFont).toBeGreaterThanOrEqual(12);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(enlarged).toHaveCount(0);
      await expect(tour).toBeVisible();
      await tabs.filter({ hasText: "Sınav sabahı kâğıdı" }).click();
      const sheet = tour.locator('[data-preview="sheet"] .cp-cram-preview');
      await expect(sheet.locator(".cp-cram-item").first()).toBeVisible();
      await expect(sheet).toContainText("Akışkanlar Mekaniği: Kaldırma Kuvveti");
      await check("plus: kâğıt");
      await expect(tour.getByRole("link", { name: /Şimdi kendi notunla başla/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      expect(apiCalls).toEqual([]);
    });
  }

  test("seçiciden TUS: TUS profili (kayıt bağlantısı ve adres), tur TUS notuyla baştan kurulur; Na⁺ ve K⁺ ekranda", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/api\//.test(new URL(request.url()).pathname) && !/\/api\/(health|consent|csp-report)/.test(request.url())) apiCalls.push(request.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(async () => {
      await page.getByRole("radio", { name: "TUS / Tıp · Farmakoloji" }).click();
      await expect(page.getByRole("radio", { name: "TUS / Tıp · Farmakoloji" })).toHaveAttribute("aria-checked", "true", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    // Faz 9: TUS kendi profili (önce akademik sekmenin içindeydi).
    expect(page.url()).toContain("hedef=tus");
    await expect(page.getByRole("link", { name: /TUS kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=tus");
    await expect(page.locator(".lj-drop-badge")).toContainText("Kardiyoloji_Antiaritmikler_TUS_Notu.pdf");
    // Seçili seçenek yüksek kontrastlı (seçili olmayan sönük şerit kalktı); renk geçişi bitince ölçülür.
    await expect.poll(async () => (await stripLayout(page)).onContrast).toBeGreaterThanOrEqual(4.5);
    // Konu testine raydan gidilir: TUS sorusu, K⁺ karakteri düşmeden.
    await page.getByRole("button", { name: /^Adım 4: / }).click();
    const app = page.locator(".lj-studio .tp-app");
    await expect(app.locator('[role="radiogroup"] > button')).toHaveCount(5, { timeout: 30_000 });
    await expect(app).toContainText("K⁺ kanallarını bloke ederek QT aralığını uzatır");
    await expect(page.locator(".lj-studio [data-warning]")).toContainText("TUS spotu");
    // Ders ekranındaki sınıflandırma: Na⁺, K⁺, Ca²⁺, β₁ (önce dene cevaplanınca anlatım açılır).
    await page.getByRole("button", { name: /^Adım 3: / }).click();
    await expect(app.locator(".als")).toBeVisible({ timeout: 30_000 });
    await app.getByRole("button", { name: /^Devam et/ }).click();
    await app.getByRole("button", { name: /Yanlış/ }).click();
    const rule = app.locator("mark.als-exam").filter({ hasText: "Sınıf I Na⁺" });
    await expect(rule).toBeVisible();
    for (const glyph of ["Na⁺", "K⁺", "Ca²⁺", "β₁"]) await expect(rule).toContainText(glyph);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // Plus adımında TUS'un mekanizma sahnesi.
    await page.getByRole("button", { name: /^Adım 7: / }).click();
    await page.getByRole("tab", { name: /Çizimli video/ }).click();
    await expect(page.locator('.lj-studio svg[data-archetype="MEDICAL_BIOLOGY_PATHWAY"]')).toBeVisible({ timeout: 30_000 });
    expect(apiCalls).toEqual([]);
  });

  test("hukuk 1440px: karar ağacı ve çoğunluk barometresi sahnesi; kâğıtta 301", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?hedef=akademik");
    await expect(page.getByRole("radio", { name: "KPSS / Hukuk · Anayasa" })).toHaveAttribute("aria-checked", "true");
    await expect(async () => {
      await page.getByRole("button", { name: /^Adım 7: / }).click();
      await expect(page.locator(".lj-studio .lj-stage")).toHaveAttribute("data-step", "plus", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Çizimli video/ }).click();
    const scene = page.locator('.lj-studio svg[data-archetype="LAW_SOCIAL_FLOWCHART"]');
    await expect(scene).toBeVisible({ timeout: 30_000 });
    await expect(scene).toContainText("ÇOĞUNLUK BAROMETRESİ");
    await page.getByRole("tab", { name: /Sınav sabahı kâğıdı/ }).click();
    await expect(page.locator('.lj-studio [data-preview="sheet"]')).toContainText("301");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  // Yedek yazı tipi stres testi: Figtree yüklenmezse (ya da daha geniş bir yazı tipiyle) seçicinin seçenekleri üst üste
  // binmez, yazı kesilmez, seçici ekrandan taşmaz; her genişlikte her seçenek seçildiğinde seçili olan okunur kalır.
  for (const width of [390, 820, 1440]) {
    test(`seçici Verdana ile ${width}px: binme, kesilme, taşma yok; her seçenek seçiliyken kontrast 4,5:1`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?hedef=lise");
      await page.addStyleTag({ content: "* { font-family: Verdana, sans-serif !important; }" });
      await expect(page.locator("[data-hero-pick] .lp-pick-opt")).toHaveCount(4);
      const strip = await stripLayout(page);
      expect(strip).toMatchObject({ count: 4, checked: 1, overlaps: 0, clipped: 0, outside: 0 });
      expect(strip.minHeight).toBeGreaterThanOrEqual(44);
      expect(strip.stripRight).toBeLessThanOrEqual(strip.viewport + 0.5);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      // Branş değişince de aynı; seçili seçenek her durumda okunur (ürün sahibi "Üniversite" seçiliyken zayıf gördü).
      for (const name of ["Üniversite · Mühendislik", "TUS / Tıp · Farmakoloji", "KPSS / Hukuk · Anayasa", "Lise & YKS · Matematik"]) {
        await expect(async () => {
          await page.getByRole("radio", { name }).click();
          await expect(page.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true", { timeout: 1500 });
        }).toPass({ timeout: 20_000 });
        // Renk geçişi (160 ms) bitince ölçülür.
        await expect.poll(async () => (await stripLayout(page)).onContrast, { message: name }).toBeGreaterThanOrEqual(4.5);
        expect(await stripLayout(page), name).toMatchObject({ checked: 1, overlaps: 0, clipped: 0, outside: 0 });
        expect(await overflow(page)).toBeLessThanOrEqual(1);
      }
    });
  }
});
