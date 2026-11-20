import { expect, test } from "@playwright/test";

/**
 * Resmî müfredat (1 Kasım 2026): sihirbaz paneli (fikstür, ağ gerçek API'ye gider — paketlenmiş kayıt defteri,
 * veritabanı yok) ve herkese açık /mufredat, /resmi sayfaları.
 */
test.describe("Resmî müfredat", { tag: ["@public"] }, () => {
  test("panel: sınıf → ders → yazılı → senaryo; konu haritası anında, karma ortalama", async ({ page }) => {
    await page.goto("/e2e/mufredat");
    await page.getByRole("radio", { name: "Din Kültürü ve Ahlak Bilgisi" }).click();
    await expect(page.getByText("Türkiye Yüzyılı Maarif Modeli")).toBeVisible();
    await page.getByRole("radio", { name: "1. Dönem 1. Yazılı" }).click();
    await expect(page.getByTestId("official-summary")).toContainText("senaryoların ortalaması");
    await page.getByRole("radio", { name: "Senaryo 1", exact: true }).click();
    await expect(page.getByTestId("official-summary")).toHaveText("5 konu · 5 kazanım · 8 soru (resmî tablo)");
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("picked")).toContainText('"programId":"meb-5-dkab"');
    await expect(page.getByTestId("picked")).toContainText('"scenario":1');
    await expect(page.getByTestId("picked")).toContainText('"total":8');
    await page.getByRole("radio", { name: "Serbest Ünite Seçimi" }).click();
    await expect(page.getByTestId("official-summary")).not.toContainText("soru");
  });

  test("panel: YKS oturumu sınıf düzeyiyle süzülür; LGS ve KPSS düzeyleri", async ({ page }) => {
    await page.goto("/e2e/mufredat");
    await page.getByRole("radio", { name: "YKS (TYT / AYT)" }).click();
    await page.getByRole("radio", { name: "Matematik", exact: true }).click();
    await page.getByRole("radio", { name: "TYT", exact: true }).click();
    await expect(page.getByTestId("yks-split-note")).toContainText("TYT kapsamı: 9–10. sınıf kazanımları");
    await expect(page.getByTestId("official-summary")).toHaveText("11 konu · 68 kazanım");
    await page.getByRole("radio", { name: "AYT", exact: true }).click();
    await expect(page.getByTestId("official-summary")).toHaveText("14 konu · 62 kazanım");
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("picked")).toContainText('"part":"AYT"');
    await expect(page.getByTestId("picked")).toContainText('"title":"AYT Matematik (11–12. sınıf) sınav hazırlığı"');
    await page.getByRole("radio", { name: "TYT", exact: true }).click();
    await expect(page.getByTestId("official-unit-single").first()).toContainText("kazanım");
    await page.getByRole("button", { name: "Bu konularla devam et" }).click();
    await expect(page.getByTestId("picked")).toContainText('"title":"TYT Matematik (9–10. sınıf) sınav hazırlığı"');
    await page.getByRole("radio", { name: "LGS", exact: true }).click();
    await page.getByRole("radio", { name: "Matematik", exact: true }).click();
    await expect(page.getByTestId("official-summary")).toContainText("12 konu · 52 kazanım");
    await page.getByRole("radio", { name: "KPSS", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Genel Kültür", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Tarih \(Genel Kültür\)/ })).toBeVisible();
  });

  test("/mufredat ve /resmi herkese açık, kaynak ve eksik veri görünür", async ({ page }) => {
    await page.goto("/mufredat");
    await expect(page.getByRole("heading", { name: "Resmî Müfredat" })).toBeVisible();
    await page.getByRole("link", { name: "5. Sınıf Din Kültürü ve Ahlak Bilgisi" }).click();
    // İlk derleme/soğuk sunucu CI'da 5 sn'yi aşabiliyor (main #463 sonrası kırmızı); önce adres, sonra uzun bekleme.
    await page.waitForURL(/\/mufredat\/meb-5-dkab/, { timeout: 30_000 });
    await expect(page.getByTestId("mufredat-sources")).toContainText("sha256", { timeout: 30_000 });
    await page.goto("/resmi");
    await expect(page.getByTestId("resmi-calendar")).toContainText("YKS TYT");
    await expect(page.getByTestId("resmi-excluded")).toContainText("felsefe-grubu");
  });
});

/*
  Faz 9 (20 Kasım 2026, canlı misafir denetimi): /mufredat'ta DGS bölümünün son kartlarının sağ alt kenarı koyu bir
  katmanın arkasında kalıyordu. Neden sabit çerez bandı (opak zemin + yukarı gölge); sayfada başka katman ya da kırpma yok.
  Bant açıkken (tercih verilmemiş tarayıcı) her sınav bölümünün son kartı ekrana getirilince (`scrollIntoView`: klavye
  odağı ve bağlantı atlamasıyla aynı kaydırma) sağ alt köşesi ve kenarlarının ortası kartın kendisine düşer; sayfa sonunda
  son kartla altbilgi arasında en az 96 px boşluk kalır.
*/
test.describe("Resmî müfredat: son kartlar bandın arkasında kalmaz", { tag: ["@public"] }, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const size of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 820, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    test(`${size.width}px: her bölümün son kartı tam görünür, sayfa sonunda boşluk`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/mufredat");
      await expect(page.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
      await expect(page.getByTestId("mufredat-list").first()).toBeVisible();
      const report = await page.evaluate(async () => {
        document.documentElement.style.scrollBehavior = "auto";
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const lists = [...document.querySelectorAll<HTMLElement>('[data-testid="mufredat-list"]')];
        const problems: string[] = [];
        for (const list of lists) {
          const section = list.closest("section")?.querySelector("h2")?.textContent ?? "?";
          const card = list.lastElementChild as HTMLElement;
          card.scrollIntoView({ block: "end" });
          await frame();
          const box = card.getBoundingClientRect();
          // Köşe yuvarlak: noktalar yuvarlamanın içinde, kenarların düz kısmında.
          const radius = parseFloat(getComputedStyle(card).borderBottomRightRadius) || 0;
          const points: [string, number, number][] = [
            ["sağ alt", box.right - radius - 2, box.bottom - 2],
            ["sağ alt (yan)", box.right - 2, box.bottom - radius - 2],
            ["alt orta", box.left + box.width / 2, box.bottom - 2],
            ["sağ orta", box.right - 2, box.top + box.height / 2],
          ];
          for (const [name, x, y] of points) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || !card.contains(hit)) {
              const cover = hit ? `${hit.tagName.toLowerCase()}${hit.closest("[data-cookie-banner]") ? " (çerez bandı)" : ""}` : "yok";
              problems.push(`${section}: ${name} → ${cover}`);
            }
          }
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        await frame();
        const last = lists[lists.length - 1]!.lastElementChild as HTMLElement;
        const footer = document.querySelector("footer")!;
        return { problems, sections: lists.length, endGap: footer.getBoundingClientRect().top - last.getBoundingClientRect().bottom };
      });
      expect(report.sections).toBeGreaterThan(10);
      expect(report.problems).toEqual([]);
      expect(report.endGap).toBeGreaterThanOrEqual(96);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
});
