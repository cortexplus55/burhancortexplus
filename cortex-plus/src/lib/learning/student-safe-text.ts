/**
 * Öğrenciye giden metin (bütün ders türleri).
 *
 * İç etiketler ve denetim cümleleri üretim kaydında kalır; ekranda ders, soru, cevap
 * ve ilerleme görünür. Süzgeç ders adı, terim ya da tek bir sınavın kalıbını taşımaz.
 * "Denetim" tek başına kalır: bir konunun kendi cümlesi olabilir.
 */

const LEAK_SENTENCE =
  /[^.!?\n]*(?:görünmediği için|burada görünmedi|sayı uydurma)[^.!?\n]*[.!?]?/gi;

const ANSWER_LETTER =
  /\b(?:cevap|doğru şık)\s+[A-E](?:\s|['’'"]){0,3}(?:dir|dır|dur|dür)\b/gi;

const CORRECT_CHOICE = /\bdoğru şık\s+[A-E]\b/gi;

const COURSE_HEADER = /^[ \t]*Ders:\s+\S.{0,80}?\bDönem\s+20\d{2}\b.*$/gim;

const BOILERPLATE_SCOPE = /(?:^|(?<=[.!?\n]\s))Bu konu sınav kapsamı dışındadır\.?\s*/gi;

/**
 * Öğrenciye gidecek metinden iç kural cümlelerini siler.
 * Belge alıntısındaki "X sınav kapsamı dışındadır" cümlesi durur; modelin kendi
 * "Bu konu sınav kapsamı dışındadır" kalıbı durmaz.
 */
export function sanitizeStudentContent(text: string): string {
  if (!text) return text;
  let out = text.replace(COURSE_HEADER, "");
  out = out.replace(BOILERPLATE_SCOPE, "");
  out = out.replace(/s[iıİI]nav\s+m[uüÜU]fredat[iıİI]\s+tamamlamas[iıİI]\s*:?\s*/gi, "");
  out = out.replace(LEAK_SENTENCE, " ");
  out = out.replace(ANSWER_LETTER, "");
  out = out.replace(CORRECT_CHOICE, "");
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const INTERNAL_TAG = /\[(?:omurga|öğretim|ogretim|kapsam)[^\]]*\]/gi;

const META_SENTENCE =
  /[^.!?\n]*(?:kaynak doğrulama|düzeltme turu|denetim turu|öğretim ölçütü|ogretim olcutu|iç etiket|ic etiket|sorun listesi)[^.!?\n]*[.!?]?/gi;

const DROP_KEYS = new Set(["issues", "disputes", "fixTriggers"]);

function needsFilter(text: string): boolean {
  return (
    /\[(?:omurga|öğretim|ogretim|kapsam)/i.test(text) ||
    /kaynak doğrulama|düzeltme turu|denetim turu|öğretim ölçütü|ogretim olcutu|iç etiket|ic etiket|sorun listesi/i.test(
      text,
    )
  );
}

/** Öğrenci metninden iç etiketi ve denetim cümlesini çıkarır. Temiz metne dokunmaz. */
export function studentSafeText(text: string): string {
  const stripped = sanitizeStudentContent(text);
  if (!stripped || !needsFilter(stripped)) return stripped;
  return stripped
    .replace(INTERNAL_TAG, " ")
    .replace(META_SENTENCE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Öğrenci payload'ı. `issues` / `disputes` / `fixTriggers` düşer. `qualityReport` yalnız
 * istenirse ve içine girilmeden kalır (yönetici kaydı).
 */
export function studentSafePayload<T>(value: T, options?: { keepQualityReport?: boolean }): T {
  return walk(value, options?.keepQualityReport === true) as T;
}

function walk(value: unknown, keepReport: boolean): unknown {
  if (typeof value === "string") return studentSafeText(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, keepReport));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DROP_KEYS.has(key)) continue;
    if (key === "qualityReport") {
      if (keepReport) out[key] = child;
      continue;
    }
    out[key] = walk(child, keepReport);
  }
  return out;
}
