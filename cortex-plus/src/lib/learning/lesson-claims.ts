/**
 * Ders iddialarını ve konu başlığının kapsamını kaynağa bağlar.
 *
 * Model çağrısı burada yok. Doğrulayıcı ve onarım bu saf kontrolleri
 * kullanır; uymayan kart ve cümle düşer, eksik kavram uydurulmaz.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const GENERIC = new Set([
  "kavram",
  "kavrami",
  "kavramlar",
  "kavramlari",
  "giris",
  "temel",
  "konu",
  "konular",
  "ders",
  "dersi",
  "ve",
  "ile",
  "icin",
  "veya",
]);

/** "İç Enerji, Entalpi ve Özgül Isılar" → iç enerji, entalpi, özgül ısılar. */
export function titleConcepts(title: string): string[] {
  const parts = title.split(/\s*(?:,| ve )\s*/i);
  const out: string[] = [];
  for (const part of parts) {
    const words = part
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !GENERIC.has(foldTr(word)));
    const phrase = words.join(" ").trim();
    if (phrase.length < 3) continue;
    if (out.some((item) => foldTr(item) === foldTr(phrase))) continue;
    out.push(phrase);
  }
  return out;
}

/** Kaynakta kavramın kendisi ya da ayırt edici kökü geçiyor mu. */
export function conceptInText(concept: string, text: string): boolean {
  const folded = foldTr(text);
  const phrase = foldTr(concept).replace(/\s+/g, " ").trim();
  if (!phrase) return false;
  if (folded.includes(phrase)) return true;
  const stem = phrase.replace(/(lar|ler)$/, "").trim();
  return stem.length >= 4 && folded.includes(stem);
}

export type PageCatalogItem = { pageNumber: number; text: string };

/**
 * Başlıktaki kavram eşlenen sayfalarda yoksa aynı belgenin o kavramı
 * taşıyan sayfalarını ekler. Belgede yoksa liste değişmez.
 */
export function selectPagesForTitle(
  title: string,
  mappedPages: number[],
  catalog: PageCatalogItem[],
): number[] {
  const mapped = new Set(mappedPages);
  const mappedText = catalog
    .filter((page) => mapped.has(page.pageNumber))
    .map((page) => page.text)
    .join("\n");
  const extra: number[] = [];
  for (const concept of titleConcepts(title)) {
    if (conceptInText(concept, mappedText)) continue;
    let added = 0;
    for (const page of catalog) {
      if (mapped.has(page.pageNumber) || extra.includes(page.pageNumber)) continue;
      if (!conceptInText(concept, page.text)) continue;
      extra.push(page.pageNumber);
      added += 1;
      if (added >= 2 || extra.length >= 4) break;
    }
  }
  return [...mappedPages, ...extra];
}

function sourceHasFirstLaw(source: string): boolean {
  const folded = foldTr(source);
  const compact = folded.replace(/\s+/g, "").replace(/[−–]/g, "-");
  if (/du=q/.test(compact) || /q-w/.test(compact)) return true;
  return /ic enerji/.test(folded) && /isi/.test(folded) && /\bis\b/.test(folded);
}

/**
 * "Doğrusu" ısı kaybını tek etki sayıyorsa yanlıştır.
 * Yanlış inancın kendisi burada denetlenmez.
 */
export function overgeneralCorrection(correction: string, source: string): boolean {
  if (!sourceHasFirstLaw(source)) return false;
  const folded = foldTr(correction);
  if (!/(sadece|yalnizca|her zaman)/.test(folded)) return false;
  const mentionsGain = /isi kazanc|isi alim|isi giris|isi alindig|isi alir|isi alin/.test(folded);
  const mentionsLoss = /isi kayb/.test(folded);
  const onlyWorkOrLoss = /(sadece|yalnizca)/.test(folded) && /isi kayb|is yapimi/.test(folded);
  return (mentionsLoss && !mentionsGain) || (onlyWorkOrLoss && !mentionsGain);
}

/** İşaret belirtilmeden "iç enerji artar / iş yapıldığında değişir". */
export function ambiguousEnergyClaim(sentence: string, source: string): boolean {
  if (!sourceHasFirstLaw(source)) return false;
  const folded = foldTr(sentence);
  if (!/ic enerji/.test(folded)) return false;
  if (
    /(artis|azalis) goster/.test(folded) &&
    !/\d/.test(sentence) &&
    !/du\s*=|q\s*[-−]\s*w/.test(folded)
  ) {
    return true;
  }
  if (
    /is yapildiginda/.test(folded) &&
    !/(sistemin yaptigi|sisteme yapilan|sistem uzerinde|sistem tarafindan)/.test(folded)
  ) {
    return true;
  }
  return false;
}

const QUANTITY =
  /(\d+(?:[.,]\d+)?)\s*(kJ\/kg|m3\/kg|kJ|kPa|MPa|Pa|kg|°\s*C|K)\b/gi;

function quantityNumbers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(QUANTITY)) {
    const raw = match[1];
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < 3) continue;
    out.push(raw.replace(",", "."));
  }
  return out;
}

function numberIn(text: string, normalized: string): boolean {
  if (!normalized) return false;
  const comma = normalized.replace(".", ",");
  return text.includes(normalized) || text.includes(comma);
}

/**
 * Özet, örnekte ve kaynakta olmayan bir nicelik taşıyorsa uyuşmaz.
 * 25 kJ, ders 30 kJ iken ve kaynakta 25 yokken düşer.
 */
export function summaryQuantityMismatch(line: string, example: string, source: string): boolean {
  const pool = `${example}\n${source}`;
  return quantityNumbers(line).some((value) => !numberIn(pool, value));
}

/** Öğretmen notundaki kapsam satırları. Kaynakta duranlar dersin konusudur. */
export function checklistConcepts(note: string): string[] {
  const lines = note.split("\n");
  const start = lines.findIndex((line) => foldTr(line).includes("kapsam listesi"));
  if (start < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("-")) break;
    const label = trimmed.replace(/^-\s*\([^)]*\)\s*[a-zçğıöşü]+:\s*/i, "").trim();
    if (label.length < 3 || label.length > 80) continue;
    out.push(label);
    if (out.length >= 8) break;
  }
  return out;
}

export function missingCoverage(
  lessonText: string,
  source: string,
  topicLabel: string,
): string[] {
  const wanted = [...titleConcepts(topicLabel), ...checklistConcepts(source)];
  const missing: string[] = [];
  for (const concept of wanted) {
    if (!conceptInText(concept, source)) continue;
    if (conceptInText(concept, lessonText)) continue;
    if (missing.some((item) => foldTr(item) === foldTr(concept))) continue;
    missing.push(concept);
  }
  return missing;
}

function lessonBlob(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading}\n${section.body}`),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
}

/** Doğrulayıcıya giden iddia listesi. Yanlış inanç olgu diye yazılmaz. */
export function claimVerifyPrompt(lesson: LessonV2, source: string): string {
  const claims = [
    lesson.commonMistake?.correction
      ? `Doğrusu: ${lesson.commonMistake.correction}`
      : "",
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.solution ?? "",
    ...(lesson.summary ?? []),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .slice(0, 24);
  return [
    "İddiaları kaynağa karşı denetle.",
    "Yalnızca yanlış, kaynakta desteği olmayan veya işareti belirsiz cümleleri döndür.",
    "Sık yapılan hatanın yanlış inancı yanlış kalabilir; onun düzeltmesi doğru olmalıdır.",
    "Isı alımı da iç enerjiyi değiştirir. ΔU = Q − W bağıntısında işareti söylemeyen cümle belirsizdir.",
    'JSON: {"bad":[{"quote":"dersteki aynen cümle","reason":"wrong"}]}',
    "reason yalnız wrong, unsupported veya ambiguous olsun. Uyan iddia yoksa bad boş dizi olsun.",
    `Kaynak:\n${source.slice(0, 4000)}`,
    `İddialar:\n${claims.join("\n")}`,
  ].join("\n\n");
}

const CLAIM_REASONS = new Set(["wrong", "unsupported", "ambiguous"]);

/** Modelin döndürdüğü alıntı derste yoksa yok sayılır. */
export function claimsFromVerify(raw: unknown, lesson: LessonV2): string[] {
  const row = raw && typeof raw === "object" ? (raw as { bad?: unknown }).bad : null;
  if (!Array.isArray(row)) return [];
  const visible = lessonBlob(lesson);
  const foldedVisible = foldTr(visible);
  const claim = foldTr(lesson.commonMistake?.claim ?? "");
  const quotes: string[] = [];
  for (const item of row) {
    if (!item || typeof item !== "object") continue;
    const quote = String((item as { quote?: unknown }).quote ?? "").trim();
    const reason = String((item as { reason?: unknown }).reason ?? "");
    if (quote.length < 12 || !CLAIM_REASONS.has(reason)) continue;
    if (claim && foldTr(quote) === claim) continue;
    if (!visible.includes(quote) && !foldedVisible.includes(foldTr(quote))) continue;
    if (quotes.some((have) => foldTr(have) === foldTr(quote))) continue;
    quotes.push(quote);
    if (quotes.length >= 8) break;
  }
  return quotes;
}

/**
 * Ders skoru ilk denemedeki kontrol sorularıdır.
 * Tekrar doğru olsa bile kaçan soru doğruya yazılmaz.
 */
export function scoreLessonChecks(
  lesson: { sections?: { check?: unknown }[] } | null | undefined,
  answers: Record<string, unknown>,
): { score: number; total: number; retried: number } {
  const sections = lesson?.sections ?? [];
  const checked = sections
    .map((section, index) => (section.check ? index : -1))
    .filter((index) => index >= 0);
  if (!checked.length) return { score: 1, total: 1, retried: 0 };
  const raw = answers.lessonMisses;
  const missed = new Set<number>();
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === "number" && Number.isInteger(value) && checked.includes(value)) {
        missed.add(value);
      }
    }
  }
  return {
    score: checked.length - missed.size,
    total: checked.length,
    retried: missed.size,
  };
}
