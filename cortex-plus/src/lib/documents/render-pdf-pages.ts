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

export type RenderedPdf = {
  /** PNG olarak çizilmiş sayfalar, sırayla. */
  pages: Buffer[];
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

export async function renderPdfPages(
  buffer: Buffer,
  maxPages = MAX_SCAN_PAGES,
  startPage = 1,
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
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  try {
    const pdf = await task.promise;
    const first = Math.max(1, Math.trunc(startPage));
    const last = Math.min(pdf.numPages, first + Math.max(0, Math.trunc(maxPages)) - 1);
    const pages: Buffer[] = [];

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

      pages.push(canvas.toBuffer("image/png"));
      page.cleanup();
    }

    return { pages, total: pdf.numPages };
  } finally {
    await task.destroy();
  }
}
