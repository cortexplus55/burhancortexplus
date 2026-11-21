import { withoutOutcomeCode } from "@/lib/learning/path-labels";

/*
  Canlı sesli öğretmende öğrencinin sözünün yazıya dökümü için ipucu metni (21 Kasım 2026, Burhan'ın isteği). Canlıda
  bir kısaltma son sesi düşerek yazıldı ve öğretmen "… derken … mi?" diye konuşmayı böldü. Yazıya döküm modeli serbest
  metinli bir ipucu kabul eder: bu dosya o metni iki kaynaktan kurar.
    1. Evrensel terimler: Türkçe sınav ve ders dilinde sık geçen kısaltma ve adlar (her branştan, kısa ve sabit liste).
    2. Öğrencinin hazırlığının kendi konu başlıkları ve alt başlıkları (her oturumda veritabanından).
  Saf işlevler: okumayı `persist.ts` yapar. Metin yalnız yazıya döküm modeline gider; öğrenci görmez. Terimler öğretmenin
  talimatına da kısa bir liste olarak eklenir (`realtime-instructions.ts`): belirsiz duyduğunda önce bunları düşünsün.
*/

/** Her branştan, Türkçe söylenişi yazımından uzak olan ya da kısa olduğu için kolay yutulan terimler. */
export const STT_UNIVERSAL_TERMS: readonly string[] = [
  // Sınavlar
  "YKS", "TYT", "AYT", "LGS", "KPSS", "ALES", "DGS", "YDS", "TUS", "DUS",
  // Tıp ve biyoloji
  "KOAH", "EKG", "EEG", "BT", "MR", "ACE", "ATP", "DNA", "RNA", "pH", "hemoglobin", "insülin", "mitoz", "mayoz",
  // Hukuk ve tarih
  "TBMM", "AYM", "Yargıtay", "Danıştay", "anayasa", "kararname", "Tanzimat", "Meşrutiyet",
  // Matematik
  "sinüs", "kosinüs", "tanjant", "logaritma", "integral", "türev", "limit", "polinom", "mutlak değer",
  // Fizik, kimya, mühendislik
  "Bernoulli", "Pascal", "Newton", "joule", "ohm", "entropi", "mol", "asit", "baz", "ivme", "momentum",
];

/** İpucuna giren hazırlık terimi sayısı ve metnin toplam boyu (model için kısa tutulur). */
export const STT_PREP_TERM_MAX = 40;
export const STT_PROMPT_MAX_CHARS = 1500;
/** Hazırlık terimlerinin metindeki payı (karakter): evrensel listeye de yer kalsın. */
export const STT_PREP_TERMS_MAX_CHARS = 900;
const TERM_MAX_CHARS = 70;

/** Başlığı ipucu terimine indirir: kazanım kodu, işaretleme ve satır sonu gider; harf taşımayan ya da uzun metin düşer. */
export function cleanSttTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = withoutOutcomeCode(raw)
    .replace(/[*_`#>|[\]{}$=]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—·•:;,.]+|[\s\-–—·•:;,]+$/g, "")
    .trim();
  if (text.length < 2 || text.length > TERM_MAX_CHARS) return null;
  if (!/\p{L}/u.test(text)) return null;
  return text;
}

const fold = (text: string) => text.toLocaleLowerCase("tr");

/** Tekrarsız liste (Türkçe büyük/küçük harf duyarsız), verilen sırayla. */
function unique(terms: (string | null)[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    if (!term) continue;
    const key = fold(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

export type SttTopicRow = { title?: unknown; subtopics?: unknown };

/**
 * Hazırlığın terimleri: önce hazırlığın adı, sonra konu başlıkları (yolun sırasıyla), en son alt başlıklar. Başlıklar
 * öne alınır ki sınır dolduğunda bütün konular listede kalsın.
 */
export function sttTermsFromPrep(prepTitle: unknown, rows: SttTopicRow[]): string[] {
  const titles = rows.map((row) => cleanSttTerm(row.title));
  const subtopics = rows.flatMap((row) => (Array.isArray(row.subtopics) ? row.subtopics : []).map((item) => cleanSttTerm(item)));
  return unique([cleanSttTerm(prepTitle), ...titles, ...subtopics], STT_PREP_TERM_MAX);
}

/**
 * Yazıya döküm modelinin ipucu metni (serbest metin). Hazırlık terimleri evrensel listeden önce yazılır: sınır aşılırsa
 * kesilen evrensel liste olur, öğrencinin kendi konuları kalır.
 */
export function buildTranscriptionPrompt(prepTerms: readonly string[] = []): string {
  const own: string[] = [];
  let ownChars = 0;
  for (const term of unique(prepTerms.map((item) => cleanSttTerm(item)), STT_PREP_TERM_MAX)) {
    if (ownChars + term.length + 2 > STT_PREP_TERMS_MAX_CHARS) break;
    own.push(term);
    ownChars += term.length + 2;
  }
  const ownKeys = new Set(own.map(fold));
  const universal = STT_UNIVERSAL_TERMS.filter((term) => !ownKeys.has(fold(term)));
  const head =
    "Türkçe birebir özel ders konuşması. Öğrenci sınav konularını soruyor. Kısaltmaları ve terimleri Türkçe ders " +
    "kitabındaki yazımıyla yaz; kelimenin son sesini düşürme, kısaltmayı yarım bırakma.";
  const ownLine = own.length ? ` Öğrencinin çalıştığı konular ve terimler: ${own.join("; ")}.` : "";
  let text = `${head}${ownLine} Sık geçen terimler: `;
  const kept: string[] = [];
  for (const term of universal) {
    const next = kept.length ? `, ${term}` : term;
    if (text.length + kept.join(", ").length + next.length + 1 > STT_PROMPT_MAX_CHARS) break;
    kept.push(term);
  }
  text += `${kept.join(", ")}.`;
  return text.length > STT_PROMPT_MAX_CHARS ? `${text.slice(0, STT_PROMPT_MAX_CHARS - 1).trimEnd()}.` : text;
}
