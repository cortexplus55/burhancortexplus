import { foldTr } from "@/lib/documents/page-analysis";

/**
 * Şekil sayfası kararı (29 Ekim 2026, Paket H).
 *
 * Neden var: "şekil sayfası" bilgisi görselden değil metinden türüyordu. Kelime kapısı
 * ("şeması", "grafiği" geçen sayfa) okumayı tetikliyor, model sayfanın düz metnini geri
 * yazıyor, ek (`Şekilde işaretli değerler:`) sayfaya ekleniyor ve sorgu bu eke bakıp
 * içindekiler sayfasını şekil sayıyordu: kart konunun ilk sayfasında, şekilsiz açılıyordu.
 *
 * Kural: ekteki satırlardan en az biri VERİ TAŞIYICI (sayı, ok, eşitlik, koordinat, tablo
 * satırı) VE sayfanın kendi metninde geçmiyorsa sayfa şekil sayfasıdır. Eski kayıtlardaki
 * sahte ekler (metnin tekrarı) böylece elenir; göç yok, sütun yok — karar okunurken verilir.
 * Aynı normalizasyon şekil okumasında da kullanılır (`figureTranscript`): metin katmanını
 * tekrarlayan satır eke hiç girmez.
 *
 * Ders-bağımsız: tek derse özel kelime yok; yalnız belge yapısı ve matematik işaretleri.
 */

export const FIGURE_APPENDIX_LABEL = "Şekilde işaretli değerler:";

/** Sayfanın ekindeki satırlar; öğrenciye ipucu olarak ilk bu kadarı gider. */
export const FIGURE_HINT_MAX_LINES = 12;

/** İstemciye giden şekil ipucu: sayfa numarası ve ekin yeni bilgi taşıyan satırları. */
export type FigureHint = { page: number; lines: string[] };

/** Satır anahtarı: Türkçe harf katlanır, boşluk düşer, tire türleri birleşir. */
export function normalizeFigureLine(line: string): string {
  return foldTr(line.normalize("NFKC"))
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

/** Bundan uzun bir satır metnin içinde parça olarak geçiyorsa da tekrar sayılır. */
const SUBSTRING_MIN_CHARS = 12;

/** Metin katmanındaki satırların kümesi; tekrar süzgeci ikisine de bakar. */
export function textLayerKeys(textLayer: string): { lines: Set<string>; whole: string } {
  const lines = new Set<string>();
  for (const raw of textLayer.replace(/\r\n/g, "\n").split(/\n+|(?<=[.!?;])\s+/)) {
    const key = normalizeFigureLine(raw);
    if (key) lines.add(key);
  }
  return { lines, whole: normalizeFigureLine(textLayer) };
}

/** Satır metin katmanında zaten var mı (birebir satır ya da uzun parça). */
export function repeatsTextLayer(line: string, keys: { lines: Set<string>; whole: string }): boolean {
  const key = normalizeFigureLine(line);
  if (!key) return true;
  if (keys.lines.has(key)) return true;
  return key.length >= SUBSTRING_MIN_CHARS && keys.whole.includes(key);
}

/** Veri taşıyan satır: sayı, ok, eşitlik/eşitsizlik, koordinat çifti ya da tablo satırı. */
export function isDataLine(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  if (/\d/.test(text)) return true;
  if (/[→←↔⇒⇐⇔=≤≥<>≈≠±]/.test(text)) return true;
  if (/\([^()]+,[^()]+\)/.test(text)) return true;
  // Tablo satırı: en az iki ayraç.
  if ((text.match(/\|/g) ?? []).length >= 2) return true;
  if (/\t/.test(text)) return true;
  return false;
}

/** Sayfa metnini gövde ve ek satırlarına ayırır. Ek yoksa satır listesi boş. */
export function splitFigureAppendix(text: string): { body: string; appendix: string[] } {
  const normalized = (text ?? "").replace(/\r\n/g, "\n");
  const at = normalized.indexOf(FIGURE_APPENDIX_LABEL);
  if (at < 0) return { body: normalized, appendix: [] };
  const body = normalized.slice(0, at);
  const appendix = normalized
    .slice(at + FIGURE_APPENDIX_LABEL.length)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return { body, appendix };
}

/**
 * Sayfa şekil sayfasıysa ekin yeni bilgi taşıyan satırları (ilk 12), değilse null.
 * Metnin tekrarı olan satırlar ipucu değildir; veri taşıyan yeni satır yoksa sayfa şekil değildir.
 */
export function figureHintLines(text: string, max = FIGURE_HINT_MAX_LINES): string[] | null {
  const { body, appendix } = splitFigureAppendix(text);
  if (!appendix.length) return null;
  const keys = textLayerKeys(body);
  const fresh: string[] = [];
  const seen = new Set<string>();
  for (const line of appendix) {
    if (repeatsTextLayer(line, keys)) continue;
    const key = normalizeFigureLine(line);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(line);
  }
  if (!fresh.some(isDataLine)) return null;
  return fresh.slice(0, max);
}

/** `document_pages` satırlarından belge → şekil ipuçları (sayfa sırasıyla, tekrarsız). */
export function figureHintsFromRows(
  rows: readonly { document_id: unknown; page_number: unknown; text_content: unknown }[],
): Map<string, FigureHint[]> {
  const byDoc = new Map<string, Map<number, FigureHint>>();
  for (const row of rows) {
    const id = typeof row.document_id === "string" ? row.document_id : String(row.document_id ?? "");
    const page = Number(row.page_number);
    if (!id || !Number.isInteger(page) || page <= 0) continue;
    const lines = figureHintLines(typeof row.text_content === "string" ? row.text_content : "");
    if (!lines) continue;
    const pages = byDoc.get(id) ?? new Map<number, FigureHint>();
    if (!pages.has(page)) pages.set(page, { page, lines });
    byDoc.set(id, pages);
  }
  const out = new Map<string, FigureHint[]>();
  for (const [id, pages] of byDoc) {
    out.set(
      id,
      [...pages.values()].sort((a, b) => a.page - b.page),
    );
  }
  return out;
}
