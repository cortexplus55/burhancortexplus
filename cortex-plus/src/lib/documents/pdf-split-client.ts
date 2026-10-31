/*
  50 MB'tan büyük PDF tarayıcıda parçalara bölünür (31 Ekim 2026, pencereli işleme). Depolamanın tek dosya tavanı
  Supabase ücretsiz planda sabit 50 MB; taranmış 400 sayfalık bir kitap 150-300 MB tutabiliyor. Bölme sayfa sınırında
  ve metin katmanını korur (pdf-lib sayfaları içerik ve yazı tipleriyle kopyalar): her parça ayrı belge olur, büyük
  parça pencere pencere yola girer. Kitabın ilk parçası hızlı başlatmayı alır; sonrakiler bekleyen olarak kalır.
*/

/** Bu boyutun üstündeki PDF bölünür (depolamanın tek dosya tavanı). */
export const PDF_SPLIT_THRESHOLD_BYTES = 50 * 1024 * 1024;
/** Hedef parça boyu: tavanın altında pay bırakır (paylaşılan yazı tipi her parçaya kopyalanır). */
export const PDF_SPLIT_PART_BYTES = 40 * 1024 * 1024;
/** Tek parça bu boyu aşarsa yarıya bölünüp yeniden denenir. */
const PART_HARD_MAX_BYTES = 48 * 1024 * 1024;

export type PageRange = { from: number; to: number };

/** Sayfa başına ortalama boyla eşit parçalar; son parça kısa kalabilir. */
export function planPdfSplit(pageCount: number, sizeBytes: number, partBytes = PDF_SPLIT_PART_BYTES): PageRange[] {
  if (pageCount < 1) return [];
  const parts = Math.max(1, Math.ceil(sizeBytes / Math.max(1, partBytes)));
  const per = Math.max(1, Math.ceil(pageCount / parts));
  const out: PageRange[] = [];
  for (let from = 1; from <= pageCount; from += per) out.push({ from, to: Math.min(pageCount, from + per - 1) });
  return out;
}

/** "Kitap.pdf" → "Kitap (s. 1–250).pdf". */
export function pdfPartName(fileName: string, range: PageRange): string {
  const base = fileName.replace(/\.pdf$/i, "");
  return `${base} (s. ${range.from}–${range.to}).pdf`;
}

const tails = new WeakSet<File>();

/** Bölünmüş kitabın ilk parçası değilse true: hızlı başlatma (baş kopyası) yalnız kitabın başına. */
export function isPdfSplitTail(file: File): boolean {
  return tails.has(file);
}

export function needsPdfSplit(file: File): boolean {
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  return pdf && file.size > PDF_SPLIT_THRESHOLD_BYTES;
}

/**
 * PDF'i parçalara böler. Şifreli ya da açılamayan PDF bölünemez: dosyanın kendisi döner (yükleme boyutu yüzünden
 * reddedilir, öğrenciye söylenir). Parça tavanı aşarsa aralık yarıya bölünür.
 */
export async function splitLargePdf(file: File, options: { partBytes?: number } = {}): Promise<File[]> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
    const queue = planPdfSplit(source.getPageCount(), file.size, options.partBytes);
    const done: { range: PageRange; bytes: Uint8Array }[] = [];
    while (queue.length) {
      const range = queue.shift()!;
      const part = await PDFDocument.create({ updateMetadata: false });
      const indices = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from - 1 + i);
      for (const page of await part.copyPages(source, indices)) part.addPage(page);
      const bytes = await part.save({ useObjectStreams: true });
      if (bytes.byteLength > PART_HARD_MAX_BYTES && range.to > range.from) {
        const middle = Math.floor((range.from + range.to) / 2);
        queue.unshift({ from: range.from, to: middle }, { from: middle + 1, to: range.to });
        continue;
      }
      if (bytes.byteLength > PART_HARD_MAX_BYTES) return [file];
      done.push({ range, bytes });
    }
    done.sort((a, b) => a.range.from - b.range.from);
    return done.map(({ range, bytes }, index) => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const out = new File([copy], pdfPartName(file.name, range), { type: "application/pdf" });
      if (index > 0) tails.add(out);
      return out;
    });
  } catch {
    return [file];
  }
}

/** Seçimdeki büyük PDF'leri sırasıyla parçalarına açar; öbür dosyalar yerinde kalır. */
export async function expandLargePdfs(files: readonly File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) out.push(...(needsPdfSplit(file) ? await splitLargePdf(file) : [file]));
  return out;
}
