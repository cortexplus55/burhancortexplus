import "server-only";

/**
 * Taranmış PDF sayfalarını görüntüye çevirir.
 *
 * Neden gerekiyor: metin katmanı olmayan PDF — yani tarayıcıdan ya da
 * telefondan çıkmış her ders notu — `extractText` tarafından okunamıyor ve
 * öğrenci "metin katmanı olan bir PDF deneyin" uyarısı alıyor. Türkiye'de
 * dolaşan ders PDF'lerinin büyük kısmı tam olarak bu. Sayfayı görüntüye
 * çevirince zaten çalışan fotoğraf okuyucusundan geçebiliyor.
 *
 * Görüntü katmanını çıkarmak yerine sayfanın TAMAMI çiziliyor: taranmış bir
 * sayfa genelde tek bir büyük görüntüdür ama her zaman değil — üstüne
 * damga, kenar notu ya da ayrı bir çizim binmiş olabilir. Sayfayı olduğu
 * gibi çizmek bunların hepsini kapsıyor.
 */

import { pdfjsDocumentOptions } from "@/lib/documents/pdfjs-options";
import { logOpsEvent } from "@/lib/observability/ops-log";

/**
 * Tek istekte çizilecek en fazla sayfa; belgenin toplam sayfa tavanı değil.
 *
 * Kota 50 sayfayı kaldırıyor ama ZAMAN kaldırmıyor: her sayfa ayrı bir
 * görüntü modeli çağrısı. Uzun belgeye sonraki turda startPage verilerek
 * devam edilir; bir sayfa bile sessizce atlanmaz.
 */
/** İlk turda luna ile okunan taranmış sayfa. Üstü hızlı görme modeline gider, atlanmaz. */
export const MAX_SCAN_PAGES = 40;

/**
 * Çizimin uzun kenarı. Görüntü modeli zaten karelere bölüyor; daha büyüğü
 * fatura büyütüyor, daha küçüğü el yazısını okunmaz hâle getiriyor.
 */
const TARGET_LONG_EDGE = 1600;

/**
 * JPEG kalitesi. 20 sayfalık taramada ölçüldü (28 Ekim 2026): PNG kodlaması sayfa başına 89 ms ve
 * 620 KB, JPEG 16 ms ve 170 KB. Metin kenarı bu kalitede okunur kalıyor; telefon fotoğrafı da JPEG.
 */
export const OCR_JPEG_QUALITY = 88;

/** Share of non-near-white pixels below which a page with image ops is blank. */
export const BLANK_INK_RATIO = 0.002;

/** Yol, çizgi ve dolgu bu kadarsa sayfa grafik sayılır (metin katmanı olsa da). */
export const FIGURE_VECTOR_MIN = 30;

const VECTOR_OP_NAMES = [
  "constructPath",
  "stroke",
  "closeStroke",
  "fill",
  "eoFill",
  "fillStroke",
  "eoFillStroke",
  "closeFillStroke",
  "closeEOFillStroke",
  "rectangle",
  "endPath",
] as const;

export function pageHasFigureGraphics(probe: { hasImage: boolean; vectorOps: number }): boolean {
  return probe.hasImage || probe.vectorOps >= FIGURE_VECTOR_MIN;
}

export type RenderedPdfPage = {
  /** OCR görüntüsü, JPEG: kodlaması PNG'den ~5 kat hızlı, dosyası ~3,6 kat küçük (28 Ekim 2026). */
  image: Buffer;
  mime: "image/jpeg";
  /** 0–1 share of non-white pixels at a cheap sample scale. */
  inkRatio: number;
  /** Operator list contained an image paint, or the ink fallback said the page is not blank. */
  hasImageContent: boolean;
  /** Embedded image or enough vector drawing to read the figure. Ink alone does not count. */
  figureGraphics: boolean;
  vectorOps: number;
  /** Image content present but render is ~blank → do not OCR. */
  scanRenderFailed: boolean;
  pageNumber: number;
};

export type RenderedPdf = {
  pages: RenderedPdfPage[];
  /** PDF'in gerçek sayfa sayısı — kesilip kesilmediğini söylemek için. */
  total: number;
};

/** pdfjs-dist 6, Node 20'de olmayan `Promise.withResolvers`'ı kullanıyor. */
function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === "function") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).withResolvers = function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export function inkRatioFromRgba(
  data: Uint8ClampedArray | Buffer,
  threshold = 250,
): number {
  const pixels = Math.floor(data.length / 4);
  if (pixels <= 0) return 0;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! < threshold || data[i + 1]! < threshold || data[i + 2]! < threshold) {
      ink += 1;
    }
  }
  return ink / pixels;
}

async function probePageGraphics(page: {
  getOperatorList: () => Promise<{ fnArray: number[] }>;
}): Promise<{ hasImage: boolean; vectorOps: number }> {
  const empty = { hasImage: false, vectorOps: 0 };
  try {
    const ops = await Promise.race([
      page.getOperatorList(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (!ops) return empty;
    const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const opsTable = OPS as Record<string, number | undefined>;
    const imageCodes = new Set(
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter(
        (n): n is number => typeof n === "number",
      ),
    );
    const vectorCodes = new Set(
      VECTOR_OP_NAMES.map((name) => opsTable[name]).filter((n): n is number => typeof n === "number"),
    );
    let hasImage = false;
    let vectorOps = 0;
    for (const fn of ops.fnArray) {
      if (imageCodes.has(fn)) hasImage = true;
      if (vectorCodes.has(fn)) vectorOps += 1;
    }
    return { hasImage, vectorOps };
  } catch {
    return empty;
  }
}

export async function renderPdfPages(
  buffer: Buffer,
  maxPages = MAX_SCAN_PAGES,
  startPage = 1,
  options?: {
    pdfjsOverrides?: Parameters<typeof pdfjsDocumentOptions>[1];
    /** Called as soon as each page is painted, so OCR can start right away. */
    onPage?: (page: RenderedPdfPage, index: number) => void;
  },
): Promise<RenderedPdf> {
  ensurePromiseWithResolvers();
  /*
    İkisi de çağrı anında yükleniyor.

    `@napi-rs/canvas` yerel bir ikili taşıyor ve bu modül `pipeline.ts`
    üzerinden sohbet ucuna kadar izleniyor. Üstte içe aktarılsaydı hiç PDF
    çizmeyen her istek o ikiliyi de yüklerdi.
  */
  const [{ createCanvas }, { getDocument }] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);
  const warnings: string[] = [];
  const task = getDocument({
    ...pdfjsDocumentOptions(new Uint8Array(buffer), options?.pdfjsOverrides),
    // Collect decode warnings for ops when a blank render slips through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...( { verbosity: 0 } as any ),
  });
  // pdfjs pushes warnings to console.warn; capture via monkey-patch for this call.
  const previousWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
    previousWarn(...args);
  };

  try {
    const pdf = await task.promise;
    const first = Math.max(1, Math.trunc(startPage));
    const last = Math.min(pdf.numPages, first + Math.max(0, Math.trunc(maxPages)) - 1);
    const pages: RenderedPdfPage[] = [];

    for (let number = first; number <= last; number++) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = TARGET_LONG_EDGE / Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = canvas.getContext("2d");
      // Saydam zemin siyah PNG üretiyordu; tarama beyaz kâğıt demek.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasContext: context as any,
        viewport,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas: canvas as any,
      }).promise;

      // getOperatorList BEFORE render hangs on Node 20 (transferToFixedLength).
      // Probe after paint, with a timeout; fall back to ink/size heuristics.
      const graphics = await probePageGraphics(page);
      let hasImageContent = graphics.hasImage;
      const vectorOps = graphics.vectorOps;
      const figureGraphics = pageHasFigureGraphics(graphics);

      // Cheap ink metric at reduced resolution (sample every Nth pixel via getImageData).
      const sampleScale = Math.min(1, 200 / Math.max(canvas.width, canvas.height));
      const sw = Math.max(1, Math.floor(canvas.width * sampleScale));
      const sh = Math.max(1, Math.floor(canvas.height * sampleScale));
      const sample = createCanvas(sw, sh);
      const sctx = sample.getContext("2d");
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, sw, sh);
      sctx.drawImage(canvas, 0, 0, sw, sh);
      const inkRatio = inkRatioFromRgba(sctx.getImageData(0, 0, sw, sh).data);
      const image = canvas.toBuffer("image/jpeg", OCR_JPEG_QUALITY);
      // Ops probe timed out but the bitmap has ink → treat as image content.
      if (!hasImageContent && inkRatio >= BLANK_INK_RATIO) {
        hasImageContent = true;
      }
      // Ops probe timed out and the bitmap is a tiny white PNG — typical
      // failed CCITT/JBIG2 decode. Prefer the render-failed path over "blank".
      if (!hasImageContent && inkRatio < BLANK_INK_RATIO && canvas.toBuffer("image/png").byteLength < 2_000) {
        hasImageContent = true;
      }
      const scanRenderFailed = hasImageContent && inkRatio < BLANK_INK_RATIO;

      if (scanRenderFailed) {
        logOpsEvent("document_parse_failed", {
          documentId: null,
          code: "scan_render_failed",
          pageNumber: number,
          inkRatio,
          warning: warnings.slice(-5).join(" | ").slice(0, 500),
        });
      }

      const rendered = { image, mime: "image/jpeg" as const, inkRatio, hasImageContent, figureGraphics, vectorOps, scanRenderFailed, pageNumber: number };
      pages.push(rendered);
      page.cleanup();
      options?.onPage?.(rendered, pages.length - 1);
      // Let OCR requests started by onPage go out before the next paint.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    return { pages, total: pdf.numPages };
  } finally {
    console.warn = previousWarn;
    await task.destroy();
  }
}
