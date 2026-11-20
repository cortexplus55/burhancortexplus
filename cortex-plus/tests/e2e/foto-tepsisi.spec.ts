import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/*
  Sayfa tepsisi ve tek küçültücü (20 Kasım 2026). Kurulumun materyal adımında (fikstür `/e2e/sihirbaz?adim=material`)
  ve telefondan yükleme sayfasında (`/yukle/…?amac=hazirlik`, bağlantı ucu taklit) yalnız fotoğraftan oluşan seçim önce
  tepsiye girer: önizleme, sıra, silme; "Sayfaları yükle" tepsiyi sırasıyla bugünkü motora verir (fotoğraf seti → tek
  PDF). Ölçü: 390 ve 1440 px'te sayfa yana kaymaz, tepsideki dokunma hedefleri en az 44 px. Gerçek sunucu çağrısı yok:
  bütün /api istekleri taklit (yükleme hazırlığı 401 döner; istenen dosyanın adı ve boyu kayda geçer).
*/

const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

const FIXTURES = [
  "Defter-Kalp-Uyari-Iletimi-EKG.jpg",
  "Defter-Nefron-Idrar-Olusumu.jpg",
  "Kart-Hipofiz-Hormonlari.jpg",
  "Tahta-Aksiyon-Potansiyeli.jpg",
].map((name) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`tests/fixtures/sinav-seti/${name}`) }));

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Tepsideki görünür düğmelerin en küçük yüksekliği ve genişliği. */
async function smallestTarget(page: Page): Promise<{ height: number; width: number }> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-photo-tray] button")) as HTMLElement[];
    const boxes = nodes.filter((node) => node.offsetParent !== null).map((node) => node.getBoundingClientRect());
    return {
      height: Math.min(...boxes.map((box) => Math.round(box.height))),
      width: Math.min(...boxes.map((box) => Math.round(box.width))),
    };
  });
}

async function smallestText(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[data-photo-tray] *")) as HTMLElement[];
    const sizes = nodes
      .filter((node) => node.offsetParent !== null && node.childNodes.length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent?.trim()))
      .map((node) => parseFloat(getComputedStyle(node).fontSize));
    return Math.min(...sizes);
  });
}

async function settled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

type Prepared = { fileName: string; mimeType: string; sizeBytes: number };

/** Bütün /api istekleri taklit; yükleme hazırlığının gövdesi kaydedilir. */
async function stubApi(page: Page, prepared: Prepared[]) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.url().includes("/api/documents/upload/prepare")) prepared.push(JSON.parse(request.postData() ?? "{}"));
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Oturum gerekli" }) });
  });
}

test.describe("sayfa tepsisi", { tag: ["@public"] }, () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalı */
      }
    });
  });

  for (const size of SIZES) {
    test(`kurulum ${size.width} px: fotoğraflar önce tepsiye, sırala ve sil, tek PDF olarak motora`, async ({ page }) => {
      const prepared: Prepared[] = [];
      await stubApi(page, prepared);
      await page.setViewportSize(size);
      await page.goto("/e2e/sihirbaz?adim=material");
      await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 60_000 });
      await settled(page);
      const zone = page.locator(".apw-drop");
      await expect(zone.locator("input[type=file]")).toHaveCount(1);
      await expect(page.locator('input[capture="environment"]')).toHaveCount(1);

      await zone.locator("input[type=file]").setInputFiles(FIXTURES);
      const tray = page.getByRole("region", { name: "Ders notu sayfaları" });
      await expect(tray).toBeVisible();
      await expect(tray.getByRole("listitem")).toHaveCount(4);
      // Önizlemeler gerçekten çizildi (küçük JPEG, tam boy değil).
      await expect
        .poll(() => tray.locator("img").evaluateAll((images) => images.filter((image) => (image as HTMLImageElement).naturalWidth > 0).length))
        .toBe(4);
      const previewWidths = await tray.locator("img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth));
      expect(Math.max(...previewWidths)).toBeLessThanOrEqual(320);
      // Yükleme başlamadı, "Devam et" yok.
      expect(prepared).toEqual([]);
      await expect(page.getByRole("button", { name: /^Devam et/ })).toHaveCount(0);

      expect(await overflow(page)).toBeLessThanOrEqual(1);
      const target = await smallestTarget(page);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(await smallestText(page)).toBeGreaterThanOrEqual(12);
      await page.screenshot({ path: `test-results/foto-tepsisi-${size.width}.png` }).catch(() => undefined);

      await tray.getByRole("button", { name: "4. sayfayı önceye taşı" }).click();
      await expect(tray.getByRole("button", { name: "3. sayfayı önceye taşı" })).toBeFocused();
      await tray.getByRole("button", { name: "1. sayfayı kaldır" }).click();
      await expect(tray.getByRole("listitem")).toHaveCount(3);
      await expect(tray.locator("img").first()).toHaveAttribute("alt", "Sayfa 1");
      expect(await overflow(page)).toBeLessThanOrEqual(1);

      await tray.getByRole("button", { name: "Sayfaları yükle (3)" }).click();
      await expect(tray).toHaveCount(0);
      // Motor bugünkü gibi: üç fotoğraf tek taranmış PDF olarak yüklenmeye çalışıldı.
      await expect.poll(() => prepared.length, { timeout: 30_000 }).toBeGreaterThan(0);
      expect(prepared[0]).toMatchObject({ fileName: "Ders Notu Fotoğrafları (3 Sayfa).pdf", mimeType: "application/pdf" });
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test("kurulum: belge içeren seçim tepsiye girmeden hemen yüklenir", async ({ page }) => {
    const prepared: Prepared[] = [];
    await stubApi(page, prepared);
    await page.setViewportSize(SIZES[0]);
    await page.goto("/e2e/sihirbaz?adim=material");
    await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 60_000 });
    await settled(page);
    await page.locator(".apw-drop input[type=file]").setInputFiles([
      { name: "Ders notu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 örnek") },
      FIXTURES[0]!,
    ]);
    await expect.poll(() => prepared.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByRole("region", { name: "Ders notu sayfaları" })).toHaveCount(0);
  });

  test("ölçü: 4000×3000 telefon fotoğrafları (4-8 MB) sayfa başına birkaç yüz KB'lık PDF olarak gider", async ({ page }) => {
    const prepared: Prepared[] = [];
    await stubApi(page, prepared);
    await page.setViewportSize(SIZES[1]);
    await page.goto("/e2e/sihirbaz?adim=material");
    await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 60_000 });
    await settled(page);
    // Sentetik telefon fotoğrafı: çizgili kâğıt, yazı, ışık geçişi ve sensör gürültüsü. İki tür: gürültülü (loş ışık,
    // JPEG %98, ~8 MB) ve sade (iyi ışık, JPEG %95, ~4 MB); sayfa baştan sona yazılı (gerçek defter sayfasından yoğun).
    for (const kind of [
      { label: "gürültülü", noise: 22, quality: 0.98, pageLimitKb: 800 },
      { label: "sade", noise: 6, quality: 0.95, pageLimitKb: 600 },
    ]) {
      const photos = await makePhotos(page, kind.noise, kind.quality);
      const files = photos.map((base64, index) => ({ name: `IMG_20261120_0${index + 1}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") }));
      const originalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
      const before = prepared.length;
      await page.locator(".apw-drop input[type=file]").setInputFiles(files);
      const tray = page.getByRole("region", { name: "Ders notu sayfaları" });
      await expect(tray.getByRole("listitem")).toHaveCount(2);
      await tray.getByRole("button", { name: "Sayfaları yükle (2)" }).click();
      await expect.poll(() => prepared.length, { timeout: 60_000 }).toBeGreaterThan(before);
      const pdf = prepared[before]!;
      expect(pdf.fileName).toBe("Ders Notu Fotoğrafları (2 Sayfa).pdf");
      const perPage = pdf.sizeBytes / 2;
      console.log(
        `[ölçü] ${kind.label}: özgün ${(originalBytes / 2 / 1024 / 1024).toFixed(1)} MB/sayfa → set PDF ${(perPage / 1024).toFixed(0)} KB/sayfa (%${((1 - pdf.sizeBytes / originalBytes) * 100).toFixed(1)} küçük)`,
      );
      expect(originalBytes / 2).toBeGreaterThan(2 * 1024 * 1024);
      expect(perPage).toBeLessThan(kind.pageLimitKb * 1024);
      await page.waitForTimeout(3_000);
    }
  });

  for (const size of SIZES) {
    test(`telefondan yükleme ${size.width} px: hazırlıkta fotoğraflar tepsiye, sonra tek gönderim`, async ({ page }) => {
      const sent: string[] = [];
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        if (request.method() === "GET" && /\/api\/uploads\/phone\/e2e-tepsi$/.test(request.url())) {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true, many: true }) });
          return;
        }
        if (request.method() === "POST" && /\/api\/uploads\/phone\/e2e-tepsi$/.test(request.url())) {
          const name = /filename="([^"]+)"/.exec(request.postDataBuffer()?.toString("utf8") ?? "")?.[1] ?? "dosya";
          sent.push(name);
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ documentId: `doc-${sent.length}`, fileName: name }) });
          return;
        }
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      });
      await page.setViewportSize(size);
      await page.goto("/yukle/e2e-tepsi?amac=hazirlik");
      await expect(page.getByRole("heading", { name: "Ders notunu yükle" })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("button", { name: "📷 Fotoğraf çek" })).toBeVisible();
      await page.locator(".cp-phone-card input[type=file]:not([capture])").setInputFiles(FIXTURES.slice(0, 3));
      const tray = page.getByRole("region", { name: "Ders notu sayfaları" });
      await expect(tray.getByRole("listitem")).toHaveCount(3);
      expect(sent).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      const target = await smallestTarget(page);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
      await expect
        .poll(() => tray.locator("img").evaluateAll((images) => images.filter((image) => (image as HTMLImageElement).naturalWidth > 0).length))
        .toBe(3);
      await page.screenshot({ path: `test-results/foto-tepsisi-telefon-${size.width}.png` }).catch(() => undefined);

      await tray.getByRole("button", { name: "Sayfaları yükle (3)" }).click();
      await expect(page.getByText("1 dosya gönderildi.", { exact: false })).toBeVisible({ timeout: 30_000 });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain("Ders Notu Fotoğrafları (3 Sayfa)");
    });
  }
});

test.describe("sayfa tepsisi · dokunmatik telefon", { tag: ["@public"] }, () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kurulumda 'Fotoğraf çek' arka kamerayı açar; her çekim tepsiye bir sayfa, 'Bir sayfa daha ekle' kamerayı yeniden açar", async ({ page }) => {
    const prepared: Prepared[] = [];
    await stubApi(page, prepared);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cortex-gamification-v1", "1");
      } catch {
        /* depolama kapalı */
      }
    });
    await page.goto("/e2e/sihirbaz?adim=material");
    await expect(page.getByRole("heading", { name: "Çalışma materyalini ekle" })).toBeVisible({ timeout: 60_000 });
    await settled(page);
    const camera = page.getByRole("button", { name: "📷 Fotoğraf çek" });
    await expect(camera).toBeVisible();
    expect((await camera.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    let chooser = page.waitForEvent("filechooser");
    await camera.tap();
    let picked = await chooser;
    expect(await picked.element().getAttribute("capture")).toBe("environment");
    expect(picked.isMultiple()).toBe(false);
    await picked.setFiles(FIXTURES[0]!);
    const tray = page.getByRole("region", { name: "Ders notu sayfaları" });
    await expect(tray.getByRole("listitem")).toHaveCount(1);
    await expect(tray.getByRole("button", { name: "Sayfayı yükle" })).toBeVisible();

    chooser = page.waitForEvent("filechooser");
    await tray.getByRole("button", { name: "📷 Bir sayfa daha ekle" }).tap();
    picked = await chooser;
    await picked.setFiles(FIXTURES[1]!);
    await expect(tray.getByRole("listitem")).toHaveCount(2);
    expect(prepared).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    await tray.getByRole("button", { name: "Sayfaları yükle (2)" }).tap();
    await expect.poll(() => prepared.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(prepared[0]!.fileName).toBe("Ders Notu Fotoğrafları (2 Sayfa).pdf");
  });
});

/** Tarayıcıda iki sentetik defter fotoğrafı (4000×3000) üretir; base64. */
async function makePhotos(page: Page, noiseLevel: number, quality: number): Promise<string[]> {
  return page.evaluate(
    async ({ noiseLevel, quality }) => {
      const make = async (seed: number) => {
        const width = 4000;
        const height = 3000;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        const light = context.createLinearGradient(0, 0, width, height);
        light.addColorStop(0, "#f4efe2");
        light.addColorStop(1, "#cfc6b2");
        context.fillStyle = light;
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "#9db6d2";
        context.lineWidth = 3;
        for (let y = 180; y < height; y += 90) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width, y);
          context.stroke();
        }
        let state = seed;
        const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
        context.fillStyle = "#1d2742";
        context.font = "italic 62px serif";
        const letters = "abcçdefgğhıijklmnoöprsştuüvyz=+()";
        for (let y = 165; y < height - 60; y += 90) {
          let x = 200 + random() * 60;
          while (x < width - 260) {
            const word = Array.from({ length: 3 + Math.floor(random() * 6) }, () => letters[Math.floor(random() * letters.length)]).join("");
            context.fillText(word, x, y + (random() - 0.5) * 6);
            x += context.measureText(word).width + 30 + random() * 30;
          }
        }
        const image = context.getImageData(0, 0, width, height);
        const data = image.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (random() - 0.5) * noiseLevel;
          data[i] += noise;
          data[i + 1] += noise;
          data[i + 2] += noise;
        }
        context.putImageData(image, 0, 0);
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", quality));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(text);
      };
      return [await make(7), await make(11)];
    },
    { noiseLevel, quality },
  );
}
