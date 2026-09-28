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
export const MAX_SCAN_PAGES = 20;

/**
 * Çizimin uzun kenarı. Görüntü modeli zaten karelere bölüyor; daha büyüğü
 * fatura büyütüyor, daha küçüğü el yazısını okunmaz hâle getiriyor.
 */
const TARGET_LONG_EDGE = 1600;

/** Share of non-near-white pixels below which a page with image ops is blank. */
export const BLANK_INK_RATIO = 0.002;

export type RenderedPdfPage = {
  png: Buffer;
  /** 0–1 share of non-white pixels at a cheap sample scale. */
  inkRatio: number;
  /** Operator list contained an image paint. */
  hasImageContent: boolean;
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

async function pageHasImageContent(page: {
  getOperatorList: () => Promise<{ fnArray: number[] }>;
}): Promise<boolean> {
  try {
    const ops = await Promise.race([
      page.getOperatorList(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (!ops) return false;
    const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const imageCodes = new Set(
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter(
        (n): n is number => typeof n === "number",
      ),
    );
    if (imageCodes.size && ops.fnArray.some((fn) => imageCodes.has(fn))) return true;
    return false;
  } catch {
    return false;
  }
}

export async function renderPdfPages(
  buffer: Buffer,
  maxPages = MAX_SCAN_PAGES,
  startPage = 1,
  options?: {
    pdfjsOverrides?: Parameters<typeof pdfjsDocumentOptions>[1];
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
      let hasImageContent = await pageHasImageContent(page);

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
      const png = canvas.toBuffer("image/png");
      // Ops probe timed out but the bitmap has ink → treat as image content.
      if (!hasImageContent && inkRatio >= BLANK_INK_RATIO) {
        hasImageContent = true;
      }
      // Ops probe timed out and the bitmap is a tiny white PNG — typical
      // failed CCITT/JBIG2 decode. Prefer the render-failed path over "blank".
      if (!hasImageContent && inkRatio < BLANK_INK_RATIO && png.byteLength < 2_000) {
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

      pages.push({
        png,
        inkRatio,
        hasImageContent,
        scanRenderFailed,
        pageNumber: number,
      });
      page.cleanup();
    }

    return { pages, total: pdf.numPages };
  } finally {
    console.warn = previousWarn;
    await task.destroy();
  }
}

/** Back-compat: buffers only (legacy callers / pipeline). */
export function renderedPngBuffers(rendered: RenderedPdf): Buffer[] {
  return rendered.pages.map((page) => page.png);
}
