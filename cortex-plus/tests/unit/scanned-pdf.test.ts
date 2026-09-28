import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

/*
  Metin katmanı olmayan PDF — tarayıcıdan ya da telefondan çıkmış her ders
  notu — `extractText` tarafından okunamıyordu ve öğrenci "metin katmanı olan
  bir PDF deneyin" uyarısı alıyordu. Türkiye'de dolaşan ders PDF'lerinin
  büyük kısmı tam olarak bu.

  Düzeltme sayfayı görüntüye çevirip zaten çalışan fotoğraf okuyucusundan
  geçiriyor. Bu dosya üç kırılgan yeri tutuyor:

  1. Çizim tek istekte sınırlı sayfa işler, sonraki tur fiziksel sayfa
     numarasından devam edebilir.
  2. Tek bir okunamayan sayfa belgeyi düşürmüyor.
  3. Okunamayan sayfa kota YAKMIYOR.
*/

process.env.OPENAI_API_KEY = "test-key";

const mocks = vi.hoisted(() => ({ create: vi.fn(), moderate: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
  },
}));
vi.mock("@/lib/ai/moderation", () => ({ moderate: mocks.moderate }));

const { renderPdfPages, MAX_SCAN_PAGES } = await import(
  "@/lib/documents/render-pdf-pages"
);
const { extractImagePages } = await import("@/lib/documents/extract-image-text");
const { extractText } = await import("@/lib/documents/extract-text");

/** Yalnızca çizim operatörleri — hiç metin yok, yani taranmış sayfa gibi. */
function scannedPdf(pageCount: number) {
  const content = deflateSync(Buffer.from("0 0 0 rg 20 20 260 160 re f"));
  const stream = Buffer.concat([
    Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`),
    content,
    Buffer.from("\nendstream"),
  ]);

  const contentId = 3 + pageCount;
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`),
    ...Array.from({ length: pageCount }, () =>
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents ${contentId} 0 R >>`,
      ),
    ),
    stream,
  ];

  const parts = [Buffer.from("%PDF-1.7\n")];
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
  }
  const xref = Buffer.concat(parts).length;
  const size = objects.length + 1;
  parts.push(
    Buffer.from(
      `xref\n0 ${size}\n0000000000 65535 f \n${offsets
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join("")}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  return Buffer.concat(parts);
}

const LONG = "Bir üçgenin iç açıları toplamı 180 derecedir. Kanıtı şöyledir:";
const reply = (content: string) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 900, completion_tokens: 40 },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.moderate.mockResolvedValue({ action: "allow", categories: [] });
});

describe.sequential("taranmış PDF render (pdfjs tek iş parçacığı)", () => {
describe("taranmış PDF tanınıyor", () => {
  /* Bu, düzeltmenin dayandığı olgu: metin katmanı olmayan PDF `extractText`
     tarafından okunamıyor. Okunabilseydi çizime hiç gerek olmazdı. */
  it("metin çıkarma bu belgede başarısız", async () => {
    const result = await extractText(scannedPdf(2), "application/pdf");
    expect(result.ok).toBe(false);
  }, 30_000);
});

describe("sayfa çizimi", () => {
  it("her sayfayı PNG olarak çiziyor", async () => {
    const rendered = await renderPdfPages(scannedPdf(2));
    expect(rendered.total).toBe(2);
    expect(rendered.pages).toHaveLength(2);
    for (const page of rendered.pages) {
      expect(page.png.subarray(1, 4).toString()).toBe("PNG");
      expect(page.png.byteLength).toBeGreaterThan(100);
      expect(page.pageNumber).toBeGreaterThan(0);
    }
  }, 30_000);

  /* Tek tur kaynak sınırını korurken gerçek toplam ve sonraki aralık elde. */
  it("uzun belgeden sınırlı sayfa çiziyor ve gerçek sayfa sayısını söylüyor", async () => {
    const rendered = await renderPdfPages(scannedPdf(MAX_SCAN_PAGES + 3), 4);
    expect(rendered.pages).toHaveLength(4);
    expect(rendered.total).toBe(MAX_SCAN_PAGES + 3);
  }, 30_000);

  it("99 sayfalık taranmış PDF'in son fiziksel sayfasını ayrı turda çiziyor", async () => {
    const rendered = await renderPdfPages(scannedPdf(99), 6, 95);
    expect(rendered.total).toBe(99);
    expect(rendered.pages).toHaveLength(5);
    expect(rendered.pages[4].png.subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);

  it("tavan varsayılanı zaman bütçesine göre seçilmiş", () => {
    expect(MAX_SCAN_PAGES).toBeLessThanOrEqual(20);
  });
});

describe("CCITT G4 ofis taraması (fixture)", () => {
  const fixture = readFileSync(
    path.join("tests", "fixtures", "ccitt-scan-3page.pdf"),
  );

  it("eksik wasm yolu taramayı boş sayar (scanRenderFailed veya düşük inkRatio)", async () => {
    const rendered = await renderPdfPages(fixture, 1, 1, {
      pdfjsOverrides: { wasmUrl: "/nonexistent/wasm/" },
    });
    expect(rendered.pages).toHaveLength(1);
    const page = rendered.pages[0]!;
    expect(page.hasImageContent).toBe(true);
    expect(
      page.scanRenderFailed === true || page.inkRatio < 0.002,
    ).toBe(true);
  }, 60_000);

  it("wasm ile sayfa görüntüsü ve mürekkep metriği üretir", async () => {
    const rendered = await renderPdfPages(fixture, 3);
    expect(rendered.total).toBe(3);
    expect(rendered.pages).toHaveLength(3);
    for (const page of rendered.pages) {
      expect(page.hasImageContent).toBe(true);
      expect(page.scanRenderFailed).toBe(false);
      expect(page.inkRatio).toBeGreaterThan(0.01);
      expect(page.png.subarray(1, 4).toString()).toBe("PNG");
      expect(page.png.byteLength).toBeGreaterThan(2_000);
    }
  }, 60_000);
});

describe("çok sayfa okuma", () => {
  const png = () => Buffer.from("fake-png");

  it("okunan sayfaları sırasıyla döndürüyor", async () => {
    mocks.create
      .mockResolvedValueOnce(reply(`${LONG} bir`))
      .mockResolvedValueOnce(reply(`${LONG} iki`));

    const result = await extractImagePages([png(), png()]);
    expect(result.readCount).toBe(2);
    expect(result.pages[0]).toContain("bir");
    expect(result.pages[1]).toContain("iki");
  });

  /* Taranmış bir kitabın boş arka yüzü ya da tek bir bulanık sayfa yüzünden
     yüz sayfalık bir kaynağı reddetmek yanlış olurdu. */
  it("okunamayan tek sayfa belgeyi düşürmüyor", async () => {
    mocks.create
      .mockResolvedValueOnce(reply("[METIN_YOK]"))
      .mockResolvedValueOnce(reply("[METIN_YOK]"))
      .mockResolvedValueOnce(reply(LONG));

    const result = await extractImagePages([png(), png()]);
    expect(result.readCount).toBe(1);
    expect(result.pages.filter(Boolean)).toHaveLength(1);
  });

  /* Denetimden dönen bir belgede kalan sayfaları okumaya devam etmenin
     anlamı yok; fatura da büyümesin. */
  it("denetimden dönen belgede okumayı bırakıyor", async () => {
    mocks.moderate.mockResolvedValue({ action: "block", categories: ["x"] });
    const result = await extractImagePages([png(), png(), png()]);
    expect(result.blocked).toBe(true);
    expect(result.readCount).toBe(0);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("bütün denemelerin jetonlarını topluyor", async () => {
    mocks.create.mockResolvedValue(reply(LONG));
    const result = await extractImagePages([png(), png()]);
    expect(result.tokensIn).toBe(1800);
  });
});

describe("boru hattı beklenmeyen hatada da kota yakmıyor", () => {
  const source = readFileSync("src/lib/rag/pipeline.ts", "utf8");

  /* Sayaç `try` bloğunun İÇİNDE olsaydı `catch` ona erişemez ve düşen her
     istek öğrencinin hakkından bir sayfa götürürdü. */
  it("sayaç try bloğunun dışında", () => {
    expect(source.indexOf("let claimedPages = 0")).toBeLessThan(
      source.indexOf("  try {"),
    );
  });

  it("catch bloğu da iade ediyor", () => {
    expect(source).toContain('return failAndRelease("processing_failed")');
  });
});

}); // describe.sequential render pdf integration
