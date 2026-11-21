import { expect, test, type Page } from "@playwright/test";

/*
  Faz 11 · öğretmen sohbeti arayüzü (teacher.v2). 21 Kasım 2026'dan beri öğretmen v3 ekranında: anlatım seçici, tepki
  çipleri ve karşılama kartları yok (v3 karşılaması `ogretmen-v3.spec.ts`'te). Burada Faz 11'in v3'te süren parçaları:
  canlı kara tahta (mini yoklama, formül, tablo, kod), karşılamanın "kaldığımız yerden" devamı ve fotoğrafla iki seçim.
  Fikstür veritabanısız: `/e2e/ana-ekran?ogretmen=v2` (`&durum=sohbet`, `&durum=yoklama`, `&durum=karsilama`). Uçlar sahte
  (`page.route`): model, kredi ve canlı API yok. 360, 390 ve 1280 px'te yatay taşma 0; şık ve seçim düğmeleri en az 40 px
  (telefonda 44 px).
*/

const CONV = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const RESUME_CONV = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d";

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function heights(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
}

async function stubSideRequests(page: Page) {
  await page.route("**/api/teacher/conversations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ groups: [] }) }));
}

for (const width of [360, 390, 1280] as const) {
  const minTap = width <= 640 ? 44 : 40;

  test.describe(`öğretmen Faz 11 · ${width}px`, () => {
    test.use({ viewport: { width, height: 820 } });

    test("öğretmen v3: anlatım seçici ve tepki çipleri yok; mesaj adım adım anlatımla gider", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      const bodies: Record<string, unknown>[] = [];
      await page.route("**/api/ai/chat", async (route) => {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 200,
          contentType: "text/plain; charset=utf-8",
          headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c08", "X-Conversation-Id": CONV },
          body: "Önce sabiti karşıya geçirelim.",
        });
      });
      await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
      await expect(page.locator(".cx-v3-thread")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("radiogroup", { name: "Anlatım modu" })).toHaveCount(0);
      await expect(page.locator(".cx-v2-chips")).toHaveCount(0);
      await expect(page.getByText("Sıra sende")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Yanlışlar Defterime ekle/ })).toHaveCount(0);
      await expect(page.locator('[role="group"][aria-label="Devam önerileri"]')).toHaveCount(0);

      await page.getByPlaceholder("Sor, konuş veya dosya gönder").fill("Bir sonraki adımı göster");
      await page.getByRole("button", { name: "Gönder" }).click();
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0]).toMatchObject({ message: "Bir sonraki adımı göster", tutorStyle: "tutor_steps" });
      expect(bodies[0]).not.toHaveProperty("welcomeAnswer");
      await expect(page.getByText("Önce sabiti karşıya geçirelim.")).toBeVisible();
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/ogretmen-faz11-v3-sohbet-${width}.png` });
    });

    test("canlı kara tahta: şıklar tıklanır ve kilitlenir; formül, tablo ve kod kendi kutusunda kayar", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      const sent: string[] = [];
      await page.route("**/api/ai/chat", async (route) => {
        const body = route.request().postDataJSON() as { message: string };
        sent.push(body.message);
        await route.fulfill({
          status: 200,
          contentType: "text/plain; charset=utf-8",
          headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c09", "X-Conversation-Id": CONV },
          body: "Evet, 10. 6² + 8² = 100 ve karekökü 10.",
        });
      });
      await page.goto("/e2e/ana-ekran?durum=yoklama&ogretmen=v2");
      const card = page.getByRole("region", { name: "Mini yoklama" });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const options = card.getByRole("button");
      await expect(options).toHaveCount(3);
      for (const height of await heights(page, ".cx-v2-option")) expect(height).toBeGreaterThanOrEqual(44);
      await expect(page.locator(".cx-v3 .cp-md-formula")).toBeVisible();
      await expect(page.locator('.cx-v3 .cp-callout[data-callout="mistake"]')).toBeVisible();

      const boxes = await page.evaluate(() =>
        [".cx-v3 .cp-md-formula", ".cx-v3 .cp-md-table-wrap", ".cx-v3 pre"].map((selector) => {
          const node = document.querySelector(selector)!;
          const rect = node.getBoundingClientRect();
          return { selector, right: rect.right, left: rect.left, scrolls: node.scrollWidth > node.clientWidth, overflowX: getComputedStyle(node).overflowX };
        }),
      );
      for (const box of boxes) {
        expect(box.left, box.selector).toBeGreaterThanOrEqual(0);
        expect(box.right, box.selector).toBeLessThanOrEqual(width);
        if (box.scrolls) expect(["auto", "scroll"], box.selector).toContain(box.overflowX);
      }
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/ogretmen-faz11-yoklama-${width}.png` });

      await options.first().click();
      await expect.poll(() => sent).toEqual(["Cevabım: A) 10"]);
      const locked = page.getByRole("region", { name: "Mini yoklama" }).getByRole("button");
      await expect(locked.first()).toHaveAttribute("aria-pressed", "true");
      for (const index of [0, 1, 2]) await expect(locked.nth(index)).toBeDisabled();
      await expect(page.getByText("Evet, 10.")).toBeVisible();
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    });

    test("karşılama: kaldığımız yerden devam satırı ve hapı; aynı konuşmada sürer", { tag: ["@public"] }, async ({ page }) => {
      await stubSideRequests(page);
      let cardRequests = 0;
      await page.route("**/api/teacher/start-cards", async (route) => {
        cardRequests += 1;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            empty: false,
            cards: [],
            resume: {
              line: "Dün «Örnek konu» konusunda kalmıştık, oradan devam edelim mi?",
              prompt: "Dün kaldığımız yerden devam edelim.",
              conversationId: RESUME_CONV,
            },
          }),
        });
      });
      const bodies: Record<string, unknown>[] = [];
      await page.route("**/api/ai/chat", async (route) => {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", headers: { "X-Message-Id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c34" }, body: "Tamam, son adımdan devam ediyoruz." });
      });
      await page.goto("/e2e/ana-ekran?ogretmen=v2&durum=karsilama");
      const welcome = page.getByRole("region", { name: "Karşılama" });
      await expect(welcome.getByText(/«Örnek konu» konusunda kalmıştık/).first()).toBeVisible({ timeout: 30_000 });
      const group = welcome.getByRole("group", { name: "Başlangıç önerileri" });
      await expect(group.getByRole("button")).toHaveCount(4);
      await expect(group.getByRole("button").first()).toHaveText(/Kaldığımız yerden devam edelim/);
      for (const height of await heights(page, ".cx-v3-welcome .cx-v3-hap")) expect(height).toBeGreaterThanOrEqual(minTap);
      expect(cardRequests).toBe(1);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/ogretmen-faz11-devam-${width}.png` });

      await group.getByRole("button", { name: /Kaldığımız yerden devam edelim/ }).click();
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0]).toMatchObject({ message: "Dün kaldığımız yerden devam edelim.", conversationId: RESUME_CONV });
      expect(bodies[0]).not.toHaveProperty("welcomeAnswer");
      await expect(page.getByText("Tamam, son adımdan devam ediyoruz.")).toBeVisible();
    });
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

for (const theme of ["dark", "light"] as const) {
  test(`yoklama ${theme === "dark" ? "koyu" : "açık"} temada okunur (≥ 4,5:1) · 390px`, { tag: ["@public"] }, async ({ page }) => {
    await page.addInitScript((value) => {
      try {
        window.localStorage.setItem("theme", value);
      } catch {
        /* yok */
      }
    }, theme);
    await stubSideRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e2e/ana-ekran?durum=yoklama&ogretmen=v2");
    await expect(page.locator("html")).toHaveClass(new RegExp(theme === "dark" ? "\\bdark\\b" : "\\blight\\b"));
    await expect(page.getByRole("region", { name: "Mini yoklama" })).toBeVisible({ timeout: 30_000 });
    const selectors = [".cx-v2-check-kicker", ".cx-v2-check-q", ".cx-v2-option", ".cx-v2-option-letter", ".cx-v3 .cp-callout-label"];
    const contrast = await readContrast(page, selectors);
    expect(Object.keys(contrast)).toHaveLength(selectors.length);
    for (const [selector, ratio] of Object.entries(contrast)) expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/ogretmen-faz11-tema-${theme}.png` });
  });
}

/* 1×1 PNG: tarayıcı çözer, küçültücü olduğu gibi bırakır. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const CHECK_SOLUTION = {
  readable: true,
  subject: "Örnek",
  question: "3x + 4 = 19 ise x kaçtır?",
  options: [
    { letter: "A", text: "3" },
    { letter: "B", text: "5" },
    { letter: "C", text: "7" },
  ],
  kind: "mcq",
  intro: "Bilinmeyeni yalnız bırakıyoruz.",
  given: ["3x + 4 = 19"],
  asked: "x",
  steps: [
    { title: "Sabiti karşıya geçir", math: "3x = 19 - 4 = 15", say: "4 karşıya eksi olarak geçer." },
    { title: "Katsayıya böl", math: "x = 15 / 3 = 5", say: "İki tarafı 3'e böldük." },
  ],
  answer: { letter: "B", value: "5", text: "x = 5" },
  optionsWhy: [],
  trap: "Sabit karşıya geçerken işareti değişir.",
  tip: "Önce sabiti, sonra katsayıyı at.",
  check: "Kontrol: 3·5 + 4 = 19",
  studentCheck: {
    state: "error",
    lines: [
      { n: 1, text: "3x + 4 = 19", status: "ok" },
      { n: 2, text: "3x = 19 + 4", status: "error", kind: "isaret" },
      { n: 3, text: "3x = 23", status: "unknown" },
    ],
    firstError: { line: 2, kind: "isaret" },
    result: "mismatch",
    explanation: "İlk satırın doğru; ikinci satırda terimi karşıya geçirirken bir şey değişmedi.",
    question: "Bu terimi eşitliğin öbür yanına geçirirken işaretine ne olur?",
  },
};

for (const width of [390, 1280] as const) {
  test(`fotoğraf: iki seçim; 'Çözümümü kontrol et' intent=check gönderir, kontrol kartı sohbette · ${width}px`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await stubSideRequests(page);
    let intent: string | null = null;
    await page.route("**/api/ai/solve", async (route) => {
      const raw = route.request().postDataBuffer()?.toString("latin1") ?? "";
      intent = /name="intent"\r\n\r\n([a-z]+)\r\n/.exec(raw)?.[1] ?? "";
      const events = [
        { type: "stage", stage: "solving" },
        { type: "solution", solution: CHECK_SOLUTION, status: "checked", ms: 3200, agreed: true },
        { type: "done", ms: 3200 },
      ];
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((event) => JSON.stringify(event)).join("\n") + "\n" });
    });
    await page.goto("/e2e/ana-ekran?durum=sohbet&ogretmen=v2");
    await expect(page.locator(".cx-v3-thread")).toBeVisible({ timeout: 30_000 });
    // v3 kapsülünde "+" dosya seçiciyi doğrudan açar (yükleme paneli yok). Klavyeyle basılır: geliştirme sunucusunun
    // sol alttaki göstergesi telefonda düğmenin üstüne biniyor (üretim derlemesinde yok).
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Dosya ekle" }).focus();
    await page.keyboard.press("Enter");
    await (await chooser).setFiles({ name: "defter.png", mimeType: "image/png", buffer: PNG });
    const group = page.getByRole("group", { name: "Fotoğrafla ne yapalım?" });
    await expect(group.getByRole("button")).toHaveCount(2);
    for (const height of await heights(page, ".cx-v3-photo-intents .cx-v3-chip")) expect(height).toBeGreaterThanOrEqual(width <= 640 ? 44 : 40);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await group.getByRole("button", { name: "Çözümümü kontrol et" }).click();
    await expect(page.locator(".cp-solver-check")).toBeVisible({ timeout: 20_000 });
    expect(intent).toBe("check");
    await expect(page.getByText("📷 Çözümümü kontrol et")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
}
