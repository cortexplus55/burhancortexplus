import { expect, test, type Locator, type Page } from "@playwright/test";

/*
  Faz 9 (20 Kasım 2026): ana sayfanın "Aynı not, iki ayrı sonuç" akordeonu, plan kartlarının altındaki tek güven satırı ve
  beş soruluk sık sorulanlar. 390 / 820 / 1440 px'te:
  - Bir anda tek başlık açık; ilk yüklemede 1. başlık; başka başlık sahneyi değiştirir.
  - Geniş ekranda (1440) başlıklar solda, sahne sağda; telefonda ve tablette sahne açık başlığın içinde (başlığının altında,
    sonraki başlığın üstünde).
  - Klavye: ↓ ile başlıklar arasında gezilir, Enter açar.
  - Her açık başlıkta dokunma alanı 44 px, yazı 12 px; sayfa yana taşmaz; hiçbir dış adrese istek gitmez.
*/

const WIDTHS = [390, 820, 1440] as const;
const IDS = ["notuna-sadik", "sinav-radyosu", "kirmizi-kalem", "ikiz-soru", "ikiz-sinav", "sinifla-paylas"] as const;

test.use({ contextOptions: { reducedMotion: "reduce" } });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function openItem(page: Page, id: string) {
  const trigger = page.locator(`#fk-trigger-${id}`);
  await trigger.scrollIntoViewIfNeeded();
  // Geliştirme sunucusunda sayfa canlanmadan gelen tıklama boşa gider: açılana kadar tıklanır.
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}

/** Görünen her düğme, bağlantı ve özet en az 44×44 px. */
async function expectTargets(root: Locator, label: string) {
  const sizes = await root.locator("button, summary, a").evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { text: (node.textContent ?? "").trim().slice(0, 40), width: box.width, height: box.height };
      }),
  );
  expect(sizes.length, label).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.height, `${label}: ${size.text}`).toBeGreaterThanOrEqual(44);
    expect(size.width, `${label}: ${size.text}`).toBeGreaterThanOrEqual(44);
  }
}

/** Görünen bütün yazılar en az 12 px. */
async function expectTextFloor(root: Locator, label: string) {
  const small = await root.evaluate((node) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const value = text.textContent?.trim();
      const parent = text.parentElement;
      if (!value || !parent || parent.closest("svg")) continue;
      if (parent.getClientRects().length === 0) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) out.push(`${size}px ${value.slice(0, 30)}`);
    }
    return out;
  });
  expect(small, label).toEqual([]);
}

for (const width of WIDTHS) {
  test.describe(`ana sayfa akordeonu · ${width}px`, { tag: ["@public"] }, () => {
    test.use({ viewport: { width, height: 900 } });

    test("tek başlık açık, sahne değişir, yerleşim genişliğe göre; 44 px, 12 px, taşma ve dış istek yok", async ({ page, baseURL }) => {
      test.setTimeout(120_000);
      const origin = new URL(baseURL!).origin;
      const outside: string[] = [];
      page.on("request", (request) => {
        const url = request.url();
        if (!url.startsWith("data:") && !url.startsWith("blob:") && new URL(url).origin !== origin) outside.push(url);
      });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const section = page.locator("section#farklar");
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByRole("heading", { level: 2, name: "Aynı not, iki ayrı sonuç" })).toBeVisible();
      await expect(section.locator(".fk-head")).toHaveCount(IDS.length);
      // İlk yükleme: 1. başlık açık, sahnesi (aynı not, iki sonuç) görünür.
      await expect(page.locator("#fk-trigger-notuna-sadik")).toHaveAttribute("aria-expanded", "true");
      await expect(section.getByTestId("same-note-case")).toBeVisible();

      for (const id of IDS) {
        await openItem(page, id);
        for (const other of IDS) {
          await expect(page.locator(`#fk-trigger-${other}`), `${id} açıkken ${other}`).toHaveAttribute("aria-expanded", String(other === id));
        }
        const scenes = section.locator('[data-testid="fark-scene"]');
        await expect(scenes).toHaveCount(1);
        const scene = scenes.first();
        await expect(scene).toHaveAttribute("data-scene", id);
        await scene.scrollIntoViewIfNeeded();
        await expect(scene).toBeVisible();

        const trigger = (await page.locator(`#fk-trigger-${id}`).boundingBox())!;
        const sceneBox = (await scene.boundingBox())!;
        const panelBox = (await page.locator(`#fk-panel-${id}`).boundingBox())!;
        if (width >= 1440) {
          // Başlıklar solda (5/12), sahne sağda (7/12).
          expect(sceneBox.x, id).toBeGreaterThan(trigger.x + trigger.width);
          expect(sceneBox.width, id).toBeGreaterThan(trigger.width);
        } else {
          // Sahne açık başlığın içinde: metninin hemen altında, başlıkla aynı genişlikte ve sonraki başlığın üstünde.
          expect(sceneBox.y, id).toBeGreaterThanOrEqual(panelBox.y + panelBox.height - 1);
          expect(Math.abs(sceneBox.x - trigger.x), id).toBeLessThanOrEqual(1);
          expect(Math.abs(sceneBox.width - trigger.width), id).toBeLessThanOrEqual(1);
          const next = IDS[IDS.indexOf(id) + 1];
          if (next) {
            const nextBox = (await page.locator(`#fk-trigger-${next}`).boundingBox())!;
            expect(nextBox.y, id).toBeGreaterThanOrEqual(sceneBox.y + sceneBox.height);
          }
        }
        const item = page.locator(`.fk-item[data-item="${id}"]`);
        await expectTargets(item, id);
        await expectTextFloor(item, id);
        expect(await overflow(page), id).toBeLessThanOrEqual(0);
      }
      // Bölümün altında tek bağlantı.
      await expect(section.getByRole("link", { name: "Tüm özellikleri karşılaştır" })).toHaveAttribute("href", "/ozellikler#farklar");
      expect(outside).toEqual([]);
    });

    test("klavye: ↓ başlıklar arasında gezer, Enter açar; ikiz soru sahnesi istek atmadan çalışır", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const first = page.locator("#fk-trigger-notuna-sadik");
      await first.scrollIntoViewIfNeeded();
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.method() !== "GET") posts.push(request.url());
      });
      // Sayfa canlanana kadar: ↓ odağı ikinci başlığa taşıyana kadar dene.
      await expect(async () => {
        await first.focus();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("#fk-trigger-sinav-radyosu")).toBeFocused({ timeout: 1500 });
      }).toPass({ timeout: 30_000 });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("#fk-trigger-ikiz-soru")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#fk-trigger-ikiz-soru")).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#fk-trigger-notuna-sadik")).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("End");
      await expect(page.locator("#fk-trigger-sinifla-paylas")).toBeFocused();
      await page.keyboard.press("Home");
      await expect(first).toBeFocused();

      // Tuzak → ikiz: iki şık ipucu, yanlış cevap, ikiz soru.
      const twin = page.getByTestId("twin-scene");
      await twin.scrollIntoViewIfNeeded();
      await twin.getByRole("button", { name: "🤔 İki Şık Arasında Kaldım" }).click();
      await twin.getByRole("button", { name: "A şıkkı: Değişmez" }).click();
      await twin.getByRole("button", { name: "B şıkkı: %4 azalır" }).click();
      await expect(twin.getByTestId("twin-scene-hint")).toContainText("çeldirici olarak elendi");
      await twin.locator(".fk-twin-opt", { hasText: "Değişmez" }).click();
      await expect(twin.getByTestId("twin-scene-result")).toContainText("Tuzak yakalandı");
      await twin.getByRole("button", { name: "🔥 Yanlışın İkiziyle Anında Telafi Et" }).click();
      await expect(twin).toHaveAttribute("data-phase", "twin");
      await twin.locator(".fk-twin-opt", { hasText: "%1 azalır" }).click();
      await expect(twin.getByTestId("twin-scene-result")).toContainText("İkiz soruyu çözdün");
      expect(posts).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("planların altında tek güven satırı; SSS beş soru ve Yardım Merkezi bağlantısı", async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const trust = page.getByTestId("trust-line");
      await trust.scrollIntoViewIfNeeded();
      const items = trust.locator("li");
      await expect(items).toHaveText(["Notuna sadık", "Otomatik yenileme yok", "PayTR ile güvenli ödeme"]);
      await expect(trust.locator("li svg")).toHaveCount(3);
      const tops = await items.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
      // Geniş ekranda tek satır.
      if (width >= 820) expect(new Set(tops).size).toBe(1);
      const faq = page.getByTestId("home-faq");
      await faq.scrollIntoViewIfNeeded();
      await expect(faq.locator("details")).toHaveCount(5);
      for (const summary of await faq.locator("summary").all()) {
        const box = (await summary.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await faq.getByText("Ders notum yoksa kullanabilir miyim?").click();
      const link = faq.getByRole("link", { name: "Hazır müfredata göz at" });
      await expect(link).toHaveAttribute("href", "/mufredat");
      const linkBox = (await link.boundingBox())!;
      expect(linkBox.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("link", { name: "Tüm sorular için Yardım Merkezi" })).toHaveAttribute("href", "/yardim");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
