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
    await expect(page.getByRole("radio", { name: /Genel Kültür/ })).toBeVisible();
  });

  test("/mufredat ve /resmi herkese açık, kaynak ve eksik veri görünür", async ({ page }) => {
    await page.goto("/mufredat");
    await expect(page.getByRole("heading", { name: "Resmî Müfredat" })).toBeVisible();
    await page.getByRole("link", { name: "5. Sınıf Din Kültürü ve Ahlak Bilgisi" }).click();
    await expect(page.getByTestId("mufredat-sources")).toContainText("sha256");
    await page.goto("/resmi");
    await expect(page.getByTestId("resmi-calendar")).toContainText("YKS TYT");
    await expect(page.getByTestId("resmi-excluded")).toContainText("felsefe-grubu");
  });
});
