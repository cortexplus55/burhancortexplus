import {
  isCalloutLabel,
  isRunningHeader,
  isSatelliteSection,
  normalizeTopicTitle,
  topicTitleIssues,
} from "@/lib/documents/topic-title";
import type { LessonScreen } from "@/lib/learning/lesson-v3";

/**
 * Dersin omurgası (25 Ekim 2026) — ders bağımsız.
 *
 * Canlı karşılaştırmada bazı dersler üç ekranda bitti; girişte söz verilen ya da kaynakta duran
 * alt başlıklar hiç anlatılmadı, sonra testte o başlıklardan soru geldi. Omurga konunun kendi
 * sayfalarındaki başlık satırlarıdır (numaralı, Markdown, büyük harf ya da kalın satır); ders adı,
 * terim ya da kalıp listesi yok. Yazara "her biri en az bir ekranda" diye gider, kapanışta
 * kapsanmayan başlık öğretim turu açar.
 */

export const BACKBONE_MAX = 14;
const HEADING_MAX_CHARS = 80;
const HEADING_MAX_WORDS = 9;

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ders notlarının kutu etiketleri (biçim sözcükleri, ders terimi değil): alt başlık sayılmaz. */
const BOX_LABEL =
  /^(sınav ipucu|sinav ipucu|akılda tut|akilda tut|alarm( bulguları)?|dikkat|uyarı|not|notlar|ipucu|hatırlatma|özet|örnek|çözüm|soru|cevap|püf noktası|kritik bilgi)$/iu;

const MARKDOWN = /^#{1,4}\s+(.+)$/;
const BOLD_LINE = /^\*\*([^*]+)\*\*:?$/;
const NUMBERED = /^(?:\d{1,2}(?:\.\d{1,2})*\.?|[IVX]{1,4}[.)]|[A-H][.)])\s+(\p{Lu}.*)$/u;

function capsLine(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return false;
  const upper = text.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length >= 0.85;
}

function sentenceCase(text: string): string {
  if (!capsLine(text)) return text;
  const lower = text.toLocaleLowerCase("tr");
  return lower.charAt(0).toLocaleUpperCase("tr") + lower.slice(1);
}

/** Bir satır başlık mı; öyleyse temiz hâli. */
export function headingOfLine(line: string): string | null {
  const text = line.trim().replace(/\s+/g, " ");
  if (!text || text.length > HEADING_MAX_CHARS || text.startsWith("|")) return null;
  let candidate: string | null = null;
  const markdown = MARKDOWN.exec(text);
  const bold = BOLD_LINE.exec(text);
  const numbered = NUMBERED.exec(text);
  if (markdown) candidate = markdown[1]!.replace(/\*\*/g, "");
  else if (bold) candidate = bold[1]!;
  else if (numbered) candidate = text;
  else if (capsLine(text)) candidate = text;
  if (!candidate) return null;
  const title = sentenceCase(normalizeTopicTitle(candidate.replace(/:\s*$/, "")));
  if (title.split(/\s+/).filter(Boolean).length > HEADING_MAX_WORDS) return null;
  if (topicTitleIssues(title).length) return null;
  if (isRunningHeader(candidate) || isCalloutLabel(title) || isSatelliteSection(title)) return null;
  if (BOX_LABEL.test(title.toLocaleLowerCase("tr").replace(/[:!]+$/u, "").trim())) return null;
  return title;
}

/**
 * Konunun kendi sayfalarındaki alt başlıklar, sırayla. Yardımcı (etiketli) sayfalar ve sayfa kenarında
 * tekrar eden satırlar omurgaya girmez; konunun kendi adı da girmez.
 */
export function lessonBackbone(
  pages: readonly { text: string; label?: string }[],
  options: { topicLabel?: string; runningHeaders?: readonly string[] } = {},
): string[] {
  const skip = new Set([...(options.runningHeaders ?? []), options.topicLabel ?? ""].map(fold).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    if (page.label) continue;
    for (const line of page.text.split(/\n+/)) {
      const heading = headingOfLine(line);
      if (!heading) continue;
      const key = fold(heading);
      if (!key || seen.has(key) || skip.has(key)) continue;
      seen.add(key);
      out.push(heading);
      if (out.length >= BACKBONE_MAX) return out;
    }
  }
  return out;
}

/** Yazarın okuduğu omurga bloğu; omurga yoksa boş. */
export function backboneBlock(backbone: readonly string[]): string {
  if (!backbone.length) return "";
  return (
    "OMURGA (konunun kaynaktaki alt başlıkları, sırayla): " +
    backbone.map((item, index) => `${index + 1}) ${item}`).join(" · ") +
    "\nHer alt başlık derste en az bir ekranda işlenir: tanımı, sayısal kuralı/formülü, istisnası, sırası ve " +
    "kaynakta varsa çözümlü problem ya da vaka tipiyle. Kısa bir alt başlığı komşusuyla aynı kavramda " +
    "birleştirebilirsin; hiçbirini atlama, yalnız terim sayıp geçme."
  );
}

const stems = (text: string): string[] =>
  fold(text)
    .split(" ")
    .filter((word) => (/\d/.test(word) ? word.length >= 1 : word.length >= 4))
    .map((word) => (/\d/.test(word) ? word : word.slice(0, 5)));

/**
 * Derste işlenmemiş omurga başlıkları: başlığın içerik köklerinin yarısından azı derste geçiyor.
 * Kaba bir ölçü; yalnız öğretim turu açar, ders ya da kavram düşürmez.
 */
export function uncoveredBackbone(screens: readonly LessonScreen[], backbone: readonly string[]): string[] {
  if (!backbone.length || !screens.length) return [];
  const told = new Set(
    stems(screens.map((screen) => `${screen.heading} ${screen.concept ?? ""} ${JSON.stringify(screen.blocks)}`).join(" ")),
  );
  return backbone.filter((item) => {
    const keys = stems(item);
    if (!keys.length) return false;
    const hits = keys.filter((key) => told.has(key)).length;
    return hits * 2 < keys.length;
  });
}
