import { expect, test, type Page } from "@playwright/test";

/*
  Faz 9.1 (20 Kasım 2026): ana sayfanın birinci adımı "Çekirdeğe bırak". Misafir seçili branşın örnek notunu ders
  çekirdeğine kendi eliyle götürür (fare ya da dokunarak sürükle, ya da dokun / Enter); çekirdeğin ~60 px yakınında not
  mıknatıs gibi oturur ve çekirdek "Bırak" der; bırakılınca bulgular belirir ve "Sınavın ne zaman?" sorulur; gün
  seçilince çekirdekten ilk ders doğar (üç kart + günlere yayılmış küçük yol) ve "İlk ekranı aç" stüdyoyu dersin ilk
  ekranında açar. Tur hiçbir ağ isteği atmaz; misafirin kendi dosyası sunucuya gitmez.
*/

const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function smallestTouchTarget(page: Page): Promise<number> {
  return page.evaluate(() => {
    const heights = [...document.querySelectorAll<HTMLElement>("section.lj button, section.lj a")]
      .filter((node) => node.offsetParent !== null && getComputedStyle(node).visibility !== "hidden")
      .map((node) => Math.round(node.getBoundingClientRect().height * 10) / 10);
    return heights.length ? Math.min(...heights) : 99;
  });
}

/** Turun attığı istek: sunucu uçları ya da GET olmayan her istek (statik parçalar ve geliştirme sunucusu sayılmaz). */
function watchRequests(page: Page, baseURL: string): string[] {
  const sent: string[] = [];
  const origin = new URL(baseURL).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) return;
    if (/\/api\/(health|consent|csp-report)/.test(url.pathname)) return;
    if (request.method() !== "GET" || url.pathname.startsWith("/api/")) sent.push(`${request.method()} ${url.pathname}`);
  });
  return sent;
}

const phase = (page: Page) => page.locator(".lj-console .lj-core-stage");

/** Kutunun merkezi. */
async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("ders çekirdeği", { tag: ["@public"] }, () => {
  test.describe.configure({ timeout: 120_000 });

  for (const size of SIZES) {
    test(`fareyle sürükle ${size.width}px: uzakta bırakılınca yerine döner; yakında mıknatıs ve "Bırak"; bırakınca bulgular, gün, doğuş, ders`, async ({ page, baseURL }) => {
      const sent = watchRequests(page, baseURL!);
      await page.setViewportSize(size);
      await page.goto("/?hedef=lise");
      await page.locator(".lj-console .lj-core-stage").evaluate((node) => node.scrollIntoView({ block: "center" }));
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page)).toBeGreaterThanOrEqual(44);

      // Uzakta bırakılan not yerine yaylanır (hidrasyon bitene kadar yeniden denenir: sürükleme sınıfı görünmeli).
      await expect(async () => {
        const start = await centerOf(page, "[data-sample-start]");
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 40, start.y + 30, { steps: 4 });
        await expect(page.locator("[data-sample-start]")).toHaveClass(/is-dragging/, { timeout: 1000 });
        await expect(phase(page)).not.toHaveAttribute("data-near", "");
        await page.mouse.up();
      }).toPass({ timeout: 30_000 });
      await expect(page.locator("[data-sample-start]")).not.toHaveClass(/is-dragging/);
      await expect(phase(page)).toHaveAttribute("data-phase", "idle");
      await expect.poll(() => page.locator("[data-sample-start]").evaluate((node) => getComputedStyle(node).transform)).toBe("none");

      // Çekirdeğe doğru taşınır: ~60 px yakında mıknatıs, çekirdek büyür ve "Bırak" der.
      const from = await centerOf(page, "[data-sample-start]");
      const to = await centerOf(page, ".lj-console .lj-core-orb");
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x - 25, to.y - 15, { steps: 14 });
      await expect(phase(page)).toHaveAttribute("data-near", "");
      await expect(page.locator(".lj-console .lj-core-label")).toHaveText("Bırak");
      await page.screenshot({ path: `test-results/ders-cekirdegi-yakin-${size.width}.png` });
      await page.mouse.up();

      // Not içine çekilir; bulgular ve sınav günü ana sayfada.
      await expect(phase(page)).toHaveAttribute("data-phase", "scanning");
      await expect(page.locator(".lj-studio")).toHaveCount(0);
      await expect(page.locator(".lj-console [data-scan-findings] [data-finding]")).toHaveCount(4);
      const days = page.getByRole("radiogroup", { name: "Sınavın ne zaman?" });
      await expect(days.getByRole("radio")).toHaveText(["3 gün", "7 gün", "14 gün", "30 gün"]);
      expect(await overflow(page)).toBeLessThanOrEqual(1);

      // Gün seçilince ders doğar: üç kart, 14 günlük yol, düğme görünür yerde.
      await days.getByRole("radio", { name: "14 gün" }).click();
      const born = page.locator(".lj-console [data-born]");
      await expect(born).toBeVisible();
      await expect(born.locator("[data-output]")).toHaveText([/^Ders\s*2 bölüm$/, /^Konu testi\s*1 soru$/, /^Kartlar\s*2 kart$/]);
      await expect(born.getByText("14 günlük yolun")).toBeVisible();
      await expect(born.locator("[data-plan] li")).toHaveText([/Bugün\s*Ders/, /Yarın\s*Konu testi/, /6\. gün\s*Kartlar/, /10\. gün\s*Doğru\/Yanlış/, /Sınav sabahı\s*Kartlarla tekrar/]);
      const open = page.getByRole("button", { name: /İlk ekranı aç/ });
      await expect(open).toBeInViewport();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page)).toBeGreaterThanOrEqual(44);
      // Ana sayfadaki ray: ders doğdu, yol (2. adım) önde.
      await expect(page.locator(".lj-console .lj-rail [aria-current='step']")).toHaveAttribute("aria-label", /^Adım 2: /);

      // "İlk ekranı aç": stüdyo dersin ilk ekranında; ray yol haritasına götürür, çip seçilen günü söyler.
      await open.click();
      const studio = page.locator(".lj-studio");
      await expect(studio.locator(".lj-stage")).toHaveAttribute("data-step", "lesson");
      await expect(studio.locator(".tp-app .als")).toBeVisible({ timeout: 30_000 });
      await studio.getByRole("button", { name: /^Adım 2: / }).click();
      await expect(studio.getByText("Yazılına 14 gün var")).toBeVisible();
      expect(sent).toEqual([]);
    });
  }

  test("dokunmatik 390px: notu parmakla çekirdeğe sürükle; dokunarak gün seç; dersi aç", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const sent = watchRequests(page, baseURL!);
    await page.goto("/?hedef=lise");
    await page.locator(".lj-console .lj-core-stage").evaluate((node) => node.scrollIntoView({ block: "center" }));
    const client = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y) }] });

    // Parmak notu çekirdeğe taşır: sayfa kaymaz (kartta touch-action: none), mıknatıs, bırakınca tarama.
    await expect(async () => {
      const from = await centerOf(page, "[data-sample-start]");
      const to = await centerOf(page, ".lj-console .lj-core-orb");
      const scrollBefore = await page.evaluate(() => scrollY);
      await touch("touchStart", from.x, from.y);
      for (let step = 1; step <= 12; step += 1) await touch("touchMove", from.x + ((to.x - from.x) * step) / 12, from.y + ((to.y - 10 - from.y) * step) / 12);
      await expect(phase(page)).toHaveAttribute("data-near", "", { timeout: 1000 });
      expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
      await touch("touchEnd", to.x, to.y);
      await expect(phase(page)).toHaveAttribute("data-phase", "scanning", { timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    // Chrome'un CDP ile taklit edilen dokunuşunda, sürüklemeden sonraki ilk dokunuş tıklama üretmiyor (boş bir sayfada da
    // aynı; gerçek cihazla ilgisi yok): önce boş bir yere dokunulur.
    await page.locator(".lj-console .lj-date-title").tap();
    await page.getByRole("radio", { name: "3 gün" }).tap();
    await expect(page.locator(".lj-console [data-born]")).toBeVisible();
    await expect(page.locator(".lj-console [data-plan] li")).toHaveText([/Bugün\s*Ders \+ Konu testi/, /Yarın\s*Kartlar \+ Doğru\/Yanlış/, /Sınav sabahı/]);
    await page.getByRole("button", { name: /İlk ekranı aç/ }).tap();
    await expect(page.locator(".lj-studio .lj-stage")).toHaveAttribute("data-step", "lesson");
    expect(sent).toEqual([]);
    await context.close();
  });

  test("dokunmak da yeter 390px: nota dokunmak taramayı başlatır (sürüklemeden); dokunarak gün ve ders", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto("/?hedef=lise");
    await expect(async () => {
      // Not sürekli süzülür: dokunuş zorlanır (Playwright'ın kıpırdamıyor beklemesi bitmez).
      await page.locator("[data-sample-start]").tap({ force: true });
      await expect(phase(page)).toHaveAttribute("data-phase", "scanning", { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    // Sınav günü sorusu görünür yere gelir (çekirdeğin altında kalıyordu).
    await expect(page.getByRole("radio", { name: "3 gün" })).toBeInViewport({ timeout: 3000 });
    await page.getByRole("radio", { name: "7 gün" }).tap();
    await expect(page.locator(".lj-console [data-born]")).toBeVisible();
    // Düğme görünür yere gelir.
    await expect(page.getByRole("button", { name: /İlk ekranı aç/ })).toBeInViewport({ timeout: 3000 });
    await page.getByRole("button", { name: /İlk ekranı aç/ }).tap();
    await expect(page.locator(".lj-studio .lj-stage")).toHaveAttribute("data-step", "lesson");
    await context.close();
  });

  test("klavye 1440px: Enter notu gönderir, odak gün sorusuna geçer, ok tuşu seçer, Enter dersi açar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?hedef=lise");
    await expect(async () => {
      await page.locator("[data-sample-start]").focus();
      await page.keyboard.press("Enter");
      await expect(phase(page)).toHaveAttribute("data-phase", "scanning", { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: "3 gün" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "7 gün" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "7 gün" })).toBeFocused();
    await expect(page.locator(".lj-console [data-born]")).toBeVisible();
    await page.getByRole("button", { name: /İlk ekranı aç/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".lj-studio .lj-stage")).toHaveAttribute("data-step", "lesson");
  });

  for (const size of SIZES) {
    test(`kendi dosyası çekirdeğe bırakılır ${size.width}px: "Bırak", sunucuya gitmez, onay kartı açılır`, async ({ page, baseURL }) => {
      const sent = watchRequests(page, baseURL!);
      await page.setViewportSize(size);
      await page.goto("/?hedef=lise");
      const fire = (types: string[]) =>
        page.locator(".lj-console [data-core]").evaluate((core, events) => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(["%PDF-1.4 örnek"], "Kimya_notu.pdf", { type: "application/pdf" }));
          for (const type of events) core.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
        }, types);
      await expect(async () => {
        await fire(["dragenter", "dragover"]);
        await expect(page.locator(".lj-console .lj-core-label")).toHaveText("Bırak", { timeout: 1000 });
      }).toPass({ timeout: 30_000 });
      await fire(["drop"]);
      await expect(page.getByText("“Kimya_notu.pdf” taramaya hazır!")).toBeVisible();
      await expect(page.locator("[data-guest-document]")).toBeVisible();
      await expect(page.locator(".lj-console [data-core], .lj-studio")).toHaveCount(0);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(sent).toEqual([]);
    });
  }

  test("hareket azaltmada hiçbir şey kendiliğinden hareket etmez; bulgular ve doğuş anında", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?hedef=lise");
    const still = await page.evaluate(() =>
      [".lj-note", ".lj-core-ring", ".lj-core-ring--b", ".lj-core-arc-path"].map((selector) => getComputedStyle(document.querySelector(selector)!).animationName),
    );
    expect(still).toEqual(["none", "none", "none", "none"]);
    await expect(async () => {
      await page.locator("[data-sample-start]").click();
      await expect(phase(page)).toHaveAttribute("data-phase", "scanning", { timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator(".lj-console [data-scan-findings]")).toHaveClass(/is-shown/);
    await page.getByRole("radio", { name: "30 gün" }).click();
    await expect(page.locator(".lj-console [data-born]")).toBeVisible({ timeout: 800 });
    const outputs = await page.locator(".lj-console .lj-output").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
    expect(outputs).toEqual(["none", "none", "none"]);
  });

  test("1366×768: örnek not ve çekirdek ilk ekranda (tarayıcının görünen alanı ~650 px)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    const note = (await page.locator("[data-sample-start]").boundingBox())!;
    const core = (await page.locator(".lj-console .lj-core-orb").boundingBox())!;
    expect(note.y).toBeGreaterThan(0);
    expect(note.y + note.height).toBeLessThan(650);
    expect(core.y + core.height).toBeLessThan(650);
    expect(core.x).toBeGreaterThan(note.x + note.width);
  });
});
