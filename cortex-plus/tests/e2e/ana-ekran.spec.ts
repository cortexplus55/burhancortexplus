import { expect, test, type Page } from "@playwright/test";

/*
  8 Kasım 2026: öğrencinin ana ekranı (/ogretmen fikstürü) ve Çalışma Stüdyosu sekmesi (/araclar fikstürü).
  Telefon, tablet ve masaüstünde: yana taşma yok; ana ekranda Plus ve stüdyo kartı yok, mod düğmeleri ortada ve
  kırpılmıyor, son içerik yazma alanının üstünde kalıyor; stüdyo sayfasında sekiz kart, her birinin ortası tıklanınca
  kartın kendisi yakalanıyor.
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

async function scrollToEnd(page: Page) {
  // Yazma alanı ölçülene kadar (hidrasyon) alt boşluk ilk boyamadaki tahmindir.
  await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".cp-sor-hero, .cp-sor-messages")) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await page.waitForTimeout(400);
}

async function layout(page: Page, lastSelector: string) {
  return page.evaluate((selector) => {
    const zone = document.querySelector(".cp-sor-composer-zone")!.getBoundingClientRect();
    const items = [...document.querySelectorAll(selector)].filter((node) => (node as HTMLElement).offsetParent !== null);
    const last = items[items.length - 1]!.getBoundingClientRect();
    const mode = document.querySelector(".cp-tutor-mode")!;
    const pills = [...mode.querySelectorAll(".cp-tutor-mode-pill")].map((pill) => pill.getBoundingClientRect());
    const modeBox = mode.getBoundingClientRect();
    const left = pills[0]!.left - modeBox.left;
    const right = modeBox.right - pills[pills.length - 1]!.right;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Geçiş (::before) bestecinin 1.75rem üstünden başlıyor.
      gap: Math.round(zone.top - 28 - last.bottom),
      centered: Math.abs(left - right) <= 2,
      clipped: mode.scrollWidth > mode.clientWidth + 1,
    };
  }, lastSelector);
}

for (const size of SIZES) {
  test(`ana ekran ${size.width}×${size.height}: Plus ve stüdyo kartı yok, üst üste binme yok`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);

    await page.goto("/e2e/ana-ekran");
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
    await expect(page.locator(".pm-card, .sg-card, .cp-sor-upgrade-row")).toHaveCount(0);
    await scrollToEnd(page);
    const empty = await layout(page, ".cp-first-step");
    expect(empty.overflow).toBeLessThanOrEqual(1);
    expect(empty.gap).toBeGreaterThanOrEqual(0);
    expect(empty.centered).toBe(true);
    expect(empty.clipped).toBe(false);
    await page.screenshot({ path: `test-results/ana-ekran-${size.width}-bos.png` });

    // Kayıtlı sohbet açılınca sayfa kendiliğinden sona iner: testte elle kaydırma yok (8 Kasım 2026).
    await page.goto("/e2e/ana-ekran?durum=sohbet");
    await expect(page.getByText("Peki ikinci türev neyi gösterir?")).toBeAttached();
    await expect(page.locator(".pm-card, .cp-sor-upgrade-row")).toHaveCount(0);
    await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
    await expect(page.locator(".cp-followups")).toBeVisible();
    await expect(async () => {
      const thread = await layout(page, ".cp-followups");
      expect(thread.overflow).toBeLessThanOrEqual(1);
      expect(thread.gap).toBeGreaterThanOrEqual(0);
      expect(thread.centered).toBe(true);
    }).toPass({ timeout: 10_000 });

    // Cevabı gelmemiş son soru: "Tekrar sor" görünür ve yazma alanının üstünde.
    await page.goto("/e2e/ana-ekran?durum=cevapsiz");
    await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Tekrar sor" })).toBeVisible();
    await expect(async () => {
      const unanswered = await layout(page, ".cp-sor-unanswered");
      expect(unanswered.gap).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 10_000 });
  });

  test(`iç ekranlar ${size.width}×${size.height}: beşgen etiketleri kesilmez, stüdyo başı ve defter`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/e2e/ic-ekran?ekran=radar");
    const clipped = await page.evaluate(() => {
      const svg = document.querySelector(".cp-radar-svg")!.getBoundingClientRect();
      // 8 Kasım 2026: çizimde ad yok, numara var; ad ve yüzde alttaki listede.
      return [...document.querySelectorAll(".cp-radar-num")]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.left < svg.left - 1 || box.right > svg.right + 1;
        })
        .map((node) => node.textContent);
    });
    expect(clipped).toEqual([]);
    expect(await page.locator(".cp-radar-legend li").count()).toBe(5);

    await page.goto("/e2e/ic-ekran?ekran=test");
    await expect(page.locator(".ls-hero")).toContainText("Konu Testi");
    await expect(page.getByRole("link", { name: "Çalışma Stüdyosu" }).first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.goto("/e2e/ic-ekran?ekran=defter");
    await expect(page.getByRole("link", { name: "İlk testini çöz" })).toBeVisible();
  });

  test(`Çalışma Stüdyosu ${size.width}×${size.height}: sekiz kart, taşma yok, kartlar tıklanır`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/e2e/studyo");
    await expect(page.getByRole("heading", { name: "Bugün nasıl çalışmak istersin?" })).toBeVisible();
    const tabName = size.width < 768 ? "Stüdyo" : "Çalışma Stüdyosu";
    await expect(page.getByRole("link", { name: tabName, exact: true }).first()).toBeAttached();
    const cards = page.locator(".sg-card");
    await expect(cards).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    for (let index = 0; index < 8; index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest(".sg-card")),
        [box.x + box.width / 2, box.y + box.height / 2] as const,
      );
      expect(hit, `kart ${index}`).toBe(true);
    }
    await page.screenshot({ path: `test-results/studyo-${size.width}.png`, fullPage: true });
  });
}

test("sohbet öğretim dili: kilit bilgi, kutular ve Akılda kalsın kartı çizilir; ham işaret kalmaz", { tag: ["@public"] }, async ({ page }) => {
  for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto("/e2e/ana-ekran?durum=ogretim");
    await expect(page.locator("mark.cp-key").first()).toBeAttached();
    await expect(page.locator(".cp-callout")).toHaveCount(2);
    await expect(page.locator(".cp-remember")).toHaveCount(2);
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      raw: [...document.querySelectorAll(".cp-sor-msg-assistant")].some(
        (node) => (node as HTMLElement).innerText.includes("==") || /(^|\n)\s*>/.test((node as HTMLElement).innerText),
      ),
      smallButtons: [...document.querySelectorAll(".cp-remember-add")].filter((node) => node.getBoundingClientRect().height < 44).length,
    }));
    expect(state).toEqual({ overflow: 0, raw: false, smallButtons: 0 });
  }
});

test("Soru Çöz ve hazırlık yolu: tuzak kutusu, Akılda kalsın, renkli adımlar, sıkışmayan düğmeler", { tag: ["@public"] }, async ({ page }) => {
  for (const size of [{ width: 375, height: 900 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto("/e2e/ic-ekran?ekran=cozum");
    await expect(page.locator(".cp-solver-callout.cp-callout--mistake")).toBeVisible();
    await expect(page.locator(".cp-remember")).toContainText("eşdeğer direnç");

    await page.goto("/e2e/ic-ekran?ekran=yol");
    await expect(page.locator(".cp-exam-trail-node[data-kind]").first()).toBeAttached();
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll(".cp-path-next--focus .cp-path-next-actions > *")].map((node) => Math.round(node.getBoundingClientRect().height)),
    );
    expect(heights.length).toBe(3);
    // Önceden "Başka Bir Konu veya Etkinlik Seç" üç satıra sıkışıyordu (~70 px).
    expect(Math.max(...heights)).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

// Her boyut ayrı test: üç boyut tek testte CI'da 30 sn sınırını aşıyordu (8 Kasım 2026).
for (const size of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`kurucu turu ${size.width}×${size.height}: sohbet altı tek satır, Soru Çöz başlığı, kartta sıradaki adım, anket şeridi`, { tag: ["@public"] }, async ({ page }) => {
    await page.route("**/api/feedback/weekly", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: { show: true } }) : route.fulfill({ json: { ok: true } }),
    );
    await page.setViewportSize(size);

    await page.goto("/e2e/ana-ekran?durum=ogretim");
    await expect(page.locator(".cp-sor-view[data-composer-measured]")).toBeAttached({ timeout: 30_000 });
    const controls = await page.evaluate(() => {
      const row = document.querySelector(".cp-sor-controls")!.getBoundingClientRect();
      const messages = document.querySelector(".cp-sor-messages")!.getBoundingClientRect();
      const zone = document.querySelector(".cp-sor-composer-zone")!.getBoundingClientRect();
      return { rowH: Math.round(row.height), readable: Math.round(zone.top - messages.top) };
    });
    // Tek satır (telefonda en çok iki); okuma alanı telefonda da 300 px'ten fazla.
    expect(controls.rowH).toBeLessThanOrEqual(84);
    expect(controls.readable).toBeGreaterThan(300);
    await page.locator(".cp-source-pill .cp-ctrl-pill").click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Kaynak modu" })).toHaveCount(0);
    await expect(page.locator(".cp-teacher-sign").first()).toBeAttached();

    await page.goto("/e2e/ic-ekran?ekran=soru");
    await expect(page.getByRole("heading", { level: 1, name: "Fotoğraftan Çözüm" })).toBeVisible();
    await expect(page.locator(".cp-solver-hero-quota")).toHaveCount(0);

    await page.goto("/e2e/ic-ekran?ekran=sinavlar");
    const first = page.locator(".cp-prep-card").first();
    await expect(first.locator(".cp-prep-card-next")).toContainText("Sıradaki");
    await expect(first.getByRole("link", { name: "Devam et" })).toHaveAttribute("href", "/deneme-sinavlari/p1/dugum/n4");
    await expect(page.locator(".cp-survey-strip")).toBeVisible();
    await expect(page.getByRole("radio", { name: "4" })).toHaveCount(0);
    await page.getByRole("button", { name: "Yanıtla" }).click();
    await expect(page.getByRole("radio", { name: "4" }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("Başla: öğretmen ilk sözü kendisi söyler, model çağrısı yok, devam önerisi yok, yazma alanı odakta", { tag: ["@public"] }, async ({ page }) => {
  const chatCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/chat")) chatCalls.push(request.url());
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/e2e/ana-ekran");
  await page.getByRole("button", { name: "Başla" }).click();
  await expect(page.locator(".cp-teacher-greeting")).toContainText("Bugün ne çalışmak istersin?");
  await expect(page.locator(".cp-sor-msg-user")).toHaveCount(0);
  await expect(page.locator(".cp-followups")).toHaveCount(0);
  await expect(page.locator(".cp-sor-composer-box textarea")).toBeFocused();
  expect(chatCalls).toEqual([]);
});
