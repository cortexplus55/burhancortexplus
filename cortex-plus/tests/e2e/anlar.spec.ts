import { expect, test, type Page } from "@playwright/test";

/*
  Anlar (his katmanı), 13 Kasım 2026, ürün sahibinin kararı. Misafir ana sayfasının turu (A1–A4) ve uygulamanın içi
  (B1–B2). Her an en çok 2,5 sn, tıklama ya da tuş atlar, hareket azaltmada oynamaz (depo kararı 11).
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
] as const;

const STEP_IDS = ["upload", "roadmap", "lesson", "question", "cards", "check", "plus"] as const;

/**
 * Raydan adıma geç; geliştirme sunucusunda ilk tıklama sayfa canlanmadan düşebilir: adım açılana kadar yeniden dene.
 * 1. durak ana sayfadaki iki kapıya döner (stüdyo kapanır); öbür duraklar tam ekran stüdyoyu o adımda açar.
 */
async function goStep(page: Page, at: number) {
  await expect(async () => {
    await page.getByRole("button", { name: new RegExp(`^Adım ${at}: `) }).click();
    if (at === 1) await expect(page.locator(".lj-studio")).toHaveCount(0, { timeout: 1500 });
    else await expect(page.locator(".lj-studio .lj-stage")).toHaveAttribute("data-step", STEP_IDS[at - 1]!, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/** Stüdyonun kaydırmasız olduğu ölçü: stüdyo, sahne ve sayfa kaymaz; sığdırılan içerik sahnenin içinde kalır. */
async function zeroScroll(page: Page) {
  return page.evaluate(() => {
    const studio = document.querySelector(".lj-studio")!;
    const fit = document.querySelector(".lj-studio .lj-fit")!;
    const inner = document.querySelector(".lj-studio .lj-fit-inner")!;
    const foot = document.querySelector(".lj-studio .lj-stage-foot")?.getBoundingClientRect() ?? null;
    const box = fit.getBoundingClientRect();
    const content = inner.getBoundingClientRect();
    return {
      studioScrolls: studio.scrollHeight > studio.clientHeight + 1,
      fitScrollTop: fit.scrollTop,
      contentFits: content.bottom <= box.bottom + 1,
      footInView: foot ? foot.top >= 0 && foot.bottom <= innerHeight + 1 : true,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scale: Number(getComputedStyle(inner).getPropertyValue("--lj-fit") || 1),
    };
  });
}

for (const size of SIZES) {
  test(`A1 ${size.width} px: ana sayfada iç kaydırma yok; örnek notla tam ekran stüdyo açılır, yedi adımda hiç kaydırma yok, 4. adımda beş şık ekranda`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    // Ana sayfa: birinci adımın kapısı içeriği kadar, iç kaydırmalı kutu yok.
    const door = await page.evaluate(() => {
      const el = document.querySelector(".lj-door")!;
      const scrollers = [...document.querySelectorAll("section.lj *")].filter((node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY));
      return { scrolls: el.scrollHeight > el.clientHeight + 1, scrollers: scrollers.length };
    });
    expect(door).toEqual({ scrolls: false, scrollers: 0 });
    await expect(page.locator(".lj-studio")).toHaveCount(0);

    for (let at = 2; at <= 7; at += 1) {
      await goStep(page, at);
      if (at >= 3 && at <= 6) await expect(page.locator(".lj-studio .tp-app")).toBeVisible({ timeout: 30_000 });
      if (at === 7) await expect(page.locator('.lj-studio [data-plus-preview]')).toHaveCount(1);
      await expect.poll(async () => (await zeroScroll(page)).contentFits, { timeout: 5000 }).toBe(true);
      const m = await zeroScroll(page);
      expect(m.studioScrolls, `adım ${at}: stüdyo kaymaz`).toBe(false);
      expect(m.fitScrollTop, `adım ${at}: sahne kaymaz`).toBe(0);
      expect(m.footInView, `adım ${at}: alt düğme ekranda`).toBe(true);
      expect(m.pageOverflow).toBeLessThanOrEqual(1);
      expect(m.scale, `adım ${at}: ölçek`).toBeGreaterThanOrEqual(0.6);
      if (at === 4) {
        // Beş şık birden, kaydırmadan ekranda.
        const options = page.locator('.lj-studio .tp-app [role="radiogroup"] > button');
        await expect(options).toHaveCount(5);
        for (let i = 0; i < 5; i += 1) await expect(options.nth(i)).toBeInViewport({ ratio: 0.99 });
        // Cevaptan sonra da: açıklama şıkları ekran dışına itmez.
        await options.nth(2).click();
        await page.locator(".lj-studio .tp-app").getByRole("button", { name: /Kontrol et/ }).click();
        await expect.poll(async () => (await zeroScroll(page)).contentFits).toBe(true);
        for (let i = 0; i < 5; i += 1) await expect(options.nth(i)).toBeInViewport({ ratio: 0.99 });
      }
    }
    // ✕ ana sayfaya döner; sayfanın kilidi açılır.
    await page.getByRole("button", { name: "Kapat" }).click();
    await expect(page.locator(".lj-studio")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test(`A2 ${size.width} px: tarama anında dört bulgu sırayla belirir, sonra yol açılır; dokunuş anı atlar`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.locator("button.lj-zone").evaluate((zone) => zone.scrollIntoView({ block: "center" }));
    await page.locator("button.lj-zone").click();
    const finds = page.locator("[data-scan-findings] [data-finding]");
    await expect(finds).toHaveCount(4);
    await expect(finds.nth(0)).toHaveText("6 sayfa");
    await expect(finds.nth(2)).toContainText("Hoca uyarısı");
    // Son bulgu anın sonunda görünür (opaklık 1), yol kendiliğinden açılır.
    await expect.poll(() => finds.nth(3).evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0.95);
    await expect(page.getByRole("heading", { name: "Yol haritan çıktı" })).toBeVisible({ timeout: 4000 });

    // İkinci tur: dokunuş anı atlar, yol 2,4 sn beklemeden açılır.
    await goStep(page, 1);
    await page.locator("button.lj-zone").evaluate((zone) => zone.scrollIntoView({ block: "center" }));
    await page.locator("button.lj-zone").click();
    await expect(finds).toHaveCount(4);
    const t0 = Date.now();
    await page.locator(".lj-studio .lj-stage-head").click();
    await expect(page.getByRole("heading", { name: "Yol haritan çıktı" })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
}

/** Sahnede görünen ana düğmeler: turun kâğıt beyazı düğmeleri ve ürün ekranının kendi ana düğmeleri. */
async function primaries(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = [
      ".lj-cta",
      ".lj-next.is-primary",
      ".tp-app .cp-exam-continue--primary",
      ".tp-app .als-cta",
      ".tp-app .tf-focus-next",
    ].join(", ");
    return [...document.querySelectorAll<HTMLElement>(`.lj-stage ${selector.replaceAll(", ", ", .lj-stage ")}`)]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return node.offsetParent !== null && box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
      })
      .map((node) => (node.textContent ?? "").trim());
  });
}

for (const size of SIZES) {
  test(`A3 ${size.width} px: 3-6. adımlarda aynı anda tek ana düğme; iş bitince tur düğmesi 600 ms'de ana düğme olur`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const tour = page.locator(".lj-studio");
    const next = page.locator(".lj-studio .lj-stage-foot .lj-next");

    // Ders: ürünün "Devam et"i tek ana düğme; tur düğmesi soluk ama tıklanabilir.
    await goStep(page, 3);
    await expect(tour.locator(".tp-app .als")).toBeVisible({ timeout: 30_000 });
    await expect(next).not.toHaveClass(/is-primary/);
    await expect(next).toBeEnabled();
    expect(await primaries(page)).toHaveLength(1);

    // Konu testi: önce ürünün "Kontrol et"i; kontrol edilince ürün çubuğu çekilir, tur düğmesi ana düğme olur.
    await goStep(page, 4);
    const app = tour.locator(".tp-app");
    await expect(app.getByRole("button", { name: /Kontrol et/ })).toBeVisible({ timeout: 30_000 });
    expect(await primaries(page)).toEqual([expect.stringMatching(/Kontrol et/)]);
    await app.getByRole("button", { name: /^C\s*2$/ }).click();
    await app.getByRole("button", { name: /Kontrol et/ }).click();
    await expect(next).toHaveClass(/is-primary/);
    // Dolgu 600 ms'de belirir: hemen sonra yarı yolda, sonunda tam.
    const fill = () => next.evaluate((node) => Number(getComputedStyle(node, "::before").opacity));
    expect(await fill()).toBeLessThan(1);
    await expect.poll(fill, { timeout: 2000 }).toBe(1);
    await expect(app.getByRole("button", { name: /Testi bitir/ })).toBeHidden();
    expect(await primaries(page)).toEqual([expect.stringMatching(/Akıllı kartlara geç/)]);

    // Kartlar: adım yeni: tur düğmesi yeniden soluk.
    await next.click();
    await expect(tour.locator('.tp-frame[data-screen="cards"]')).toBeVisible();
    await expect(next).not.toHaveClass(/is-primary/);
    expect((await primaries(page)).length).toBeLessThanOrEqual(1);

    // Doğru / Yanlış: cevaptan sonra ürünün "Sonraki önerme"si tek ana düğme; sonuçta turun kâğıt düğmesi.
    await goStep(page, 6);
    await app.getByRole("button", { name: /^Doğru/ }).click();
    expect(await primaries(page)).toEqual([expect.stringMatching(/Sonraki önerme/)]);
    await app.getByRole("button", { name: "Sonraki önerme" }).click();
    await app.getByRole("button", { name: /^Yanlış/ }).click();
    await app.getByRole("button", { name: "Sonucu gör" }).click();
    expect(await primaries(page)).toEqual([expect.stringMatching(/Plus önizlemelerini gör/)]);
  });
}

for (const size of SIZES) {
  test(`A4 ${size.width} px: taramadan sonra başlığın yanında "Hoca uyarısı"; uyarı adımına girince bir kez parlar`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const badge = page.locator(".lj-studio [data-warning]");
    await expect(badge).toHaveCount(0);
    await page.locator("button.lj-zone").evaluate((zone) => zone.scrollIntoView({ block: "center" }));
    await page.locator("button.lj-zone").click();
    await expect(page.getByRole("heading", { name: "Yol haritan çıktı" })).toBeVisible({ timeout: 4000 });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Hoca uyarısı");
    await expect(badge).not.toHaveClass(/is-glow/);
    // Etiket başlığın satırında ya da hemen altında; sahneden taşmaz.
    const fits = await page.evaluate(() => {
      const head = document.querySelector(".lj-studio-top")!.getBoundingClientRect();
      const tag = document.querySelector(".lj-studio [data-warning]")!.getBoundingClientRect();
      return tag.left >= head.left - 1 && tag.right <= head.right + 1;
    });
    expect(fits).toBe(true);

    await goStep(page, 3);
    await expect(badge).toHaveClass(/is-glow/);
    // Parlama 600 ms: sonra durağan.
    await expect(badge).not.toHaveClass(/is-glow/, { timeout: 2000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // Plus adımı uyarıdan çıkmaz: parlamaz.
    await goStep(page, 7);
    await expect(badge).toBeVisible();
    await expect(badge).not.toHaveClass(/is-glow/);
  });
}

test("A4: hareket azaltmada etiket parlamaz", { tag: ["@public"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await goStep(page, 4);
  const badge = page.locator(".lj-studio [data-warning]");
  await expect(badge).toBeVisible();
  await expect(badge).not.toHaveClass(/is-glow/);
});

test("A3: hareket azaltmada tur düğmesi geçişsiz ana düğme olur", { tag: ["@public"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await goStep(page, 4);
  const app = page.locator(".tp-app");
  await expect(app.getByRole("button", { name: /Kontrol et/ })).toBeVisible({ timeout: 30_000 });
  await app.getByRole("button", { name: /^C\s*2$/ }).click();
  await app.getByRole("button", { name: /Kontrol et/ }).click();
  const next = page.locator(".lj-stage-foot .lj-next");
  await expect(next).toHaveClass(/is-primary/);
  expect(await next.evaluate((node) => Number(getComputedStyle(node, "::before").opacity))).toBe(1);
});

test("A2: hareket azaltmada tarama anı oynamaz, yol hemen açılır", { tag: ["@public"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("button.lj-zone").evaluate((zone) => zone.scrollIntoView({ block: "center" }));
  await page.locator("button.lj-zone").click();
  await expect(page.getByRole("heading", { name: "Yol haritan çıktı" })).toBeVisible({ timeout: 800 });
});

/* ---------------- B: uygulamanın içi ---------------- */

type NextWindow = { next: { router: { push: (href: string) => void } } };

/** Ana ekrana uygulamanın içinden dönüş: başka bir sayfaya git, tarayıcının geri tuşuyla dön (yeniden yükleme yok). */
async function returnHome(page: Page) {
  // Geliştirme sunucusu ara sayfayı ilk kez derlerken bekletebilir.
  test.setTimeout(120_000);
  await page.evaluate(() => (window as unknown as NextWindow).next.router.push("/e2e/ic-ekran?ekran=radar"));
  await page.waitForURL(/ic-ekran/, { timeout: 60_000 });
  await page.goBack();
}

for (const size of SIZES) {
  test(`B1 ${size.width} px: ana ekrana dönüşte tamamlama yüzdesi değiştiyse halka eskiden yeniye 600 ms'de dolar`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* karşılama penceresi bu testin konusu değil */
      }
    });
    await page.goto("/e2e/ana-ekran?hazirlik=1");
    const pct = page.locator(".cx-ring-pct");
    // İlk ziyaret: an yok, değer sekme oturumuna yazılır.
    await expect(pct).toHaveText("%27");
    await expect(pct).not.toHaveAttribute("data-counting", "");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("cx:ring:biyoloji"))).toContain('"pct":27');

    // Önce %10 ve tek konu bitmişti: dönüşte halka %10'dan başlar, sayar, biten konunun yayı çizilir.
    await page.evaluate(() => sessionStorage.setItem("cx:ring:biyoloji", JSON.stringify({ pct: 10, done: ["t0"] })));
    await returnHome(page);
    await expect(pct).toHaveAttribute("data-counting", "");
    await expect(page.locator(".cx-ring-draw")).toHaveCount(1);
    await expect(pct).toHaveText("%27", { timeout: 2000 });
    await expect(pct).not.toHaveAttribute("data-counting", "");
    await expect(page.locator(".cx-ring-draw")).toHaveCount(0);

    // Değişiklik yok: ikinci dönüşte an yok.
    await returnHome(page);
    await expect(pct).toHaveText("%27");
    await expect(pct).not.toHaveAttribute("data-counting", "");
  });
}

test("B1: hareket azaltmada halka hemen son değerde", { tag: ["@public"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* karşılama penceresi bu testin konusu değil */
    }
  });
  await page.goto("/e2e/ana-ekran?hazirlik=1");
  await expect(page.locator(".cx-ring-pct")).toHaveText("%27");
  // Sayfa canlandı (halka değeri oturuma yazdı): uygulama içi gezinme hazır.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("cx:ring:biyoloji"))).toContain('"pct":27');
  await page.evaluate(() => sessionStorage.setItem("cx:ring:biyoloji", JSON.stringify({ pct: 10, done: ["t0"] })));
  await returnHome(page);
  await expect(page.locator(".cx-ring-pct")).toHaveText("%27");
  await expect(page.locator(".cx-ring-draw")).toHaveCount(0);
});

for (const size of SIZES) {
  test(`B2 ${size.width} px: yola dönüşte az önce biten adım kapanır, çizgi sıradakine dolar, sıradakinin halkası belirir`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/e2e/ic-ekran?ekran=yol-konu");
    // İlk ziyaret: an yok; biten adımlar oturuma yazılır.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("cx:path:fixture-prep"))).toBe('{"done":["n0"]}');
    await expect(page.locator("[data-closing]")).toHaveCount(0);

    // Önce hiçbir adım bitmemişti: dönüşte n0 kapanır, n1'in halkası belirir; 600 ms sonra durağan.
    await page.evaluate(() => sessionStorage.setItem("cx:path:fixture-prep", JSON.stringify({ done: [] })));
    await page.evaluate(() => (window as unknown as NextWindow).next.router.push("/e2e/ic-ekran?ekran=radar"));
    test.setTimeout(120_000);
    await page.waitForURL(/radar/, { timeout: 60_000 });
    await page.goBack();
    const closing = page.locator('[data-closing] .cx-node[data-state="done"]');
    await expect(closing).toHaveCount(1);
    await expect(page.locator("[data-closing] .cx-path-fill")).toHaveCount(1);
    await expect(page.locator('[data-opening] .cx-node[data-state="current"]')).toHaveCount(1);
    expect(await page.locator('[data-opening] .cx-node').evaluate((node) => getComputedStyle(node).animationName)).toBe("cx-node-open");
    await expect(page.locator("[data-closing], [data-opening], .cx-path-fill")).toHaveCount(0, { timeout: 2000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
