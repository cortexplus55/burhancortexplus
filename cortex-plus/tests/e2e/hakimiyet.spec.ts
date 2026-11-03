import { expect, test } from "@playwright/test";

test.describe("Hakimiyet Haritası + Kişisel Program", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Isı haritası etiketleri, kazanım açılımı, 'Zaman kalırsa' listesi ve pekiştirme", async ({ page }) => {
    await page.goto("/e2e/hakimiyet");
    const map = page.getByTestId("mastery-map");
    const units = map.getByTestId("mm-unit");
    await expect(units).toHaveCount(4);
    await expect(units.nth(0)).toHaveAttribute("data-tone", "mid");
    await expect(units.nth(0)).toContainText("Bu konuya %71 hakimsin · 3 yanıta dayalı");
    await expect(units.nth(1)).toHaveAttribute("data-tone", "low");
    await expect(units.nth(1)).toContainText("Bu konuya %28 hakimsin · 4 yanıta dayalı");
    await expect(units.nth(2)).toContainText("Henüz yeterli veri yok");
    await expect(units.nth(2)).toContainText("Kendi işaretin: Biliyorum");
    await expect(units.nth(3)).toHaveAttribute("data-tone", "none");
    await expect(map).not.toContainText(/· \d+\. /);

    await units.nth(0).getByRole("button").click();
    const outcomes = units.nth(0).getByTestId("mm-outcomes").locator("li");
    await expect(outcomes).toHaveCount(2);
    await expect(outcomes.nth(0)).toContainText("Bu konuya %75 hakimsin · tahmini");
    // Canlı hata (3 Kasım 2026): satır düğmesi o satırın kazanımını taşır; öneri düğmeleri kendi kazanımını etiketler.
    for (let i = 0; i < 2; i += 1) {
      const code = await outcomes.nth(i).getAttribute("data-code");
      await expect(outcomes.nth(i).getByTestId("mm-new-test")).toHaveAttribute("data-code", code ?? "");
      await expect(outcomes.nth(i).getByTestId("mm-new-test")).toHaveAttribute("aria-label", new RegExp(`: ${(code ?? "").replace(/\./g, "\\.")} `));
    }
    for (const btn of await page.getByTestId("mm-weak-new-test").all()) {
      const code = (await btn.getAttribute("data-code")) ?? "";
      await expect(btn.locator("xpath=..")).toContainText(code);
      await expect(btn.locator("xpath=..").getByTestId("mm-weak-outcome-text")).not.toBeEmpty();
    }

    await expect(page.getByTestId("plan-totals")).toHaveText("Planın 4 saat, senin 3 saatin var.");
    await expect(page.getByTestId("plan-list").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("plan-list").locator("li").first()).toContainText("Fikstür Ünitesi B");
    await expect(page.getByTestId("plan-list").locator("li").nth(1)).toContainText("Fikstür Ünitesi D");
    const later = page.getByTestId("plan-if-time");
    await expect(map).toContainText("Zaman kalırsa");
    await expect(later.locator("li")).toHaveCount(2);
    await expect(later.locator("li").first()).toContainText("Fikstür Ünitesi A");
    await expect(later.locator("li").nth(1)).toContainText("Fikstür Ünitesi C");

    await map.getByRole("button", { name: /Fikstür Ünitesi B: 1 kazanım · 2 ek soru/ }).click();
    await expect(page.getByTestId("reinforce-offer")).toContainText("zorlandığın 1 kazanım için doğrulanmış havuzdan 2 ek soru.");
    await page.getByRole("button", { name: "Ek soruları çöz" }).click();
    for (let i = 0; i < 2; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 2`);
      await page.getByTestId("level-runner").getByRole("button", { name: /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("reinforce-result")).toContainText("2 ek sorudan 2 doğru");
    await expect(page.getByTestId("reinforce-missing")).toContainText("Bu kazanım için ek soru hazır değil");
    // Paket 3: ek sorusu kalmayan kazanım için yeni pekiştirme testi (tek kazanım, 5 soru).
    await page.getByTestId("reinforce-new").first().click();
    for (let i = 0; i < 5; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 5`);
      await page.getByTestId("level-runner").getByRole("button", { name: /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("reinforce-result")).toContainText("5 ek sorudan 5 doğru");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("Canlı senaryo (TYT Temel Matematik, 10 gün × 30 dk): katı sıra, kısmi ünite, kontrol sonrası tazelenme", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/e2e/hakimiyet-tyt");
    const map = page.getByTestId("mastery-map");
    const weak = map.getByTestId("mm-unit").filter({ hasText: "Ünite A" });
    await expect(weak).toContainText("Henüz yeterli veri yok");
    await expect(page.getByTestId("plan-totals")).toHaveText("Planın 34 saat, senin 5 saatin var.");
    const plan = page.getByTestId("plan-list").locator("li");
    await expect(plan).toHaveCount(2);
    await expect(plan.nth(0)).toContainText("Ünite A");
    await expect(plan.nth(0)).toContainText("3 saat 20 dk");
    await expect(plan.nth(1)).toContainText("Üçgenler");
    await expect(plan.nth(1)).toContainText("16 kazanımdan en zayıf 3 kazanım");
    const later = page.getByTestId("plan-if-time").locator("li");
    await expect(later.first()).toContainText("Üçgenler");
    await expect(later.first()).toContainText("kalan 13 kazanım");
    await expect(later.last()).toContainText("Ünite K");
    await expect(page.getByTestId("plan-if-time")).not.toContainText("Ünite A");
    await expect(page.getByTestId("plan-list")).not.toContainText("Ünite K");
    await expect(page.getByTestId("plan-list")).not.toContainText("Polinomlar");

    // Ünite Seviye Kontrolü → sonuç: harita, plan ve pekiştirme önerisi tam gezinti olmadan güncellenir.
    await page.getByRole("button", { name: "Kontrolü başlat" }).click();
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 4`);
      await page.getByTestId("level-runner").getByRole("button", { name: i % 2 ? /Yanlış şık C/ : /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("unit-check-result")).toBeVisible();
    await expect(weak).toContainText("Bu konuya %43 hakimsin · 4 yanıta dayalı");
    // Zayıf 3 kazanımın doğrulanmış soruları tükenmiş: söz verilmez, dürüst satır gösterilir.
    await expect(page.getByTestId("mm-no-extra")).toHaveText("Şu an ek soru kalmadı; yeni sorular eklendikçe burada görünecek");
    await expect(map.getByRole("button", { name: /Ünite A:/ })).toHaveCount(0);
    await expect(page.getByTestId("unit-check").getByTestId("reinforce-empty")).toContainText("Şu an ek soru kalmadı");
    await expect(page.getByRole("button", { name: "Ek soruları çöz" })).toHaveCount(0);
    await page.getByTestId("unit-check").getByRole("button", { name: "Kapat" }).last().click();
    await expect(weak).toContainText("Bu konuya %43 hakimsin · 4 yanıta dayalı");
    await expect(page.getByTestId("plan-totals")).toHaveText("Planın 33 saat 50 dk, senin 5 saatin var.");
    await expect(plan.nth(0)).toContainText("Ünite A");
    await expect(plan.nth(0)).toContainText("3 saat 10 dk");
    await expect(plan.nth(1)).toContainText("Üçgenler");
    await expect(page.getByTestId("mm-note")).toContainText("ortalamasıdır");

    await expect(page.getByTestId("mm-no-extra")).toBeVisible();
    // Ek soru kalmasa da her zayıf kazanımda "🔥 Yeni Pekiştirme Testi" (havuz → yoksa üretim + v14).
    await expect(page.getByTestId("mm-weak-new-test").first()).toHaveText("🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("📊 Tahmini net kartı ve +Net getirecek 3 konu (dar ekran taşmasız)", async ({ page }) => {
    await page.goto("/e2e/hakimiyet");
    const card = page.getByTestId("net-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("net-value")).toContainText("📊 Tahmini Sınav Netin: 14,8 / 40");
    await expect(page.getByTestId("net-value")).toContainText("2,9–30,8 aralığı, 40 soru üzerinden");
    const top = page.getByTestId("net-top").locator("li");
    await expect(top).toHaveCount(3);
    await expect(top.first()).toContainText("Fikstür Ünitesi B: +7,2 net");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
