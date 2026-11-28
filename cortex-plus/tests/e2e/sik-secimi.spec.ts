import { expect, test, type Page } from "@playwright/test";

/**
 * P0 (28 Kasım 2026): "B'yi işaretledim, A kırmızı oldu". Gerçek oturum ekranı (`ExamNodeSession`) gerçek sunucu
 * işlevleriyle kurulan mühürlü paketle, telefonda (390×844, dokunmatik). Doğru şık A, B, C, D ve E'deyken, düz ve
 * karışık sırada: dokunulan doğru şık yalnız o yeşil ve "Doğru"; dokunulan yanlış şık yalnız o kırmızı.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Fikstürün yayımladığı doğru şık metinleri (soru sırasıyla); ekran açılmadan önce bilinir. */
async function keyOf(page: Page, question: number): Promise<string> {
  const key = await page.evaluate(
    (at) => (window as unknown as { __fixtureKey?: string[] }).__fixtureKey?.[at] ?? null,
    question,
  );
  expect(key, "fikstür doğru şıkkı yayınlamalı").not.toBeNull();
  return key as string;
}

/** Sunucuya giden son "Kontrol et" cevabı. */
async function lastSent(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as unknown as { __answerChecks?: { answer?: unknown }[] }).__answerChecks?.at(-1)?.answer);
}

async function open(page: Page, query: string) {
  await page.goto(`/e2e/sik-secimi?${query}`);
  await expect(page.getByText(/Soru 1 \/ 5/)).toBeVisible({ timeout: 30_000 });
}

/** Şık düğmeleri (harf rozetli satırlar), ekrandaki sırayla. */
function options(page: Page) {
  return page.locator("[data-cx-option]");
}

async function states(page: Page) {
  return options(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-cx-option")));
}

async function answer(page: Page, optionIndex: number) {
  await options(page).nth(optionIndex).tap();
  const check = page.getByRole("button", { name: "Kontrol et" });
  await expect(check).toBeEnabled();
  await check.tap();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible();
}

for (const sira of ["duz", "karisik"] as const) {
  test(`doğru şıkka dokunulunca yalnız o yeşil ve "Doğru" (${sira} sıra, A–E)`, { tag: ["@public"] }, async ({ page }) => {
    await open(page, `sira=${sira}`);
    const seen = new Set<number>();
    for (let question = 0; question < 5; question += 1) {
      await expect(page.getByText(new RegExp(`Soru ${question + 1} / 5`))).toBeVisible();
      const key = await keyOf(page, question);
      const texts = await options(page).allInnerTexts();
      const at = texts.findIndex((text) => text.includes(key));
      expect(at).toBeGreaterThanOrEqual(0);
      seen.add(at);
      await answer(page, at);
      const after = await states(page);
      expect(after.filter((state) => state === "right")).toHaveLength(1);
      expect(after[at]).toBe("right");
      expect(after.filter((state) => state === "wrong")).toHaveLength(0);
      await expect(page.getByTestId("quiz-feedback")).toContainText("Doğru");
      await expect(page.getByTestId("quiz-feedback")).not.toContainText("Yanlış");
      // Kilitlenen cevap dokunulan şık (sunucuya giden metin).
      const sent = await lastSent(page);
      expect(sent).toBe(texts[at]!.slice(1).trim());
      if (question < 4) await page.getByRole("button", { name: "Devam et" }).tap();
    }
    if (sira === "duz") expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    // Karışık sırada da doğru harf en az üç ayrı yerde (dengeleyici).
    if (sira === "karisik") expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test(`yanlış şıkka dokunulunca yalnız o kırmızı (${sira} sıra)`, { tag: ["@public"] }, async ({ page }) => {
    await open(page, `sira=${sira}`);
    for (let question = 0; question < 5; question += 1) {
      const key = await keyOf(page, question);
      const texts = await options(page).allInnerTexts();
      const right = texts.findIndex((text) => text.includes(key));
      const wrong = (right + 1 + question) % texts.length === right ? (right + 1) % texts.length : (right + 1 + question) % texts.length;
      await answer(page, wrong);
      const after = await states(page);
      expect(after.filter((state) => state === "wrong")).toHaveLength(1);
      expect(after[wrong]).toBe("wrong");
      // Doğru şık yeşil gösterilir (19 Ekim 2026 kararı: öğrenci doğruyu açıklamada aramasın); başka renk yok.
      expect(after[right]).toBe("right");
      expect(after.filter((state) => state === "right")).toHaveLength(1);
      await expect(page.getByTestId("quiz-feedback")).toContainText("Yanlış");
      if (question < 4) await page.getByRole("button", { name: "Devam et" }).tap();
    }
  });
}

test("sunucu şıkları başka sırayla döndürse de ekranın sırası ve seçim kaymaz", { tag: ["@public"] }, async ({ page }) => {
  await open(page, "sira=duz&ters=1");
  // Cevaptan sonra harf rozetinin yerine ✓/✗ gelir: yalnız şık metinleri karşılaştırılır.
  const textsOf = async () => (await options(page).allInnerTexts()).map((text) => text.replace(/^[A-E]\s*\n/, "").trim());
  const before = await textsOf();
  await answer(page, 1);
  const after = await textsOf();
  expect(after).toEqual(before);
  const key = await keyOf(page, 0);
  const right = after.findIndex((text) => text.includes(key));
  const result = await states(page);
  expect(result[right]).toBe("right");
  expect(result.filter((state) => state === "wrong").length).toBe(right === 1 ? 0 : 1);
});

test("açıklama kartı alt çubuğun en az 28 px üstünde, koç cümlesi tek satır, İşlem Tahtası kesilmiyor", { tag: ["@public"] }, async ({ page }) => {
  await open(page, "sira=duz");
  await page.screenshot({ path: "test-results/sik-secimi-ust-390.png" });
  const scratch = page.getByRole("button", { name: "İşlem Tahtası" });
  const scratchBox = await scratch.boundingBox();
  const counter = await page.getByText(/Soru 1 \/ 5/).boundingBox();
  expect(scratchBox && counter).toBeTruthy();
  // Tamamı ekranda ve sayacın üstünde, ona binmeden.
  expect(scratchBox!.y).toBeGreaterThanOrEqual(0);
  expect(scratchBox!.x).toBeGreaterThanOrEqual(0);
  expect(scratchBox!.y + scratchBox!.height).toBeLessThanOrEqual(counter!.y);
  expect(scratchBox!.height).toBeGreaterThanOrEqual(40);

  // Yanlış cevap: koç cümlesi ve açıklama.
  const key = await keyOf(page, 0);
  const texts = await options(page).allInnerTexts();
  const right = texts.findIndex((text) => text.includes(key));
  await answer(page, (right + 1) % texts.length);
  await page.waitForTimeout(800);
  const coach = page.locator(".cp-coach");
  const coachBox = await coach.boundingBox();
  const lineHeight = await coach.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
  expect(coachBox!.height).toBeLessThanOrEqual(lineHeight * 1.2);
  const card = await page.getByTestId("quiz-feedback").boundingBox();
  // Kartın tamamı ekranda ve "Devam et" düğmesinin en az 28 px üstünde (düğme kartın üstüne binmez).
  const button = await page.getByRole("button", { name: "Devam et" }).boundingBox();
  expect(card!.y).toBeGreaterThanOrEqual(0);
  expect(card!.y + card!.height + 28).toBeLessThanOrEqual(button!.y + 1);
  // Alt çubuk ekranın içinde ve düğmesi en az 44 px.
  expect(button!.height).toBeGreaterThanOrEqual(44);
  expect(button!.y + button!.height).toBeLessThanOrEqual(844);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/sik-secimi-390.png" });
});

test("uzun açıklama: kart açılınca kendisi görünür alana gelir, düğme metnin üstüne binmez", { tag: ["@public"] }, async ({ page }) => {
  await open(page, "sira=duz&uzun=1");
  const key = await keyOf(page, 0);
  const texts = await options(page).allInnerTexts();
  const right = texts.findIndex((text) => text.includes(key));
  await answer(page, (right + 2) % texts.length);
  await page.waitForTimeout(900);
  const card = (await page.getByTestId("quiz-feedback").boundingBox())!;
  const button = (await page.getByRole("button", { name: "Devam et" }).boundingBox())!;
  // Başlık ("Açıklama") ve ilk satırlar görünür alanda, düğmenin üstünde.
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + 60).toBeLessThanOrEqual(button.y);
  // Kart sığıyorsa tamamı düğmenin en az 28 px üstünde.
  if (card.height + 28 + 16 <= button.y) expect(card.y + card.height + 28).toBeLessThanOrEqual(button.y + 1);
  await page.screenshot({ path: "test-results/sik-secimi-uzun-390.png" });
});

test("kayıtta çok cevaplı işaretli tek anahtarlı soru tek seçimlidir: A'dan B'ye geçince yalnız B kalır", { tag: ["@public"] }, async ({ page }) => {
  await open(page, "sira=duz&coklu=1");
  await expect(page.getByText("Birden fazla yanıt seçebilirsin")).toHaveCount(0);
  const key = await keyOf(page, 0);
  const texts = await options(page).allInnerTexts();
  const right = texts.findIndex((text) => text.includes(key));
  const other = (right + 1) % texts.length;
  await options(page).nth(other).tap();
  await options(page).nth(right).tap();
  expect((await states(page)).filter((state) => state === "selected")).toHaveLength(1);
  await page.getByRole("button", { name: "Kontrol et" }).tap();
  await expect(page.getByTestId("quiz-feedback")).toContainText("Doğru");
  const after = await states(page);
  expect(after[right]).toBe("right");
  expect(after.filter((state) => state === "wrong")).toHaveLength(0);
  expect(await lastSent(page)).toBe(texts[right]!.replace(/^[A-E]\s*\n/, "").trim());
});

test("canlı olay: önceki çalışmada kilitlenmiş soru kaldığı yerden açılınca not çıkar, dokunuş kilidi değiştirmez", { tag: ["@public"] }, async ({ page }) => {
  await open(page, "sira=duz&onceki=1");
  const note = page.getByTestId("answered-before");
  await expect(note).toBeVisible();
  await expect(note).toContainText("B şıkkı");
  const before = await states(page);
  expect(before[1]).toBe("wrong");
  expect(before[0]).toBe("right");
  await options(page).nth(2).tap({ force: true });
  expect(await states(page)).toEqual(before);
  await page.screenshot({ path: "test-results/sik-secimi-onceki-390.png" });
});
