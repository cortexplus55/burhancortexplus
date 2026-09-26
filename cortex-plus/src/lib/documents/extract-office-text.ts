import "server-only";
import { unzipSync, strFromU8 } from "fflate";

/**
 * Word ve PowerPoint belgelerinden metin çıkarır.
 *
 * Neden var: Astra vitrininde "slaytlar ve ders kitapları" diyor; bizde
 * `.pptx` ve `.docx` yüklenemiyordu bile. Öğrenciye "slaytı PDF'e çevir"
 * dedirtmek, ürünün işini öğrenciye yaptırmak.
 *
 * Model çağrısı YOK. İkisi de içinde XML taşıyan zip dosyaları; metin zaten
 * orada duruyor, okunması yeter. Fotoğraf ve taranmış PDF'ten farkı bu —
 * onlarda metin yok, burada var.
 */

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const OFFICE_MIME_TYPES = [DOCX, PPTX];

export function isOfficeDocument(mimeType: string | null | undefined): boolean {
  return OFFICE_MIME_TYPES.includes(mimeType ?? "");
}

/**
 * Zip bombası koruması.
 *
 * `unzipSync` her girdiyi belleğe açıyor. 15 MB'lık bir yükleme, sıkıştırma
 * oranı yüksek bir dosyada gigabaytlara açılabilir; sınır olmadan tek bir
 * belge süreci düşürürdü.
 */
const MAX_UNZIPPED_BYTES = 80 * 1024 * 1024;

/** XML varlıkları — çıkarılan metin ekrana ve gömmeye gidiyor, ham kalmamalı. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    // `&amp;` en sona: önce açılırsa `&amp;lt;` iki kez çözülür.
    .replace(/&amp;/g, "&");
}

function cleanup(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Word: paragraf sınırları satır sonu, açık sayfa sonları sayfa sınırı.
 *
 * `.docx` içinde SAYFA diye bir şey yok — sayfalama yazıcıya/ekrana göre
 * hesaplanıyor. Elle konmuş sayfa sonları tek gerçek işaret; onlar da yoksa
 * belge tek sayfa sayılıyor. Uydurma sayfa bölmek, "3. sayfada yazıyor"
 * diyen bir alıntıyı yanlış yere göndermek olurdu.
 */
function readDocx(files: Record<string, Uint8Array>): string[] {
  const doc = files["word/document.xml"];
  if (!doc) return [];

  const xml = strFromU8(doc)
    .replace(/<w:br[^>]*w:type="page"[^>]*\/?>/g, "\u000c")
    .replace(/<\/w:p>/g, "\n");

  const text = decodeEntities(xml.replace(/<[^>]+>/g, ""));
  return text
    .split("\u000c")
    .map(cleanup)
    .filter((page) => page.length > 0);
}

/**
 * PowerPoint: bir slayt bir sayfa.
 *
 * Sıra dosya adındaki sayıdan geliyor; zip girdileri sözlük sırasında
 * geliyor ve orada `slide10` `slide2`'den önce çıkıyor. Sırayı bozmak,
 * slaytları karışık bir kaynağa çevirirdi.
 */
function readPptx(files: Record<string, Uint8Array>): string[] {
  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const order = (name: string) => Number(name.match(/slide(\d+)\.xml$/)![1]);
      return order(a) - order(b);
    });

  return slides
    .map((name) => {
      // `<a:t>` metin çalıştırmaları; aralarına boşluk konmazsa kelimeler
      // birbirine yapışıyor.
      const xml = strFromU8(files[name]).replace(/<\/a:p>/g, "\n");
      return cleanup(decodeEntities(xml.replace(/<[^>]+>/g, " ")));
    })
    .filter((page) => page.length > 0);
}

export type OfficeReadResult = {
  pages: string[];
  ok: boolean;
  reason?: "unsupported" | "corrupt" | "too_large" | "empty";
};

export function extractOfficeText(
  buffer: Buffer,
  mimeType: string,
): OfficeReadResult {
  if (!isOfficeDocument(mimeType)) {
    return { pages: [], ok: false, reason: "unsupported" };
  }

  let files: Record<string, Uint8Array>;
  try {
    // fflate unzipSync artık filter kabul etmiyor; açtıktan sonra
    // yalnız metin parçalarını tutup boyutu sınırlıyoruz.
    const all = unzipSync(new Uint8Array(buffer));
    let unzipped = 0;
    files = {};
    for (const [name, data] of Object.entries(all)) {
      const wanted =
        name === "word/document.xml" || /^ppt\/slides\/slide\d+\.xml$/.test(name);
      if (!wanted) continue;
      unzipped += data.byteLength;
      if (unzipped > MAX_UNZIPPED_BYTES) throw new Error("too_large");
      files[name] = data;
    }
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "too_large";
    return { pages: [], ok: false, reason: tooLarge ? "too_large" : "corrupt" };
  }

  const pages = mimeType === DOCX ? readDocx(files) : readPptx(files);
  if (!pages.length) return { pages: [], ok: false, reason: "empty" };
  return { pages, ok: true };
}
