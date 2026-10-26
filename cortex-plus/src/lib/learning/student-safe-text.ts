/**
 * Öğrenciye giden metin (bütün ders türleri).
 *
 * İç etiketler ve denetim cümleleri üretim kaydında kalır; ekranda ders, soru, cevap
 * ve ilerleme görünür. Süzgeç ders adı, terim ya da tek bir sınavın kalıbını taşımaz.
 * "Denetim" tek başına kalır: bir konunun kendi cümlesi olabilir.
 */

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
  if (!text || !needsFilter(text)) return text;
  return text
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
