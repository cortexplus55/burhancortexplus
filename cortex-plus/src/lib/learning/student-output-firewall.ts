/**
 * Öğrenciye giden metnin tek süzgeci (29 Ekim 2026).
 *
 * İki ayrı temizleyici vardı: `student-safe-text.ts` (iç etiket ve denetim cümleleri; ders metni,
 * podcast ve düğüm kaydı) ile `student-copy.ts` (yalnız test sorusunda çalışan sızıntı listesi).
 * Kartta "(core)", sohbette "Readiness", podcast satırında "Ada:" öneki birinden geçip ötekine
 * takılmıyordu. Artık bütün kurallar burada; eski iki modül buraya yönlendirir. Süzgeç ders adı,
 * terim ya da tek bir sınavın kalıbını taşımaz; yalnız ürünün kendi iç dilini siler.
 */

/* ───────────── Üretim kaydının iç cümleleri ───────────── */

const LEAK_SENTENCE =
  /[^.!?\n]*(?:görünmediği için|burada görünmedi|sayı uydurma)[^.!?\n]*[.!?]?/gi;

const ANSWER_LETTER =
  /\b(?:cevap|doğru şık)\s+[A-E](?:\s|['’'"]){0,3}(?:dir|dır|dur|dür)\b/gi;

const CORRECT_CHOICE = /\bdoğru şık\s+[A-E]\b/gi;

const COURSE_HEADER = /^[ \t]*Ders:\s+\S.{0,80}?\bDönem\s*:?\s*20\d{2}\b.*$/gim;

/**
 * Belgenin üst bilgi satırı tek başına ("Dönem: 2026–2027", "Akademik Yıl 2026-27"): öğretmez, sayfa başlığıdır
 * (30 Ekim 2026, Paket I #5: canlı derste kaldı; eski kalıp yalnız "Ders: … Dönem 2026" biçimini tanıyordu).
 */
const TERM_LINE =
  /^[ \t]*(?:Dönem|Akademik\s+Yıl|Eğitim[-\s]Öğretim\s+Yılı|Öğretim\s+Yılı)\s*:?\s*20\d{2}\s*[-–—/]\s*(?:20)?\d{2}\b[^\n]{0,40}$/gimu;

const BOILERPLATE_SCOPE = /(?:^|(?<=[.!?\n]\s))Bu konu sınav kapsamı dışındadır\.?\s*/gi;

/**
 * Öğrenciye gidecek metinden iç kural cümlelerini siler.
 * Belge alıntısındaki "X sınav kapsamı dışındadır" cümlesi durur; modelin kendi
 * "Bu konu sınav kapsamı dışındadır" kalıbı durmaz.
 */
export function sanitizeStudentContent(text: string): string {
  if (!text) return text;
  let out = text.replace(COURSE_HEADER, "").replace(TERM_LINE, "");
  out = out.replace(BOILERPLATE_SCOPE, "");
  out = out.replace(/s[iıİI]nav\s+m[uüÜU]fredat[iıİI]\s+tamamlamas[iıİI]\s*:?\s*/gi, "");
  out = out.replace(LEAK_SENTENCE, " ");
  out = out.replace(ANSWER_LETTER, "");
  out = out.replace(CORRECT_CHOICE, "");
  return tidy(out);
}

/* ───────────── Ürünün iç adları ve etiketleri ───────────── */

const LEAKS: RegExp[] = [
  /\s*\((?:core|bonus)\)/gi,
  /\b(?:developing|mastered)\b/gi,
  /\bReadiness\b/g,
  /Kayıtlı sorulardan\.?\s*Yeni üretim yok\.?/gi,
  /Kurucu hesabı/gi,
  /\s*için geçerli ifade hangisidir\??/gi,
  /NEDEN BÖYLE\??:?\s*/gi,
  /SINAV MÜFREDATI TAMAMLAMASI:?\s*/gi,
  /şöyle hesaplanır:\s*(?=$)/gi,
];

/**
 * Podcast satırının başındaki konuşmacı adı: oynatıcı adı rozetle ayrıca yazar, metnin içinde bir
 * daha görünmez. Eski senaryoların "Ece / Deniz / ÖĞRETMEN" adları da aynı kuralla düşer.
 */
const SPEAKER_PREFIX = /^[ \t]*(?:ada|kerem|ece|deniz|öğretmen|ogretmen|sunucu|öğrenci|ogrenci)\s*:\s*(?=\S)/gimu;

/*
  İstem yankısı (30 Ekim 2026, Paket I #5). Canlıda öğrenci şunları okudu; hepsi ürünün kendi istem dilinden:
  - "Turuncu işaretli yerler sınavda çıkar." (ekranın renk anahtarı; yazar istemi "ekranda turuncu" diyordu)
  - "Tekrar soruları ile boş ödev tablosu bu anlatımda ele alınmıyor." (kapsam notu)
  - "(Alıştırma 11.5)" (kaynağın alıştırma numarası; öğrenci o numaraya bakarak soruyu bulamaz)
  - "Şekilde işaretli değerler:" ve "SINAVDA SORULUR" (iç ek ve blok adları)
  Kod cümle yazmaz; yalnız bu cümleleri ve etiketleri siler. "Turuncu renk" (kimyada gösterge rengi) gibi içerik
  cümlesi düşmez: yalnız "turuncu işaret/vurgu".
*/
const COLOR_KEY_SENTENCE =
  /[^.!?\n]*(?:turuncu|renkli)\s+(?:ile\s+)?(?:işaret|vurgu)\p{L}*[^.!?\n]*[.!?]?/giu;

const SCOPE_META_SENTENCE =
  // "işlen-" ve geniş zaman (-maz) yok: "Bu bölümdeki suçlar taksirle işlenmez" bir hukuk kuralıdır, meta değil.
  /[^.!?\n]*(?:^|[^\p{L}])(?:bu|şu)\s+(?:anlatım|ders|bölüm|podcast|kısım|ünite|oturum)\p{L}*[^.!?\n]*?(?:ele\s+alın|değinil|anlatıl|yer\s+veril)(?:mıyor|miyor|mayacak|meyecek|mamış|memiş)\p{L}*[^.!?\n]*[.!?]?/giu;

const SOURCE_EXERCISE_REF = [
  /\s*\((?:Alıştırma|Problem|Egzersiz|Örnek)\s+\d+(?:[.,]\d+)*\)/giu,
  /^[ \t]*(?:Alıştırma|Problem|Egzersiz)\s+\d+(?:\.\d+)*\s*[:.)–-]\s*/gimu,
];

const INTERNAL_LABELS = [/Şekilde işaretli değerler:\s*/g, /SINAVDA SORULUR(?:\s+MADDE(?:Sİ|LERİ))?\s*:?\s*/g];

/** Modelin uydurduğu kişisel anı ("geçen gün denemede…"): öğrencinin yaşamadığı bir olayı yaşamış gibi anlatır. */
const FABRICATED_MEMORY =
  /[^.!?\n]*\bgeçen(?:lerde|\s+(?:gün|hafta|ay|yıl|sene))\b[^.!?\n]*\b(?:deneme|sınav|ders|öğrenci)\p{L}*[^.!?\n]*[.!?]?/giu;

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** İç etiket, ürün adı, konuşmacı öneki ve uydurma anı dahil bütün sızıntılar. */
export function studentOutputText(text: string): string {
  if (!text) return text;
  let out = sanitizeStudentContent(text);
  for (const pattern of LEAKS) out = out.replace(pattern, "");
  out = out.replace(/\bemerging\b/gi, "Gelişiyor");
  // "İpucu:" / "İpucu," ham öneki her yerde düşer (26 Ekim 2026 bekçisi): not kutusunun etiketi başlıktan gelir, metinden değil.
  out = out.replace(/[İIıi]pucu[:,]\s*/gu, "");
  out = out.replace(/^\s*kaynakta[:,]\s*/giu, "");
  out = out.replace(SPEAKER_PREFIX, "");
  out = out.replace(FABRICATED_MEMORY, " ");
  out = out.replace(COLOR_KEY_SENTENCE, " ").replace(SCOPE_META_SENTENCE, " ");
  for (const pattern of SOURCE_EXERCISE_REF) out = out.replace(pattern, "");
  for (const pattern of INTERNAL_LABELS) out = out.replace(pattern, "");
  if (needsInternalFilter(out)) out = out.replace(INTERNAL_TAG, " ").replace(META_SENTENCE, " ");
  return tidy(out).replace(/\s+([,.!?])/g, "$1");
}

/* ───────────── Denetim kaydının etiketleri ───────────── */

const INTERNAL_TAG = /\[(?:omurga|öğretim|ogretim|kapsam)[^\]]*\]/gi;

const META_SENTENCE =
  /[^.!?\n]*(?:kaynak doğrulama|düzeltme turu|denetim turu|öğretim ölçütü|ogretim olcutu|iç etiket|ic etiket|sorun listesi)[^.!?\n]*[.!?]?/gi;

const DROP_KEYS = new Set(["issues", "disputes", "fixTriggers"]);

function needsInternalFilter(text: string): boolean {
  return (
    /\[(?:omurga|öğretim|ogretim|kapsam)/i.test(text) ||
    /kaynak doğrulama|düzeltme turu|denetim turu|öğretim ölçütü|ogretim olcutu|iç etiket|ic etiket|sorun listesi/i.test(
      text,
    )
  );
}

/** Eski ad; `studentOutputText` ile aynı. */
export function studentSafeText(text: string): string {
  return studentOutputText(text);
}

/** Eski ad (test sorusu); `studentOutputText` ile aynı. */
export function sanitizeStudentCopy(text: string): string {
  return studentOutputText(text);
}

/**
 * Öğrenci payload'ı: her dizgi süzülür; `issues` / `disputes` / `fixTriggers` düşer. `qualityReport`
 * yalnız istenirse ve içine girilmeden kalır (yönetici kaydı).
 */
export function studentOutputPayload<T>(value: T, options?: { keepQualityReport?: boolean }): T {
  return walk(value, options?.keepQualityReport === true) as T;
}

/** Eski ad; `studentOutputPayload` ile aynı. */
export function studentSafePayload<T>(value: T, options?: { keepQualityReport?: boolean }): T {
  return studentOutputPayload(value, options);
}

function walk(value: unknown, keepReport: boolean): unknown {
  if (typeof value === "string") return studentOutputText(value);
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
