import { expect, test, type Page } from "@playwright/test";

/**
 * Faz 3 (20 Kasım 2026): Belgelerim araması ve süzgeci, silme penceresi (Escape, odak dönüşü), Sınav hazırlıklarım
 * araması. Gerçek bileşenler, veritabanısız fikstür (`/e2e/liste-suzgec`). Telefonda yana taşma yok, düğmeler 44 px.
 */

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const width of [390, 360]) {
  test(`Belgelerim ${width} px: arama, süzgeç, boş durum; taşma yok, dokunma 44 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/e2e/liste-suzgec");
    const search = page.getByRole("searchbox", { name: "Belgelerde ara" });
    await expect(search).toBeVisible();
    await expect(page.locator(".cp-docs-card")).toHaveCount(3);
    await noHorizontalOverflow(page);

    for (const chip of await page.locator(".cx-list-chip").all()) {
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await search.fill("ÜÇÜNCÜ");
    await expect(page.locator(".cp-docs-card")).toHaveCount(1);
    const clear = page.getByRole("button", { name: "Aramayı temizle" });
    const box = (await clear.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await clear.click();
    await expect(page.locator(".cp-docs-card")).toHaveCount(3);

    await page.getByRole("group", { name: "Türe göre süz" }).getByRole("button", { name: "Fotoğraf" }).click();
    await expect(page.locator(".cp-docs-card")).toHaveCount(1);
    await page.getByRole("group", { name: "Duruma göre süz" }).getByRole("button", { name: "Hata" }).click();
    await expect(page.getByText("Aramana uyan belge yok")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByRole("button", { name: "Süzgeçleri temizle" }).click();
    await expect(page.locator(".cp-docs-card")).toHaveCount(3);
  });
}

test("silme penceresi: odak içeride, Escape kapatır, odak Sil düğmesine döner", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/liste-suzgec");
  const trigger = page.getByRole("button", { name: "Sil" }).first();
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Belge silinsin mi?" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  const rect = (await dialog.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  // Odak tuzağı: Tab pencerenin dışına çıkmaz. Son düğmeden sonra odak bir an pencerenin kenarındaki bekçi öğeye
  // düşer, bekçi onu ilk düğmeye geri verir; bu yüzden durum anlık değil yoklanarak okunur.
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="alertdialog"]'))))
      .toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await noHorizontalOverflow(page);
});

test("İçeriğe atla klavye odağında görünür ve odağı ana içeriğe taşır", async ({ page }) => {
  await page.goto("/e2e/liste-suzgec");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "İçeriğe atla" });
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("icerik");
});

test("Sınav hazırlıklarım 390 px: ad ve sınav türünde arama, ders süzgeci; taşma yok", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/liste-suzgec?ekran=hazirliklar");
  const search = page.getByRole("searchbox", { name: "Hazırlıklarda ara" });
  await expect(search).toBeVisible();
  await noHorizontalOverflow(page);
  await search.fill("ikinci ders");
  await expect(page.getByRole("tab", { name: "Yaklaşan (1)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Geçmiş (1)" })).toBeVisible();
  await search.fill("");
  await page.getByRole("group", { name: "Sınav ya da derse göre süz" }).getByRole("button", { name: "Birinci ders" }).click();
  await expect(page.getByText("Birinci hazırlık")).toBeVisible();
  await expect(page.getByText("İkinci hazırlık")).toHaveCount(0);
  await noHorizontalOverflow(page);
});
