import { expect, test, type FileChooser, type Page } from "@playwright/test";

/*
  Anlar, uygulamanın içi, C işleri (13 Kasım 2026, ürün sahibinin kararı).

  C1 kurulumun materyal adımı: dosya seçilince tarama çekirdeği bir an oynar (en çok 2,5 sn, tıklama atlar, hareket
     azaltmada yok); yükleme anı beklemez; an bitince bugünkü ilerleme satırları.
  C2 ana ekranın "Not yükle" kapısı: aynı çekirdek; dosya sunucuya gitmeden kuruluma taşınır.
  C3 turdan kayda süreklilik: tur kaydı yol haritasına ulaşmışsa başlatıcının üstünde tek kart; kart resmî kurulumu
     turdaki konu seçili açar.
*/

const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 900 },
] as const;

/** An süresi kuralı (ms) ve ölçüm payı (çizim karesi, tarayıcı zamanlayıcısı). */
const MOMENT_MAX_MS = 2500;
const SLACK_MS = 250;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function smallestTouchTarget(page: Page, scope: string): Promise<number> {
  return page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(`${selector} button, ${selector} a`)) as HTMLElement[];
    const heights = nodes
      .filter((node) => node.offsetParent !== null)
      .map((node) => Math.round(node.getBoundingClientRect().height * 10) / 10);
    return heights.length ? Math.min(...heights) : 99;
  }, scope);
}

type MomentLog = { start: number | null; end: number | null; starts: number };

/**
 * Çekirdeğin `data-playing` özelliğinin açılış ve kapanış anlarını sayfanın kendi saatiyle kaydeder. Kayıt sekme
 * oturumunda: an bitince sayfa değişse de (C2 kuruluma gider) okunur.
 */
async function watchMoment(page: Page, scope: string) {
  await page.evaluate((selector) => {
    const log: MomentLog = { start: null, end: null, starts: 0 };
    const save = () => window.sessionStorage.setItem("__moment", JSON.stringify(log));
    save();
    const core = document.querySelector(`${selector} .cx-scan-core`);
    if (!core) throw new Error("çekirdek yok");
    const holder = window as unknown as { __momentObserver?: MutationObserver };
    holder.__momentObserver?.disconnect();
    const observer = new MutationObserver(() => {
      const playing = core.hasAttribute("data-playing");
      if (playing && log.start === null) {
        log.start = performance.now();
        log.starts += 1;
      }
      if (!playing && log.start !== null && log.end === null) log.end = performance.now();
      save();
    });
    observer.observe(core, { attributes: true, attributeFilter: ["data-playing"] });
    holder.__momentObserver = observer;
  }, scope);
}

async function moment(page: Page): Promise<MomentLog> {
  const raw = await page.evaluate(() => window.sessionStorage.getItem("__moment"));
  return raw ? (JSON.parse(raw) as MomentLog) : { start: null, end: null, starts: 0 };
}

/** Geliştirme sunucusunda ilk etkileşim sayfa canlanmadan düşebilir: ağ boşalana kadar beklenir. */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

test.describe("anlar C", { tag: ["@public"] }, () => {
  // Geliştirme sunucusu bir sayfayı ilk açılışta derler (kurulum, giriş); birkaç sayfa gezen testlere süre.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    // Kurulum fikstürü Plus kabuğunda: tek seferlik seri karşılaması ekranı kaplamasın.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalı */
      }
    });
  });

  for (const size of SIZES) {
    test(`C1 ${size.width} px: dosya seçilince an oynar, yükleme beklemez, an 2,5 sn içinde biter, sonra ilerleme satırı`, async ({ page }) => {
      const api: string[] = [];
      // Yükleme isteği yavaş cevaplansın: an sırasında ve sonrasında "yükleniyor" durumu görülür, hata 4 sn sonra.
      await page.route("**/api/**", async (route) => {
        api.push(route.request().url());
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Oturum gerekli" }) }).catch(() => undefined);
      });
      await page.setViewportSize(size);
      await page.goto("/e2e/sihirbaz?adim=material");
      await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 30_000 });
      await settled(page);
      const zone = page.locator(".apw-drop");
      await expect(zone.locator(".cx-scan-core")).toBeVisible();
      await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(0);
      await watchMoment(page, ".apw-drop");

      await zone.locator("input[type=file]").setInputFiles([
        { name: "Hücre bölünmesi notu.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(200_000, 1) },
        { name: "Defter sayfası.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(80_000, 2) },
      ]);
      await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(1);
      await expect(zone.locator("[data-scan-findings]")).toContainText("Hücre bölünmesi notu.pdf");
      await expect(zone.locator("[data-scan-findings]")).toContainText("Defter sayfası.jpg");
      // Yükleme anı beklemedi: istek an sürerken gitti.
      await expect.poll(() => api.length, { timeout: 2000 }).toBeGreaterThan(0);
      await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(1);
      expect(await overflow(page)).toBeLessThanOrEqual(1);

      await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(0, { timeout: MOMENT_MAX_MS + 1000 });
      const m = await moment(page);
      expect(m.starts).toBe(1);
      expect(m.end! - m.start!).toBeLessThanOrEqual(MOMENT_MAX_MS + SLACK_MS);
      // An bitince bugünkü ilerleme satırı (iki dosya: "0/2 dosya hazır · … okunuyor").
      await expect(zone).toContainText("dosya hazır");
      await expect(zone).toContainText("Sekmeyi kapatırsan");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, ".apw-drop")).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/anlar-c1-${size.width}.png` }).catch(() => undefined);
    });
  }

  test("C1: tıklama anı hemen bitirir; hata bildirimi beklemez", async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Oturum gerekli" }) }),
    );
    await page.setViewportSize(SIZES[1]);
    await page.goto("/e2e/sihirbaz?adim=material");
    await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 30_000 });
    await settled(page);
    const zone = page.locator(".apw-drop");
    await watchMoment(page, ".apw-drop");
    // Yükleme hemen düşer: an kendiliğinden biter ve hata bildirimi görünür (hata durumu bugünkü gibi).
    await zone.locator("input[type=file]").setInputFiles({ name: "not.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1000, 1) });
    await expect(page.getByText(/yüklenemedi|Oturum gerekli|Bağlantı hatası/).first()).toBeVisible({ timeout: 10_000 });
    await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(0);

    // Yavaş yüklemede tıklama anı atlar.
    await page.unroute("**/api/**");
    await page.route("**/api/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ status: 401, body: "{}" }).catch(() => undefined);
    });
    await watchMoment(page, ".apw-drop");
    await zone.locator("input[type=file]").setInputFiles({ name: "ikinci not.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1000, 1) });
    await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(1);
    await page.waitForTimeout(150);
    await page.getByRole("heading", { name: "Çalışma materyalini ekle" }).click();
    await expect(zone.locator(".cx-scan-core[data-playing]")).toHaveCount(0, { timeout: 500 });
    const m = await moment(page);
    expect(m.end! - m.start!).toBeLessThan(1200);
    await expect(zone).toContainText("Sekmeyi kapatırsan");
  });

  test("C1: hareket azaltmada an oynamaz, ilerleme satırı hemen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ status: 401, body: "{}" }).catch(() => undefined);
    });
    await page.setViewportSize(SIZES[0]);
    await page.goto("/e2e/sihirbaz?adim=material");
    await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 30_000 });
    await settled(page);
    const zone = page.locator(".apw-drop");
    await watchMoment(page, ".apw-drop");
    await zone.locator("input[type=file]").setInputFiles([
      { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1000, 1) },
      { name: "b.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1000, 1) },
    ]);
    await expect(zone).toContainText("dosya hazır");
    const m = await moment(page);
    expect(m.starts).toBe(0);
  });

  for (const size of SIZES) {
    test(`C2 ${size.width} px: çekirdeğe bırakılan dosya sunucuya gitmez, kısa andan sonra kuruluma taşınır`, async ({ page }) => {
      const sent: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET" && !/\/api\/(health|consent)/.test(request.url())) sent.push(`${request.method()} ${request.url()}`);
      });
      await page.setViewportSize(size);
      await page.goto("/e2e/ilk-adim?hedef=yks");
      const door = page.locator(".cp-first-step-card--upload");
      await expect(door).toBeVisible({ timeout: 30_000 });
      await settled(page);
      // Bugünkü bağlantı yerinde; çekirdek ayrı bir düğme.
      await expect(door.getByRole("link", { name: /Kendi ders notunu/ })).toHaveAttribute("href", "/deneme-sinavlari/olustur");
      const core = door.getByRole("button", { name: "Notunu tarama çekirdeğine bırak" });
      await expect(core).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, ".cp-first-step")).toBeGreaterThanOrEqual(36);
      expect(await smallestTouchTarget(page, ".cp-first-step-card--upload")).toBeGreaterThanOrEqual(44);
      await watchMoment(page, ".cp-first-step-card--upload");

      await door.locator("input[data-first-step-input]").setInputFiles({
        name: "Kimya ders notu.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 örnek"),
      });
      await expect(door.locator(".cx-scan-core[data-playing]")).toHaveCount(1);
      await expect(door.locator("[data-scan-findings]")).toContainText("Kimya ders notu.pdf");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      // An bitince kuruluma gidilir (fikstürde oturum yok: kurulum girişe yönlendirir, adres bunu taşır).
      await page.waitForURL(/\/deneme-sinavlari\/olustur|\/giris\?next=%2Fdeneme-sinavlari%2Folustur/, { timeout: 60_000 });
      const m = await moment(page);
      expect(m.starts).toBe(1);
      expect(m.end! - m.start!).toBeLessThanOrEqual(MOMENT_MAX_MS + SLACK_MS);

      // Kurulumun materyal adımında dosya öğrencinin dokunuşunu bekler.
      await page.goto("/e2e/sihirbaz?adim=material");
      const offer = page.getByRole("group", { name: "Ana sayfada seçtiğin dosya" });
      await expect(offer).toBeVisible({ timeout: 30_000 });
      await expect(offer).toContainText("Kimya ders notu.pdf");
      await expect(offer.getByRole("button", { name: "Bu dosyayı ekle" })).toBeVisible();
      expect(sent.filter((item) => /documents|uploads?\b|storage/i.test(item))).toEqual([]);
    });
  }

  test("C2: çekirdek klavyeyle açılır; hareket azaltmada an yok, dosya saklanınca hemen gidilir", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(SIZES[1]);
    await page.goto("/e2e/ilk-adim?hedef=yks");
    const door = page.locator(".cp-first-step-card--upload");
    await expect(door).toBeVisible({ timeout: 30_000 });
    await settled(page);
    await watchMoment(page, ".cp-first-step-card--upload");
    const core = door.getByRole("button", { name: "Notunu tarama çekirdeğine bırak" });
    // Yük altında ilk Enter sayfa canlanmadan düşebilir: dosya seçici açılana kadar yeniden basılır (13 Kasım 2026).
    let chooser: FileChooser | null = null;
    await expect(async () => {
      const opened = page.waitForEvent("filechooser", { timeout: 3000 });
      await core.focus();
      await page.keyboard.press("Enter");
      chooser = await opened;
    }).toPass({ timeout: 45_000 });
    await chooser!.setFiles({ name: "Fizik notu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await page.waitForURL(/\/deneme-sinavlari\/olustur|\/giris\?next=%2Fdeneme-sinavlari%2Folustur/, { timeout: 60_000 });
    const marker = await page.evaluate(() => window.sessionStorage.getItem("cp:guest-doc"));
    expect(marker).toContain("Fizik notu.pdf");
  });

  for (const size of SIZES) {
    test(`C3 ${size.width} px: kart yalnız turda yol haritasına ulaşıldıysa; kurulumu konu seçili açar`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/e2e/ilk-adim?hedef=yks");
      await expect(page.locator(".cp-first-step")).toBeVisible({ timeout: 30_000 });
      await settled(page);
      await expect(page.locator("[data-tour-resume]")).toHaveCount(0);

      // Turun yalnız ilk adımı: kart yok.
      await page.evaluate(() =>
        window.sessionStorage.setItem("cp:guest-tour", JSON.stringify({ steps: ["upload"], segment: "yks-lgs", at: Date.now() })),
      );
      await page.reload();
      await expect(page.locator(".cp-first-step")).toBeVisible({ timeout: 30_000 });
      await settled(page);
      await expect(page.locator("[data-tour-resume]")).toHaveCount(0);

      // Yol haritasına ulaşılmış: tek kart, başlatıcının üstünde.
      await page.evaluate(() =>
        window.sessionStorage.setItem("cp:guest-tour", JSON.stringify({ steps: ["upload", "roadmap"], segment: "yks-lgs", at: Date.now() })),
      );
      await page.reload();
      const card = page.locator("[data-tour-resume]");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await settled(page);
      const link = card.getByRole("link", { name: "Turda denemiştin — Köklü Sayılar ile başla" });
      await expect(link).toHaveAttribute("href", /\/deneme-sinavlari\/resmi\/kurulum\?sinav=yks&alan=tyt&konu=/);
      const order = await page.evaluate(() => {
        const cardBox = document.querySelector("[data-tour-resume]")!.getBoundingClientRect();
        const heading = document.querySelector("#cp-first-step-title")!.getBoundingClientRect();
        return cardBox.bottom <= heading.top + 1;
      });
      expect(order).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, "[data-tour-resume]")).toBeGreaterThanOrEqual(44);
      await card.screenshot({ path: `test-results/anlar-c3-${size.width}.png` }).catch(() => undefined);

      await link.click();
      await page.waitForURL(/resmi%2Fkurulum|resmi\/kurulum/, { timeout: 60_000 });
      expect(await page.evaluate(() => window.sessionStorage.getItem("cp:guest-tour"))).toBeNull();

      // Kurulum konu seçili açılır: yalnız eşleşen ünite, adım Konular.
      await page.goto(`/e2e/resmi-kurulum?sinav=yks&alan=tyt&konu=${encodeURIComponent("köklü")}`);
      await expect(page.getByRole("heading", { name: "Ünite ünite resmî konuların" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("setup-summary")).toHaveText("1 ders · 1 ünite · 1 kazanım");
      await expect(page.getByText(/Köklü ifadeleri içeren denklemleri çözer/)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }
});
