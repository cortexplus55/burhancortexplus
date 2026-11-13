import { expect, test, type Page } from "@playwright/test";

/*
  Anlar (his katmanı), 13 Kasım 2026, ürün sahibinin kararı. Misafir ana sayfasının turu (A1–A4) ve uygulamanın içi
  (B1–B2). Her an en çok 2,5 sn, tıklama ya da tuş atlar, hareket azaltmada oynamaz (depo kararı 11).
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
] as const;

async function goStep(page: Page, at: number) {
  await page.getByRole("button", { name: new RegExp(`^Adım ${at}: `) }).click();
}

for (const size of SIZES) {
  test(`A1 ${size.width} px: sahne yedi adımda aynı yükseklikte, alt düğme ekranda, uzun adımda yalnız gövde kayar`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const stage = page.locator(".lj-stage");
    await expect(stage).toBeVisible();
    const heights: number[] = [];
    for (let at = 1; at <= 7; at += 1) {
      await goStep(page, at);
      if (at >= 3 && at <= 6) await expect(page.locator(".tp-app")).toBeVisible({ timeout: 30_000 });
      await expect(stage).toHaveAttribute("data-step", /.+/);
      // Adım değişince ilerleme rayı sabit menünün hemen altına hizalanır (1. adım ilk çizim, kaydırılmaz); yumuşak
      // kaydırma bitene kadar beklenir.
      if (at > 1) {
        await expect
          .poll(() =>
            page.evaluate(
              () => document.querySelector(".lj-rail")!.getBoundingClientRect().top - document.querySelector("header.mkh")!.getBoundingClientRect().bottom,
            ),
          )
          .toBeLessThanOrEqual(12);
      }
      const m = await page.evaluate(() => {
        const box = document.querySelector(".lj-stage")!.getBoundingClientRect();
        const foot = document.querySelector(".lj-stage-foot")?.getBoundingClientRect() ?? null;
        const header = document.querySelector("header.mkh")!.getBoundingClientRect().bottom;
        const rail = document.querySelector(".lj-rail")!.getBoundingClientRect().top;
        return {
          height: Math.round(box.height),
          footInView: foot ? foot.top >= 0 && foot.bottom <= innerHeight : true,
          railGap: rail - header,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      heights.push(m.height);
      expect(m.footInView, `adım ${at}: alt düğme ekranda`).toBe(true);
      expect(m.pageOverflow).toBeLessThanOrEqual(1);
      if (at > 1) expect(m.railGap).toBeGreaterThanOrEqual(-1);
    }
    expect(new Set(heights).size, `yükseklikler: ${heights.join(", ")}`).toBe(1);
    // Plus adımı her genişlikte sahneden uzun: sayfa değil gövde kayar.
    const scroll = await page.evaluate(() => {
      const body = document.querySelector(".lj-stage-body")!;
      return { scrollable: body.scrollHeight > body.clientHeight + 4, overflowY: getComputedStyle(body).overflowY };
    });
    expect(scroll).toEqual({ scrollable: true, overflowY: "auto" });
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
    await page.locator(".lj-stage-head").click();
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
    const tour = page.locator("section.lj");
    const next = tour.locator(".lj-stage-foot .lj-next");

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
    const badge = page.locator(".lj-stage-head [data-warning]");
    await expect(badge).toHaveCount(0);
    await page.locator("button.lj-zone").evaluate((zone) => zone.scrollIntoView({ block: "center" }));
    await page.locator("button.lj-zone").click();
    await expect(page.getByRole("heading", { name: "Yol haritan çıktı" })).toBeVisible({ timeout: 4000 });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Hoca uyarısı");
    await expect(badge).not.toHaveClass(/is-glow/);
    // Etiket başlığın satırında ya da hemen altında; sahneden taşmaz.
    const fits = await page.evaluate(() => {
      const head = document.querySelector(".lj-stage-head")!.getBoundingClientRect();
      const tag = document.querySelector(".lj-stage-head [data-warning]")!.getBoundingClientRect();
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
  const badge = page.locator(".lj-stage-head [data-warning]");
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
