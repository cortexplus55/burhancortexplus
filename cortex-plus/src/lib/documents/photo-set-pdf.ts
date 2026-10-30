/**
 * Fotoğraf seti → tek çok sayfalı PDF (31 Ekim 2026, ürün sahibinin kararı).
 *
 * Öğrenci 50-100 defter sayfasını seçince 100 ayrı belge (`IMG_001.jpg` … ) Belgelerim'i çöplüğe çeviriyor, 100 ayrı
 * işleme isteği sunucuyu yoruyordu. Birden çok fotoğraf tek seçimde gelince istemci onları seçim sırasıyla TEK bir
 * taranmış PDF'e koyar ("Ders Notu Fotoğrafları (N Sayfa)"): sayfa sayfa okuma, kota, kredi, kaldığı yerden devam ve
 * "Kaynak sayfayı gör" bugün taranmış PDF için ne yapıyorsa aynısını yapar.
 *
 * Yazıcı bağımlılıksız ve bilerek dar: her sayfa tek bir JPEG (DCTDecode), sayfa boyu A4'e oranlanır. Görüntü
 * dizini `/CortexPage n` taşır; sunucu bu PDF'lerde sayfayı yeniden çizmez, gömülü JPEG'i doğrudan okumaya verir
 * (`photoSetPages`) — taranmış sayfada en yavaş adım çizimdi (Paket B ölçümü).
 *
 * Ölçüm (canlı fotoğraf 4080×3060): 1600 piksel JPEG %80 ~285 KB, okunan metin 2048 pikselle aynı (3.143 / 3.144,
 * 3.423 / 3.461 karakter). 100 fotoğraf ~28 MB; parça sınırı PDF tavanının (50 MB) altında.
 */

export const PHOTO_SET_PRODUCER = "Cortex Plus Fotograf Seti";
export const PHOTO_SET_MAX_SIDE = 1600;
export const PHOTO_SET_QUALITY = 0.8;
/** Tek seçimde bu kadar ya da daha çok fotoğraf tek belgeye toplanır. */
export const PHOTO_SET_MIN_PHOTOS = 2;
/** Bir PDF parçasının en büyük boyu (PDF tavanı 50 MB). Aşan set "Bölüm 2" olarak ayrı belgeye geçer. */
export const PHOTO_SET_PART_MAX_BYTES = 45 * 1024 * 1024;
/** Sayfa boyunun uzun kenarı (punto): A4 yüksekliği. Önizleme normal ölçekte çizilsin. */
const PAGE_LONG_SIDE_PT = 842;

export type PhotoPage = { jpeg: Uint8Array; width: number; height: number };

const encoder = new TextEncoder();

/** PDF metin dizgesi: yalnız ASCII, ayraçlar kaçışlı. Sunucu üretici damgasını aynı biçimle arar. */
export function pdfString(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/[^\x20-\x7e]/g, "");
  return `(${ascii.replace(/([\\()])/g, "\\$1")})`;
}

/** Sayfa boyu (punto): uzun kenar A4 yüksekliği, oran fotoğrafınki. */
export function photoPageSize(width: number, height: number): { width: number; height: number } {
  const scale = PAGE_LONG_SIDE_PT / Math.max(1, width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** JPEG sayfalarından PDF baytları. Sayfa sırası dizinin sırası. */
export function buildPhotoSetPdf(pages: readonly PhotoPage[], title: string): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw new Error("photo_set_empty");
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = pages.map((_, index) => 4 + index * 3);
  // Üretici damgası en başta: sunucu yalnız ilk 4 KB'a bakar; uzun sayfa listesi onu aşağı itmesin.
  object(3, `<< /Producer ${pdfString(PHOTO_SET_PRODUCER)} /Title ${pdfString(title)} >>`);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageId = 4 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const size = photoPageSize(page.width, page.height);
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const content = `q ${size.width} 0 0 ${size.height} 0 0 cm /Im0 Do Q`;
    object(contentId, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    offsets[imageId] = length;
    push(
      `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} ` +
        `/CortexPage ${index + 1} >>\nstream\n`,
    );
    push(page.jpeg);
    push("\nendstream\nendobj\n");
  });
  const size = 4 + pages.length * 3;
  const xrefAt = length;
  const rows = ["0000000000 65535 f \n"];
  for (let id = 1; id < size; id += 1) rows.push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  push(`xref\n0 ${size}\n${rows.join("")}trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Fotoğrafları boyuta göre parçalara böler: her parça PDF tavanının altında kalır, sıra korunur. */
export function splitPhotoSet<T extends { jpeg: Uint8Array }>(pages: readonly T[], maxBytes = PHOTO_SET_PART_MAX_BYTES): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const page of pages) {
    const size = page.jpeg.length + 512;
    if (current.length && bytes + size > maxBytes) {
      groups.push(current);
      current = [];
      bytes = 0;
    }
    current.push(page);
    bytes += size;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Belgenin adı: set tek parçaysa "Ders Notu Fotoğrafları (N Sayfa)"; parçalıysa (hızlı başlatma ya da boyut)
 * sayfa aralığıyla "Ders Notu Fotoğrafları (Sayfa 11–100)". Aralık seçimin sırasıdır.
 */
export function photoSetName(range: { from: number; to: number; total: number }): string {
  return range.from === 1 && range.to === range.total
    ? `Ders Notu Fotoğrafları (${range.total} Sayfa).pdf`
    : `Ders Notu Fotoğrafları (Sayfa ${range.from}–${range.to}).pdf`;
}
