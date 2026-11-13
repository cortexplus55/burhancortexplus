import { expect, test, type Page } from "@playwright/test";

/*
  Dönüşüm paketi (7 Kasım 2026): hedef kitle sekmeleri, 7 adımlı tanıtım turu (11 Kasım 2026), kayıt ön seçimi ve ilk adım
  başlatıcısı telefonda (375×812 ve 360×800) yana taşmaz, dokunma alanları 36 px'ten (turda 44 px'ten) küçük değil; tur
  hiçbir ağ isteği atmadan uçtan uca oynanır.

  Kokpit (11 Kasım 2026, gece): tur kahramanın içinde ve ilk ekranda; birinci adım iki kapılı (örnek not ya da misafirin
  kendi dosyası); Plus adımında üç canlı önizleme; ana sayfada kör deney kartı ve film şeridi yok.
*/

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function smallestTouchTarget(page: Page, scope: string): Promise<number> {
  return page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(`${selector} button, ${selector} a`)) as HTMLElement[];
    // Onda bir piksele yuvarlanır: hareket (ölçek) sürerken ölçülen 43,99997 px gerçek bir eksik değil (CI, 11 Kasım 2026).
    const heights = nodes
      .filter((node) => node.offsetParent !== null)
      .map((node) => Math.round(node.getBoundingClientRect().height * 10) / 10);
    return heights.length ? Math.min(...heights) : 99;
  }, scope);
}

const PHONES = [
  { width: 375, height: 812 },
  { width: 360, height: 800 },
] as const;

test.describe("dönüşüm paketi", { tag: ["@public"] }, () => {
  // 11 Kasım 2026: kayıtsız vitrin 7 adımlı tanıtım turuna dönüştü. Tur telefonda baştan sona oynanır:
  // her adımda yana taşma yok, turdaki her düğme en az 44 px, hiçbir ağ isteği atılmaz.
  for (const phone of PHONES) {
    test(`ana sayfa turu ${phone.width}px: yedi adım, taşma yok, dokunma alanı 44 px, ağ isteği yok`, async ({ page }) => {
      const apiCalls: string[] = [];
      page.on("request", (request) => {
        if (/\/api\//.test(request.url()) && !/\/api\/(health|consent)/.test(request.url())) apiCalls.push(request.url());
      });
      await page.setViewportSize(phone);
      await page.goto("/?hedef=universite");
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.getByRole("tab", { name: /Üniversite/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("link", { name: /Vize-final kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      // Üst menüdeki kayıt düğmesi telefonda da görünür.
      await expect(page.locator("header.mkh").getByRole("link", { name: "Ücretsiz dene" })).toBeVisible();

      const tour = page.locator("section.lj");
      // Kokpit ilk ekranda: ilerleme rayı sayfa kaydırılmadan görünür.
      await expect(tour.locator(".lj-rail")).toBeInViewport();
      const check = async (step: string) => {
        expect(await overflow(page), `${step}: yana taşma`).toBeLessThanOrEqual(1);
        expect(await smallestTouchTarget(page, "section.lj"), `${step}: dokunma alanı`).toBeGreaterThanOrEqual(44);
      };

      // 1. Not: tarama alanına dokun, tarama bitince yol haritası açılır. Geliştirme sunucusunda ilk dokunuş
      // hidrasyondan önce düşebilir: yol haritası görünene kadar yeniden dene.
      await check("not");
      await expect(async () => {
        const zone = tour.locator("button.lj-zone");
        if (await zone.isEnabled().catch(() => false)) await zone.click();
        await expect(tour.getByRole("button", { name: "Şimdi 1. dersi aç" })).toBeVisible({ timeout: 2500 });
      }).toPass({ timeout: 25_000 });
      // Seçili sekmenin sınav sözü yol haritasında.
      await expect(tour.getByText("Vizene 7 gün var")).toBeVisible();
      await check("yol");
      await tour.getByRole("button", { name: "Şimdi 1. dersi aç" }).click();
      // 3. Ders: çerçevenin içinde ürünün kendi ders ekranı (ayrı parça olarak yüklenir).
      const app = tour.locator(".tp-app");
      await expect(app.locator(".als")).toBeVisible({ timeout: 30_000 });
      // Ürün ekranının altında "sıradaki adım" düğmesi: adım oynanmadan da ilerlenir.
      await expect(tour.getByRole("button", { name: "Öğrendiğin kuralı soruda dene" })).toBeVisible();
      await check("ders");
      // Adım değişince ilerleme çizgisi sabit menünün altında kalmaz.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.querySelector(".lj-rail")!.getBoundingClientRect().top -
              document.querySelector("header.mkh")!.getBoundingClientRect().bottom,
          ),
        )
        .toBeGreaterThanOrEqual(0);
      // Önce dene sorusu yerelde, ürünle aynı işlevle notlanır; ardından formül kartı ve sınav tuzağı açılır.
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /Yanlış/ }).click();
      await expect(app.locator(".katex").first()).toBeVisible();
      await check("ders: kural");
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /−x/ }).first().click();
      await check("ders: soru");
      await app.getByRole("button", { name: /^Devam et/ }).click();
      await app.getByRole("button", { name: /Dersi bitir/ }).click();

      // 4. Konu testi: ürünün soru ekranı; "İki şık arasında kaldım" ipucu sunucuya gitmeden gelir.
      await expect(tour.locator('.tp-frame[data-screen="question"]')).toBeVisible();
      await app.getByRole("button", { name: /İki şık arasında kaldım/ }).click();
      await app.locator(".cp-two-option").nth(0).click();
      await app.locator(".cp-two-option").nth(2).click();
      await expect(app.locator(".cp-two-hint")).toBeVisible();
      await check("soru");
      await app.getByRole("button", { name: /^C\s*2$/ }).click();
      await app.getByRole("button", { name: /Kontrol et/ }).click();
      await check("soru: açıklama");
      await app.getByRole("button", { name: /Testi bitir/ }).click();

      // 5. Kartlar: önce çevir, sonra değerlendir.
      await app.locator("button.cp-exam-flash").click();
      await check("kart");
      await app.getByRole("button", { name: /Bildim/ }).click();
      await app.locator("button.cp-exam-flash").click();
      await app.getByRole("button", { name: /Bildim/ }).click();

      // 6. Doğru / Yanlış: ürünün odak kartı; sonuç gerçek cevaplardan.
      await expect(tour.locator('.tp-frame[data-screen="check"]')).toBeVisible();
      await app.getByRole("button", { name: /^Doğru/ }).click();
      await check("doğru/yanlış");
      await app.getByRole("button", { name: "Sonraki önerme" }).click();
      await app.getByRole("button", { name: /^Yanlış/ }).click();
      await app.getByRole("button", { name: "Sonucu gör" }).click();
      await expect(tour.getByText("3 sorudan 3 doğru")).toBeVisible();
      await tour.getByRole("button", { name: /Plus önizlemelerini gör/ }).click();

      // 7. Plus: üç canlı önizleme, telefonda seçiciyle tek tek. Podcast gerçek sesle, video ürünün tahtasıyla.
      const previews = tour.getByRole("tab");
      await expect(previews).toHaveCount(3);
      await expect(tour.locator(".lj-plus-badge")).toHaveCount(1);
      const podcast = tour.locator('[data-preview="podcast"]');
      await expect(podcast).toBeVisible({ timeout: 30_000 });
      await check("plus: podcast");
      await podcast.getByRole("button", { name: "15 saniyelik kesiti oynat" }).click();
      await expect(podcast).toHaveClass(/is-playing/);
      await expect(podcast.locator(".cp-pod-word.is-current-word")).toHaveCount(1);
      await podcast.getByRole("button", { name: "Duraklat" }).click();
      await previews.nth(1).click();
      const video = tour.locator('[data-preview="video"]');
      await expect(video.locator('.cp-video-frame.is-sketch [data-sketch="reel"]')).toBeVisible();
      await expect(video.locator(".cp-video-caption")).toBeVisible();
      await check("plus: video");
      await previews.nth(2).click();
      await expect(tour.locator('[data-preview="sheet"] .cp-cram-preview .cp-cram-item').first()).toBeVisible();
      await check("plus: kâğıt");
      await expect(tour.getByRole("link", { name: /Şimdi kendi notunla başla/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      expect(apiCalls).toEqual([]);
    });
  }

  test("sekme değişince kahraman, turun kayıt bağlantısı ve adres değişir", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.getByRole("tab", { name: /KPSS/ }).click();
      await expect(page.getByRole("link", { name: /Sınav kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=akademik", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    expect(page.url()).toContain("hedef=akademik");
    // Turun bağlam satırı seçilen sınava göre değişir; örnek not aynı kalır.
    await expect(page.locator(".lj-context")).toContainText("KPSS, TUS, DUS ve ALES");
    await page.getByRole("button", { name: /^Adım 7: / }).click();
    await expect(page.getByRole("link", { name: /Şimdi kendi notunla başla/ })).toHaveAttribute("href", "/kayit?hedef=akademik");
  });

  // 12 Kasım 2026, önizleme yayınında ölçüldü: ürün ekranlarının parçası istenince, stil dosyaları inene kadar
  // sayfadaki hiçbir tıklama ekrana yansımıyordu (sekme 1,8 sn sonra değişiyor, tarama animasyonu hiç görünmeden yol
  // haritası açılıyordu). Burada stil dosyaları test bırakana kadar bekletilir: tıklamalar yine hemen işlenmeli,
  // ürün ekranı ise stili gelmeden (stilsiz) açılmamalı.
  test("ürün ekranlarının stil dosyaları inerken tıklamalar bekletilmez, ekran stilsiz açılmaz", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/?hedef=lise");
    // Hidrasyon bitene kadar dene: sekme tıklaması yansıyınca sayfa hazırdır. Fare kokpite girmez.
    await expect(async () => {
      await page.getByRole("tab", { name: /YKS/ }).click();
      await expect(page.getByRole("tab", { name: /YKS/ })).toHaveAttribute("aria-selected", "true", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = 0;
    await page.route(/\/_next\/static\/.*\.css(\?|$)/, async (route) => {
      held += 1;
      await gate;
      await route.continue().catch(() => undefined);
    });

    // Fare kokpite girer: ürün ekranlarının parçası (ve stil dosyaları) istenir.
    await page.locator(".lj-console-head").hover();
    await expect.poll(() => held, { timeout: 30_000 }).toBeGreaterThan(0);

    // Stil dosyaları hâlâ yolda. Sekme değişir, tarama biter ve yol haritası açılır.
    await page.getByRole("tab", { name: /Üniversite/ }).click();
    await expect(page.getByRole("tab", { name: /Üniversite/ })).toHaveAttribute("aria-selected", "true");
    await page.locator("button.lj-zone").click();
    await expect(page.getByRole("button", { name: "Şimdi 1. dersi aç" })).toBeVisible();

    // Derse geçilir: stil gelene kadar yükleniyor satırı durur, ürün ekranı çizilmez.
    await page.getByRole("button", { name: "Şimdi 1. dersi aç" }).click();
    await expect(page.locator(".lj-product .tp-loading")).toBeVisible();
    await expect(page.locator(".tp-app .als")).toHaveCount(0);
    release();
    await expect(page.locator(".tp-app .als")).toBeVisible({ timeout: 30_000 });
  });

  test("ana sayfa dört bölüm: kokpit ilk ekranda, kör deney kartı ve film şeridi yok, sayfa kısaldı", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    // Dizüstünde tarayıcının görünen alanı ~650 px: kokpitin ilerleme rayı ve örnek not kartı orada.
    const rail = await page.locator(".lj-rail").boundingBox();
    const sample = await page.locator(".lj-file").boundingBox();
    expect(rail!.y + rail!.height).toBeLessThan(650);
    expect(sample!.y).toBeLessThan(650);
    await expect(page.getByTestId("same-note-case")).toHaveCount(1);
    await expect(page.getByTestId("blind-proof")).toHaveCount(0);
    await expect(page.locator(".hm-film, .hs")).toHaveCount(0);
    await expect(page.getByText(/canlandırılan bir öğrenci|hiçbir dosya yüklenmez|Bir nottan çıkan her şey/)).toHaveCount(0);
    // Üç plan kartı ve fiyatları (veritabanı yoksa "—"); otomatik yenileme sözü.
    await expect(page.locator("#planlar .lp-duo-card")).toHaveCount(3);
    await expect(page.locator("#planlar").getByText("Otomatik yenileme yok")).toBeVisible();
    // Eski sayfa bu genişlikte ~5.000 px idi. 13 Kasım 2026 (A1, sabit sahne): turun sahnesi adımdan adıma değişmeyen,
    // ekrana sığan bir yüksekliğe sabitlendi; not adımı ~350 px'ten ~600 px'e çıktı, sayfa ~4.340 px.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(4600);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  for (const phone of PHONES) {
    test(`misafirin kendi dosyası ${phone.width}px: sunucuya gitmez, kayıt bağlantısı kuruluma taşır, kurulumda bekler`, async ({ page }) => {
      const uploads: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET" && !/\/api\/(health|consent)/.test(request.url())) uploads.push(`${request.method()} ${request.url()}`);
      });
      // Kurulum fikstürü Plus kabuğunda açılır; tek seferlik "Seri" karşılaması (`GamificationGate`) seri isteği
      // dönünce bütün ekranı kaplar ve düğmelere tıklamayı keser. CI'da pencere tıklamadan önce açıldı (12 Kasım 2026);
      // karşılaması görülmüş bir tarayıcıyla başlanır.
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem("cortex-gamification-v1", "1");
        } catch {
          /* depolama kapalıysa pencere zaten test edilen şey değil */
        }
      });
      await page.setViewportSize(phone);
      await page.goto("/?hedef=lise");
      const tour = page.locator("section.lj");
      await expect(tour.getByRole("button", { name: "Kendi notunu seç" })).toBeVisible();
      await expect(async () => {
        await page.locator("input[data-guest-input]").setInputFiles({
          name: "Biyoloji_yazili_notu.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 örnek"),
        });
        await expect(tour.getByText("“Biyoloji_yazili_notu.pdf” taramaya hazır!")).toBeVisible({ timeout: 2500 });
      }).toPass({ timeout: 25_000 });
      const card = tour.locator("[data-guest-document]");
      await expect(card.getByText(/hiçbir yere gönderilmedi/)).toBeVisible();
      // Adım satırı artık ekranda olmayan örnek notu ve çekirdeği anlatmaz.
      await expect(tour.locator(".lj-guide")).toContainText("Dosyan hazır");
      await expect(tour.locator(".lj-guide")).not.toContainText("çekirdeğe");
      await expect(card.getByRole("link", { name: /Ücretsiz hesabımı aç, bu belgeyle başla/ })).toHaveAttribute(
        "href",
        "/kayit?hedef=lise&kaynak=belge&next=%2Fdeneme-sinavlari%2Folustur",
      );
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, "section.lj")).toBeGreaterThanOrEqual(44);
      expect(uploads).toEqual([]);

      // Kayıt ekranı dosyanın beklediğini söyler.
      await card.getByRole("link", { name: /Ücretsiz hesabımı aç/ }).click();
      await expect(page).toHaveURL(/\/kayit\?hedef=lise&kaynak=belge/);
      await expect(page.getByText(/Ana sayfada seçtiğin “Biyoloji_yazili_notu.pdf” bu cihazda bekliyor/)).toBeVisible();

      // Kurulumun materyal adımında dosya öğrencinin dokunuşunu bekler; vazgeçince silinir.
      await page.goto("/e2e/sihirbaz?adim=material");
      const offer = page.getByRole("group", { name: "Ana sayfada seçtiğin dosya" });
      await expect(offer).toBeVisible();
      await expect(offer.getByRole("button", { name: "Bu dosyayı ekle" })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await offer.getByRole("button", { name: "Vazgeç" }).click();
      await expect(offer).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("group", { name: "Ana sayfada seçtiğin dosya" })).toHaveCount(0);
      // Sihirbaz kendi taslağını kaydeder; dosya ise öğrenci "ekle" demedikçe hiçbir yere yüklenmez.
      expect(uploads.filter((item) => /documents|uploads?\b|storage/i.test(item))).toEqual([]);
    });
  }

  test("üst menü kaydırınca sabit kalır", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 1600));
    await expect(page.locator("header.mkh")).toBeInViewport();
    await expect(page.locator("header.mkh").getByRole("link", { name: "Ücretsiz dene" })).toBeVisible();
  });

  test("kayıt: ?hedef=yks-lgs hedefi önceden seçer, 8. sınıf seçilince LGS'ye döner", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/kayit?hedef=yks-lgs");
    await expect(page.getByRole("heading", { name: "Hangi sınıftasın, hedefin ne?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^YKS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "8. sınıf", exact: true }).click();
    await expect(page.getByRole("button", { name: /^LGS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "11. sınıf", exact: true }).click();
    await expect(page.getByRole("button", { name: /^YKS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  for (const phone of PHONES) {
    test(`ilk adım başlatıcısı ${phone.width}px: üç kapı, çipler, taşma yok`, async ({ page }) => {
      await page.setViewportSize(phone);
      await page.goto("/e2e/ilk-adim?hedef=yks");
      await expect(page.getByRole("heading", { name: /YKS \(TYT-AYT\) hedefin için/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "Fizik" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Çözemediğin sorunun/ })).toHaveAttribute("href", "/soru-coz");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, ".cp-first-step")).toBeGreaterThanOrEqual(36);
      await page.getByRole("button", { name: "Şimdilik gizle" }).click();
      await expect(page.getByRole("heading", { name: /hedefin için/ })).toHaveCount(0);
    });
  }
});
