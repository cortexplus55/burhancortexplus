import "server-only";
import { unzipSync, strFromU8 } from "fflate";

/**
 * Word ve PowerPoint belgelerinden metin ve gömülü resim çıkarır.
 *
 * Neden var: Astra vitrininde "slaytlar ve ders kitapları" diyor; bizde
 * `.pptx` ve `.docx` yüklenemiyordu bile. Öğrenciye "slaytı PDF'e çevir"
 * dedirtmek, ürünün işini öğrenciye yaptırmak.
 *
 * Metin XML'dedir; bu dosya modele gitmez. `ppt/media` ve `word/media`
 * içindeki resimler slayt/sayfa ile eşlenir, Vision okuması çağırana kalır.
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

/** Vision'a gitmeyecek kadar küçük (kurşun simgesi) veya sağlayıcı sınırının üstü. */
export const OFFICE_IMAGE_MIN_BYTES = 1024;
export const OFFICE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const RASTER_MEDIA = /^(?:word|ppt)\/media\/.+\.(png|jpe?g|webp)$/i;

export type OfficeImageMime = "image/png" | "image/jpeg" | "image/webp";

export type OfficeEmbeddedImage = {
  /** `pages` dizisindeki 0 tabanlı sayfa. */
  pageIndex: number;
  name: string;
  mimeType: OfficeImageMime;
  bytes: Uint8Array;
};

function imageToken(index: number): string {
  return `\uE000${index}\uE001`;
}

function stripImageTokens(text: string, onIndex?: (index: number) => void): string {
  return text.replace(/\uE000(\d+)\uE001/g, (_all, rawIndex: string) => {
    onIndex?.(Number(rawIndex));
    return "";
  });
}

function mimeForMedia(path: string): OfficeImageMime | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function isKeptOfficePart(name: string): boolean {
  return (
    name === "word/document.xml" ||
    name === "word/styles.xml" ||
    name === "word/_rels/document.xml.rels" ||
    name === "docProps/app.xml" ||
    /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name) ||
    RASTER_MEDIA.test(name)
  );
}

/** `.rels` hedefi, ilişki dosyasının ait olduğu parçanın klasörüne göredir. */
export function resolveOfficeTarget(relsPath: string, target: string): string | null {
  const decoded = decodeEntities(target).trim();
  if (!decoded || /^[a-z]+:/i.test(decoded)) return null;
  if (decoded.startsWith("/")) return decoded.replace(/^\/+/, "");
  const marker = "/_rels/";
  const at = relsPath.lastIndexOf(marker);
  const base = (at === -1 ? "" : relsPath.slice(0, at)).split("/").filter(Boolean);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") base.pop();
    else base.push(segment);
  }
  return base.join("/");
}

function relationshipTargets(relsXml: string, relsPath: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = match[0];
    const id = /(?:\s)Id="([^"]+)"/i.exec(tag)?.[1];
    const target = /(?:\s)Target="([^"]+)"/i.exec(tag)?.[1];
    const mode = /(?:\s)TargetMode="([^"]+)"/i.exec(tag)?.[1];
    if (!id || !target || /^external$/i.test(mode ?? "")) continue;
    const path = resolveOfficeTarget(relsPath, target);
    if (path && RASTER_MEDIA.test(path)) map.set(id, path);
  }
  return map;
}

function rasterBytes(files: Record<string, Uint8Array>, path: string): Uint8Array | null {
  const data = files[path];
  if (!data) return null;
  if (data.byteLength < OFFICE_IMAGE_MIN_BYTES || data.byteLength > OFFICE_IMAGE_MAX_BYTES) return null;
  if (!mimeForMedia(path)) return null;
  return data;
}

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
 * Word: paragraf sınırları satır sonu; sayfa sınırı belgenin kendi işaretlerinden.
 *
 * `.docx` içinde SAYFA diye bir şey yok — sayfalama yazıcıya/ekrana göre
 * hesaplanıyor. Uydurma sayfa bölmek, "3. sayfada yazıyor" diyen bir alıntıyı
 * yanlış yere göndermek olurdu; bu yüzden yalnız belgede yazan işaretler sayılır:
 *
 * - elle konmuş sayfa sonu (`<w:br w:type="page"/>`),
 * - Word'ün belgeyi en son çizdiğinde her sayfanın başına yazdığı
 *   `<w:lastRenderedPageBreak/>`,
 * - "sayfa öncesi kes" (`pageBreakBefore`) özelliği olan paragraf — doğrudan ya da
 *   stilinden (ör. her ana başlık yeni sayfada).
 *
 * 19 Ekim 2026'ya kadar yalnız ilki sayılıyordu; Word'de yazılmış 6 sayfalık bir not elle
 * sayfa sonu içermediği için "1 sayfa" görünüyor, bütün alıntılar "s. 1"e gidiyordu.
 * Aynı yerde iki işaret (elle sonu izleyen çizim işareti) boş sayfa üretir; boşlar atılır.
 */
function pageBreakStyles(files: Record<string, Uint8Array>): Set<string> {
  const styles = files["word/styles.xml"];
  if (!styles) return new Set();
  const out = new Set<string>();
  for (const match of strFromU8(styles).matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    if (/<w:pageBreakBefore(?:\s*\/>|\s+w:val="(?:1|true|on)"\s*\/>)/.test(match[2])) out.add(match[1]);
  }
  return out;
}

/**
 * Sayfa başına karakter. 25 sayfalık bir ders notu ~2.200 karakter/sayfa;
 * daha yüksek bir bölen aynı dosyayı ~13 sayfa sayıyordu.
 */
export const DOCX_CHARS_PER_PAGE = 2_200;

function declaredDocxPages(files: Record<string, Uint8Array>): number | null {
  const app = files["docProps/app.xml"];
  if (!app) return null;
  const match = strFromU8(app).match(/<Pages>(\d+)<\/Pages>/);
  const count = match ? Number(match[1]) : 0;
  return Number.isFinite(count) && count > 0 ? count : null;
}

function splitNearMiddle(text: string): [string, string] | null {
  const paras = text.split("\n");
  if (paras.length >= 2) {
    let best = 1;
    let bestGap = Number.POSITIVE_INFINITY;
    let acc = 0;
    const total = text.length;
    for (let i = 1; i < paras.length; i += 1) {
      acc += paras[i - 1]!.length + 1;
      const gap = Math.abs(acc - total / 2);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    const left = paras.slice(0, best).join("\n").trim();
    const right = paras.slice(best).join("\n").trim();
    if (left && right) return [left, right];
  }
  if (text.length < 80) return null;
  const mid = Math.floor(text.length / 2);
  const left = text.slice(0, mid).trim();
  const right = text.slice(mid).trim();
  if (!left || !right) return null;
  return [left, right];
}

/** İşaret sayısı gerçek sayfanın altındaysa metni hedef sayfa sayısına yayar. */
export function expandDocxPages(pages: string[], target: number): string[] {
  const out = pages.map((page) => page.trim()).filter(Boolean);
  if (target <= out.length) return out;
  let guard = 0;
  while (out.length < target && guard < target * 2) {
    guard += 1;
    let longest = 0;
    for (let i = 1; i < out.length; i += 1) {
      if (out[i]!.length > out[longest]!.length) longest = i;
    }
    const parts = splitNearMiddle(out[longest]!);
    if (!parts) break;
    out.splice(longest, 1, parts[0], parts[1]);
  }
  return out;
}

function stampDrawings(
  xml: string,
  rels: Map<string, string>,
  files: Record<string, Uint8Array>,
  images: OfficeEmbeddedImage[],
): string {
  return xml.replace(/<(?:a:blip|v:imagedata)\b[^>]*\/?>/gi, (tag) => {
    const id = /(?:r:embed|r:id)="([^"]+)"/i.exec(tag)?.[1];
    if (!id) return "";
    const path = rels.get(id);
    if (!path) return "";
    const bytes = rasterBytes(files, path);
    const mimeType = mimeForMedia(path);
    if (!bytes || !mimeType) return "";
    const index = images.length;
    images.push({ pageIndex: 0, name: path, mimeType, bytes });
    return `\n${imageToken(index)}\n`;
  });
}

/** Sayfa yayılınca resim, yer tutucunun kaldığı parçada kalır; boş metinli resim sayfası durur. */
function placeImageTokens(
  pages: string[],
  images: OfficeEmbeddedImage[],
): { pages: string[]; images: OfficeEmbeddedImage[] } {
  const grouped: OfficeEmbeddedImage[][] = pages.map(() => []);
  const stripped = pages.map((page, pageIndex) =>
    cleanup(
      stripImageTokens(page, (rawIndex) => {
        const image = images[rawIndex];
        if (image) grouped[pageIndex]!.push(image);
      }),
    ),
  );
  const outPages: string[] = [];
  const outImages: OfficeEmbeddedImage[] = [];
  stripped.forEach((text, index) => {
    const here = grouped[index] ?? [];
    if (!text && !here.length) return;
    const pageIndex = outPages.length;
    outPages.push(text);
    for (const image of here) outImages.push({ ...image, pageIndex });
  });
  return { pages: outPages, images: outImages };
}

function readDocx(files: Record<string, Uint8Array>): { pages: string[]; images: OfficeEmbeddedImage[] } {
  const doc = files["word/document.xml"];
  if (!doc) return { pages: [], images: [] };
  const breakStyles = pageBreakStyles(files);
  const relsPath = "word/_rels/document.xml.rels";
  const rels = files[relsPath]
    ? relationshipTargets(strFromU8(files[relsPath]), relsPath)
    : new Map<string, string>();
  const images: OfficeEmbeddedImage[] = [];

  const xml = stampDrawings(strFromU8(doc), rels, files, images)
    .replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:pPr>/g, (head) => {
      const direct = /<w:pageBreakBefore(?:\s*\/>|\s+w:val="(?:1|true|on)"\s*\/>)/.test(head);
      const style = head.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1];
      return direct || (style && breakStyles.has(style)) ? "\u000c" + head : head;
    })
    .replace(/<w:br[^>]*w:type="page"[^>]*\/?>/g, "\u000c")
    .replace(/<w:lastRenderedPageBreak\s*\/>/g, "\u000c")
    .replace(/<\/w:p>/g, "\n");

  const text = decodeEntities(xml.replace(/<[^>]+>/g, ""));
  const marked = text
    .split("\u000c")
    .map((page) => page.trim())
    .filter((page) => page.length > 0);
  const chars = marked.reduce((sum, page) => sum + stripImageTokens(page).replace(/\s+/g, "").length, 0);
  const estimated = Math.max(1, Math.ceil(chars / DOCX_CHARS_PER_PAGE));
  const declared = declaredDocxPages(files);
  const target = Math.max(marked.length, declared ?? estimated);
  return placeImageTokens(expandDocxPages(marked, target), images);
}

/**
 * PowerPoint: bir slayt bir sayfa.
 *
 * Sıra dosya adındaki sayıdan geliyor; zip girdileri sözlük sırasında
 * geliyor ve orada `slide10` `slide2`'den önce çıkıyor. Sırayı bozmak,
 * slaytları karışık bir kaynağa çevirirdi.
 */
function readPptx(files: Record<string, Uint8Array>): { pages: string[]; images: OfficeEmbeddedImage[] } {
  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const order = (name: string) => Number(name.match(/slide(\d+)\.xml$/)![1]);
      return order(a) - order(b);
    });

  const pages: string[] = [];
  const images: OfficeEmbeddedImage[] = [];
  for (const name of slides) {
    const slideNo = name.match(/slide(\d+)\.xml$/)?.[1];
    const relsPath = `ppt/slides/_rels/slide${slideNo}.xml.rels`;
    const rels = files[relsPath]
      ? relationshipTargets(strFromU8(files[relsPath]), relsPath)
      : new Map<string, string>();
    const slideImages: OfficeEmbeddedImage[] = [];
    // `<a:t>` metin çalıştırmaları; aralarına boşluk konmazsa kelimeler yapışıyor.
    const xml = stampDrawings(strFromU8(files[name]!), rels, files, slideImages).replace(/<\/a:p>/g, "\n");
    const text = cleanup(decodeEntities(stripImageTokens(xml).replace(/<[^>]+>/g, " ")));
    if (!text && !slideImages.length) continue;
    const pageIndex = pages.length;
    pages.push(text);
    for (const image of slideImages) images.push({ ...image, pageIndex });
  }
  return { pages, images };
}

export type OfficeReadResult = {
  pages: string[];
  ok: boolean;
  reason?: "unsupported" | "corrupt" | "too_large" | "empty";
};

export type OfficePackage = OfficeReadResult & {
  images: OfficeEmbeddedImage[];
};

function openOfficeZip(buffer: Buffer): Record<string, Uint8Array> {
  // fflate unzipSync artık filter kabul etmiyor; açtıktan sonra
  // yalnız okunan parçaları tutup boyutu sınırlıyoruz.
  const all = unzipSync(new Uint8Array(buffer));
  let unzipped = 0;
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(all)) {
    if (!isKeptOfficePart(name)) continue;
    // Sınırın üstündeki resim belgeyi düşürmez; modele de gitmez.
    if (RASTER_MEDIA.test(name) && (data.byteLength < OFFICE_IMAGE_MIN_BYTES || data.byteLength > OFFICE_IMAGE_MAX_BYTES)) {
      continue;
    }
    unzipped += data.byteLength;
    if (unzipped > MAX_UNZIPPED_BYTES) throw new Error("too_large");
    files[name] = data;
  }
  return files;
}

/** Metin sayfaları ve her resmin ait olduğu sayfa. Model çağrısı yok. */
export function extractOfficePackage(buffer: Buffer, mimeType: string): OfficePackage {
  if (!isOfficeDocument(mimeType)) {
    return { pages: [], images: [], ok: false, reason: "unsupported" };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = openOfficeZip(buffer);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "too_large";
    return { pages: [], images: [], ok: false, reason: tooLarge ? "too_large" : "corrupt" };
  }

  const read = mimeType === DOCX ? readDocx(files) : readPptx(files);
  if (!read.pages.length) return { pages: [], images: [], ok: false, reason: "empty" };
  return { pages: read.pages, images: read.images, ok: true };
}

export function extractOfficeText(
  buffer: Buffer,
  mimeType: string,
): OfficeReadResult {
  const read = extractOfficePackage(buffer, mimeType);
  return { pages: read.pages, ok: read.ok, reason: read.reason };
}
