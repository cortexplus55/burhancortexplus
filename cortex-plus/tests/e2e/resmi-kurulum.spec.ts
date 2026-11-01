import { expect, test, type Page } from "@playwright/test";

/**
 * Resmî sınav kurulumu (1 Kasım 2026): fikstür gerçek /api/curriculum/setup'a gider (paketlenmiş kayıt defteri,
 * veritabanı ve model yok); oluşturma gövdesi ekrana yazılır. Ekranda vaat edilen sayı = gövdedeki sayı.
 */
async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Sabit alt çubuk son içeriği örtmez; CTA en altta görünür ve tıklanabilir (üstünde başka katman yok). */
async function barClear(page: Page) {
  const bar = page.locator(".osf-bar");
  if (!(await bar.count())) return;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const result = await page.evaluate(() => {
    const barEl = document.querySelector(".osf-bar")!;
    const b = barEl.getBoundingClientRect();
    const prev = barEl.previousElementSibling?.getBoundingClientRect();
    const cta = barEl.querySelector(".osf-cta")!.getBoundingClientRect();
    const hit = document.elementFromPoint(cta.left + cta.width / 2, cta.top + cta.height / 2);
    return {
      overlap: prev ? prev.bottom - b.top : 0,
      inView: b.bottom <= window.innerHeight + 1 && b.left >= 0 && b.right <= window.innerWidth + 1,
      ctaOnTop: !!hit && barEl.contains(hit),
    };
  });
  expect(result.overlap).toBeLessThanOrEqual(1);
  expect(result.inView).toBe(true);
  expect(result.ctaOnTop).toBe(true);
}

async function screenOk(page: Page) {
  await noOverflow(page);
  await barClear(page);
}

test.describe("Resmî sınav kurulumu", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("YKS: alan çipi → konu ağacı → tarih → gövde (sayılar birebir)", async ({ page }) => {
    await page.goto("/e2e/resmi-kurulum");
    await screenOk(page);
    await page.getByRole("button", { name: /YKS \(TYT · AYT · YDT\)/ }).click();
    await page.getByRole("radio", { name: "🎯 Sadece TYT (Temel)" }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("9 ders · 85 ünite · 652 kazanım");
    await page.getByRole("radio", { name: "🌍 Dil (TYT + YDT)" }).click();
    await expect(page.getByTestId("ydt-note")).toContainText("yolun şimdilik TYT konularıyla kurulur");
    await page.getByRole("radio", { name: "🔢 Sayısal (TYT + AYT MF)" }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("13 ders · 123 ünite · 972 kazanım");
    await screenOk(page);

    await page.getByRole("button", { name: "Konuları gör" }).click();
    await page.locator("summary", { hasText: "TYT Türkçe" }).click();
    await expect(page.locator("details", { hasText: "TYT Türkçe" }).getByTestId("setup-unit").first()).toContainText(
      "9. Sınıf · Hikâye",
    );
    await page.locator("summary", { hasText: "TYT Tarih" }).click();
    for (const ders of ["TYT Türkçe", "TYT Tarih"]) {
      const titles = await page.locator("details", { hasText: ders }).getByTestId("setup-unit").allTextContents();
      expect(titles.length).toBeGreaterThan(5);
      expect(titles.filter((t) => /· \d+\. (?!Sınıf)/u.test(t))).toEqual([]);
    }
    await expect(page.locator("details", { hasText: "TYT Tarih" }).getByTestId("setup-unit").first()).toContainText(
      "9. Sınıf · Tarih ve Zaman",
    );
    await page.locator("summary", { hasText: "AYT Matematik" }).click();
    const firstUnit = page.locator("details", { hasText: "AYT Matematik" }).getByTestId("setup-unit").first();
    await firstUnit.getByRole("checkbox").first().uncheck();
    const secondUnit = page.locator("details", { hasText: "AYT Matematik" }).getByTestId("setup-unit").nth(1);
    await secondUnit.getByRole("radio", { name: "Zayıf" }).click();
    const summary = (await page.getByTestId("setup-summary").textContent()) ?? "";
    const [, units, outcomes] = summary.match(/(\d+) ünite · (\d+) kazanım/) ?? [];
    expect(Number(units)).toBe(122);
    await screenOk(page);

    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("quick-scan")).toContainText("10–12 soru");
    await screenOk(page);
    await page.getByRole("button", { name: "Taramayı atla" }).click();
    await expect(page.getByRole("radio", { name: /AYT/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: /YDT/ })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("radio", { name: "1 sa 30 dk" }).click();
    await expect(page.getByTestId("setup-promise")).toContainText(`${units} üniteyle`);
    await expect(page.getByTestId("setup-promise")).toContainText("“Zayıf” dediğin 1 ünite");
    await screenOk(page);
    await page.getByRole("button", { name: "Planımı Oluştur" }).click();
    const picked = page.getByTestId("picked");
    await expect(picked).toContainText('"title":"YKS Sayısal Hazırlığı"');
    await expect(picked).toContainText(`"topics":${units}`);
    await expect(picked).toContainText(`"units":${units}`);
    await expect(picked).toContainText(`"codes":${outcomes}`);
    await expect(picked).toContainText('"hard":1');
    await expect(picked).toContainText('"dailyMinutes":90');
    await expect(picked).toContainText('"examDate":"2027-06-20"');
    await expect(picked).toContainText('"alan":"say"');
  });

  test("LGS: 6 ders hazır seçili, tek ders anahtarı, LGS tarihi", async ({ page }) => {
    await page.goto("/e2e/resmi-kurulum?sinav=lgs");
    await expect(page.getByTestId("setup-summary")).toHaveText("6 ders · 38 ünite · 326 kazanım");
    await expect(page.locator(".osf-lead").first()).toContainText("LGS'nin 6 dersi seçili geldi");
    await screenOk(page);
    await page.getByRole("switch", { name: "Yalnızca Tek Ders Seç" }).check();
    await expect(page.locator(".osf-lead").first()).toContainText("Tek ders modu açık");
    await expect(page.locator(".osf-lead").first()).not.toContainText("6 dersi");
    await page.getByRole("radio", { name: /^Matematik/ }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("1 ders · 5 ünite · 52 kazanım");
    await page.getByRole("switch", { name: "Yalnızca Tek Ders Seç" }).uncheck();
    await page.getByRole("checkbox", { name: /^Fen Bilimleri/ }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("2 ders · 12 ünite · 113 kazanım");
    await page.getByRole("button", { name: "Konuları gör" }).click();
    await screenOk(page);
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("quick-scan")).toContainText("10–12 soru");
    await screenOk(page);
    await page.getByRole("button", { name: "Taramayı atla" }).click();
    await expect(page.getByTestId("setup-promise")).toContainText("Ünite sırası resmî programdaki gibidir");
    await screenOk(page);
    await page.getByRole("button", { name: "Planımı Oluştur" }).click();
    await expect(page.getByTestId("picked")).toContainText('"examDate":"2027-06-13"');
    await expect(page.getByTestId("picked")).toContainText('"topics":12');
    await expect(page.getByTestId("picked")).toContainText('"codes":113');
    await expect(page.getByTestId("picked")).toContainText('"examType":"LGS"');
  });

  test("YKS TYT: ⚡ Hızlı Tarama 12 soru → tahmini sonuç → işaretsiz ünitelere taşınır", async ({ page }) => {
    await page.goto("/e2e/resmi-kurulum?sinav=yks");
    await page.getByRole("radio", { name: "🎯 Sadece TYT (Temel)" }).click();
    await page.getByRole("button", { name: "Konuları gör" }).click();
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await page.getByRole("button", { name: "Taramayı başlat" }).click();
    for (let i = 0; i < 12; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 12`);
      await noOverflow(page);
      await expect(page.getByTestId("level-runner")).not.toContainText(/· \d+\. /);
      await page.getByTestId("level-runner").getByRole("button", { name: new RegExp("Yanlış şık B") }).click();
      await expect(page.getByTestId("level-feedback")).toBeVisible();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("scan-result").locator("li")).toHaveCount(6);
    await expect(page.getByTestId("scan-result")).toContainText("9. Sınıf · Fikstür Ünitesi A");
    await expect(page.getByTestId("scan-result")).not.toContainText(/· \d+\. /);
    await expect(page.getByTestId("scan-result")).toContainText("Zayıf (tahmini)");
    await screenOk(page);
    await page.getByRole("button", { name: "Devam et" }).click();
    await expect(page.getByTestId("setup-promise")).toContainText("Hızlı Tarama tahmini");
    await page.getByRole("button", { name: "Planımı Oluştur" }).click();
    await expect(page.getByTestId("picked")).toContainText('"scan":6');
  });

  test("KPSS: GY/GK çipleri, dürüst etiket, resmî bağlantılar, boş havuz, KPSS tarihi", async ({ page }) => {
    await page.goto("/e2e/resmi-kurulum");
    await page.getByRole("button", { name: /^KPSS/ }).click();
    await expect(page.getByTestId("tree-label")).toHaveText("Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir");
    await expect(page.getByTestId("setup-summary")).toHaveText("6 ders · 35 ünite · 94 kazanım");
    await expect(page.getByTestId("official-links")).toContainText("İlgili resmî kaynaklar");
    await expect(page.getByTestId("official-links").locator("a").first()).toHaveAttribute("href", /^https:\/\/[^ ]*osym\.gov\.tr/);
    await page.getByRole("radio", { name: /Genel Yetenek \(Türkçe/ }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("2 ders · 12 ünite · 38 kazanım");
    await screenOk(page);
    await page.getByRole("button", { name: "Konuları gör" }).click();
    await page.locator("summary", { hasText: "Türkçe" }).first().click();
    await page.locator("details", { hasText: "Türkçe" }).first().getByTestId("setup-unit").first().getByRole("radio", { name: "Zayıf" }).click();
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("scan-empty")).toContainText("Henüz hazır soru yok");
    await page.getByRole("button", { name: "Devam et" }).click();
    await page.getByRole("button", { name: "Planımı Oluştur" }).click();
    const picked = page.getByTestId("picked");
    await expect(picked).toContainText('"examType":"KPSS"');
    await expect(picked).toContainText('"examDate":"2027-09-12"');
    await expect(picked).toContainText('"title":"KPSS Hazırlığı"');
    await expect(picked).toContainText('"topics":12');
    await expect(picked).toContainText('"codes":38');
    await expect(picked).toContainText('"hard":1');
  });

  test("TUS: Tıp/Akademik etiket, tek ders anahtarı, Temel/Klinik çipleri, TUS tarihi", async ({ page }) => {
    await page.goto("/e2e/resmi-kurulum?sinav=tus");
    await expect(page.getByTestId("tree-label")).toHaveText("Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir");
    await expect(page.getByTestId("setup-summary")).toHaveText("11 ders · 54 ünite · 119 kazanım");
    await expect(page.locator(".osf-source")).toContainText("UÇEP 2020");
    await page.getByRole("switch", { name: "Yalnızca Tek Ders Seç" }).check();
    await page.getByRole("radio", { name: /^Anatomi/ }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText("1 ders · 5 ünite · 12 kazanım");
    await page.getByRole("switch", { name: "Yalnızca Tek Ders Seç" }).uncheck();
    await page.getByRole("radio", { name: "🩺 Klinik Tıp Bilimleri" }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText(/^4 ders · /);
    await page.getByRole("radio", { name: "🧬 Temel Tıp Bilimleri" }).click();
    await expect(page.getByTestId("setup-summary")).toHaveText(/^7 ders · /);
    await screenOk(page);
    await page.getByRole("button", { name: "Konuları gör" }).click();
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("scan-empty")).toContainText("Henüz hazır soru yok");
    await page.getByRole("button", { name: "Devam et" }).click();
    await page.getByRole("button", { name: "Planımı Oluştur" }).click();
    await expect(page.getByTestId("picked")).toContainText('"examType":"TUS"');
    await expect(page.getByTestId("picked")).toContainText('"examDate":"2027-03-27"');
  });
});
