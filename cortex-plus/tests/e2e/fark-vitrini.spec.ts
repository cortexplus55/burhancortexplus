import { expect, test, type Locator, type Page } from "@playwright/test";

/*
  Fark vitrini (20 Kasım 2026, Faz 7): ana sayfadaki "Aynı not, iki ayrı sonuç" bölümünde üç kart, /ornek'in sonunda
  ikisi, /ozellikler tablosunda beş yeni satır. Faz 9 (aynı gün): ana sayfada kartlar akordeonun sahneleri; akordeonun
  yerleşimi ve klavyesi `ana-sayfa-akordeon.spec.ts`te. 390 / 820 / 1440 px'te: kartlar görünür, sayfa yana taşmaz, dokunma
  alanı 44 px, yazı 12 px; radyo düğmesi çalma durumunu değiştirir ve ses yalnız tıklamadan sonra yüklenir; üçüncü
  taraf hiçbir adrese istek gitmez. 390 px'te daha geniş bir yedek yazı tipiyle (Verdana) yazılar üst üste binmez.
*/

const WIDTHS = [390, 820, 1440] as const;

/** Hareket azaltma: kaydırmayla açılan bölümler (gsap) ve dalga çubukları durur, ölçüm kararlı kalır. */
test.use({ contextOptions: { reducedMotion: "reduce" } });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function watchRequests(page: Page, origin: string) {
  const all: string[] = [];
  page.on("request", (request) => all.push(request.url()));
  return {
    all,
    thirdParty: () =>
      all.filter((url) => {
        if (url.startsWith("data:") || url.startsWith("blob:")) return false;
        return new URL(url).origin !== origin;
      }),
    audio: () => all.filter((url) => /\.mp3(\?|$)/.test(url)),
  };
}

/** Kartın içindeki her denetim en az 44×44 px. */
async function expectTargets(card: Locator, label: string) {
  const sizes = await card.locator("button, summary, a").evaluateAll((nodes) =>
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

/** Kartın görünen bütün yazıları en az 12 px. */
async function expectTextFloor(card: Locator, label: string) {
  const small = await card.evaluate((root) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("svg")) continue;
      if (parent.getClientRects().length === 0) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) out.push(`${size}px ${text.slice(0, 30)}`);
    }
    return out;
  });
  expect(small, label).toEqual([]);
}

/** Aynı kartta iki ayrı yazı parçası üst üste binmiyor (satır kutuları, süs SVG'leri hariç). */
async function textOverlaps(card: Locator): Promise<string[]> {
  return card.evaluate((root) => {
    type Box = { owner: number; text: string; rect: DOMRect };
    const boxes: Box[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let owner = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("svg")) continue;
      owner += 1;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        boxes.push({ owner, text: text.slice(0, 30), rect });
      }
    }
    const hits: string[] = [];
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        if (boxes[a]!.owner === boxes[b]!.owner) continue;
        const x = Math.min(boxes[a]!.rect.right, boxes[b]!.rect.right) - Math.max(boxes[a]!.rect.left, boxes[b]!.rect.left);
        const y = Math.min(boxes[a]!.rect.bottom, boxes[b]!.rect.bottom) - Math.max(boxes[a]!.rect.top, boxes[b]!.rect.top);
        if (x > 1 && y > 2) hits.push(`"${boxes[a]!.text}" × "${boxes[b]!.text}"`);
      }
    }
    return hits;
  });
}

for (const width of WIDTHS) {
  test.describe(`fark vitrini · ${width}px`, { tag: ["@public"] }, () => {
    test.use({ viewport: { width, height: 900 } });

    test("ana sayfa: akordeonun sahneleri (radyo, kırmızı kalem, sınıfla paylaş) görünür, taşma yok, 44 px, radyo çalar, üçüncü taraf istek yok", async ({
      page,
      baseURL,
    }) => {
      test.setTimeout(90_000);
      const origin = new URL(baseURL!).origin;
      const requests = watchRequests(page, origin);
      await page.goto("/", { waitUntil: "domcontentloaded" });

      // Faz 9 (20 Kasım 2026): kartlar "Aynı not, iki ayrı sonuç" akordeonunun sahneleri; bir anda tek sahne açık.
      const section = page.locator("section#farklar");
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByTestId("fark-vitrini")).toHaveCount(0);
      const cards = {
        radio: { id: "sinav-radyosu", card: section.getByTestId("showcase-radio") },
        pen: { id: "kirmizi-kalem", card: section.getByTestId("showcase-red-pen") },
        share: { id: "sinifla-paylas", card: section.getByTestId("showcase-class-share") },
      };
      // Ses yalnız tıklamadan sonra: açılışta hiçbir .mp3 isteği yok.
      expect(requests.audio()).toEqual([]);

      for (const [name, { id, card }] of Object.entries(cards)) {
        const trigger = page.locator(`#fk-trigger-${id}`);
        await trigger.scrollIntoViewIfNeeded();
        // Geliştirme sunucusunda sayfa canlanmadan gelen tıklama boşa gider: açılana kadar tıklanır.
        await expect(async () => {
          if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
          await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1500 });
        }).toPass({ timeout: 30_000 });
        await card.scrollIntoViewIfNeeded();
        await expect(card, name).toBeVisible();
        await expect(section.locator('[data-testid="fark-scene"]'), name).toHaveCount(1);
        const box = (await card.boundingBox())!;
        expect(box.x, name).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, name).toBeLessThanOrEqual(width + 1);
        const inner = await card.evaluate((node) => node.scrollWidth - node.clientWidth);
        expect(inner, `${name} iç taşma`).toBeLessThanOrEqual(0);
        await expectTargets(card, name);
        await expectTextFloor(card, name);
        expect(await overflow(page), name).toBeLessThanOrEqual(0);
        if (name === "pen") await expect(card.getByTestId("red-pen-lost")).toBeVisible();
        if (name === "share") {
          await expect(card.locator('[data-testid="share-qr"] svg')).toBeVisible();
          await expect(card.getByText("+50 Bonus Kredi")).toBeVisible();
        }
      }
      // Paylaşımın adımları açılır.
      await cards.share.card.getByText("Paylaşınca ne olur?").click();
      await expect(cards.share.card.getByText(/konu testini bitirince sen \+50 kredi kazanırsın/)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // Kırmızı kalem: öğrencinin kâğıdına geç, geri dön.
      const penTrigger = page.locator("#fk-trigger-kirmizi-kalem");
      await penTrigger.click();
      await expect(penTrigger).toHaveAttribute("aria-expanded", "true");
      await cards.pen.card.getByRole("button", { name: "Öğrencinin kâğıdı" }).click();
      await expect(cards.pen.card.getByTestId("red-pen-lost")).toHaveCount(0);
      await cards.pen.card.getByRole("button", { name: "Kırmızı kalemle" }).click();
      await expect(cards.pen.card.getByTestId("red-pen-lost")).toBeVisible();

      // Radyo: sahne açılınca da ses yüklenmez; yalnız düğmeye basınca.
      const radioTrigger = page.locator("#fk-trigger-sinav-radyosu");
      await radioTrigger.click();
      await expect(radioTrigger).toHaveAttribute("aria-expanded", "true");
      expect(requests.audio()).toEqual([]);
      const radioCard = cards.radio.card;
      const toggle = radioCard.getByTestId("radio-toggle");
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toHaveText(/Örnek Radyo Akışını Dinle/);
      // Geliştirme sunucusunda sayfa sunucu çiziminden sonra canlanır; canlanmadan gelen tıklama boşa gider. Durum
      // değişene kadar tıklanır (çalınca düğme "Duraklat"a döner, sonraki tur tıklamaz).
      await expect(async () => {
        if ((await radioCard.getAttribute("data-state")) !== "playing") await toggle.click();
        await expect(radioCard).toHaveAttribute("data-state", "playing", { timeout: 1500 });
      }).toPass({ timeout: 30_000 });
      await expect(toggle).toHaveText(/Duraklat/);
      await expect.poll(() => requests.audio().length).toBeGreaterThan(0);
      for (const url of requests.audio()) expect(new URL(url).origin).toBe(origin);
      await toggle.click();
      await expect(radioCard).toHaveAttribute("data-state", "paused");
      await expect(toggle).toHaveText(/Örnek Radyo Akışını Dinle/);

      expect(requests.thirdParty()).toEqual([]);
    });

    test("/ornek: 'Kayıtlı Hesapta Açılan Süper Güçler' şeridi; /ozellikler: beş yeni satır", async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      const origin = new URL(baseURL!).origin;
      const requests = watchRequests(page, origin);
      await page.goto("/ornek", { waitUntil: "domcontentloaded" });
      const strip = page.getByTestId("super-gucler");
      await strip.scrollIntoViewIfNeeded();
      await expect(strip.getByRole("heading", { name: "Kayıtlı Hesapta Açılan Süper Güçler" })).toBeVisible();
      for (const id of ["showcase-radio", "showcase-red-pen"]) {
        const card = strip.getByTestId(id);
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        const box = (await card.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        await expectTargets(card, id);
      }
      await expect(strip.getByTestId("showcase-class-share")).toHaveCount(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(requests.audio()).toEqual([]);

      await page.goto("/ozellikler", { waitUntil: "domcontentloaded" });
      const table = page.getByTestId("advantage-comparison");
      for (const feature of [
        "Sınıf Klonlama +50 Kredi",
        "QR Kodlu Sınav Sabahı PDF'i",
        "Kesintisiz Sınav Radyosu",
        "Kırmızı Kalemli Hoca Puanlaması",
        "Sınav Sonrası Başarı Karnesi",
      ]) {
        const row = table.getByRole("rowheader", { name: new RegExp(feature.replace(/[+()]/g, "\\$&")) });
        await row.scrollIntoViewIfNeeded();
        await expect(row).toBeVisible();
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(requests.thirdParty()).toEqual([]);
    });
  });
}

test.describe("fark vitrini · geniş yedek yazı tipi", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("390 px + Verdana: altı başlığın metni ve sahnesi üst üste binmez, taşmaz", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "*, *::before, *::after { font-family: Verdana, sans-serif !important; }" });
    const section = page.locator("section#farklar");
    await section.scrollIntoViewIfNeeded();
    // Faz 9: her başlık açılır; açık başlığın kendisi (başlık + metin + sahne) ölçülür.
    for (const id of ["notuna-sadik", "sinav-radyosu", "kirmizi-kalem", "ikiz-soru", "ikiz-sinav", "sinifla-paylas"]) {
      const trigger = page.locator(`#fk-trigger-${id}`);
      await trigger.scrollIntoViewIfNeeded();
      await expect(async () => {
        if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1500 });
      }).toPass({ timeout: 30_000 });
      const item = page.locator(`.fk-item[data-item="${id}"]`);
      // Paylaşımın adımları açıkken de ölç.
      if (id === "sinifla-paylas") await item.getByText("Paylaşınca ne olur?").click();
      await item.scrollIntoViewIfNeeded();
      expect(await textOverlaps(item), id).toEqual([]);
      const inner = await item.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(inner, `${id} iç taşma`).toBeLessThanOrEqual(0);
      const box = (await item.boundingBox())!;
      expect(box.x + box.width, id).toBeLessThanOrEqual(391);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
