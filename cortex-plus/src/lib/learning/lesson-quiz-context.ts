import type { SupabaseClient } from "@supabase/supabase-js";
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/**
 * Konu testi dersi bilsin (20 Ekim 2026). Kör kıyasta Pediatri solunum testimiz dersin derste
 * sorduğu ayrımı yeniden sordu, dersin öğrettiği uyarıları hiç sormadı; test konunun dersini
 * hiç görmüyordu. Burada kaydedilmiş ders(ler)den yazara giden üç şey çıkar:
 *
 * - checks: öğrencinin derste çözdüğü sorular (aynen ya da aynı kalıpla sorulmasın),
 * - terms: dersin **koyu** yazdığı terimler (test aynı adı kullansın),
 * - text: dersin düz metni — hangi "Sınavda sorulur" maddesinin derste işlendiğini bulmak için;
 *   isteme girmez.
 *
 * `key` önceden yazılan testin anahtarına girer (`prefetchVariant`): ders değişince eski test
 * öğrenciye gitmez. Saf; model çağrısı yok.
 */
export type LessonQuizContext = {
  checks: string[];
  terms: string[];
  text: string;
  key: string;
  /** Dersin hazırlanamayan kavramları (`missingConcepts`): konu testi bunları sormaz (25 Ekim 2026). */
  missing?: string[];
};

export const LESSON_CHECKS_MAX = 12;
export const LESSON_TERMS_MAX = 25;
const LESSON_TEXT_MAX = 20_000;
/** Aynı konunun en çok bu kadar farklı dersi (kavram birimli konu: "Ders 1/3" …). */
const LESSONS_MAX = 4;

function fnv(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

function pushUnique(list: string[], seen: Set<string>, value: string, max: number) {
  if (!value || list.length >= max) return;
  const key = value.toLocaleLowerCase("tr");
  if (seen.has(key)) return;
  seen.add(key);
  list.push(value);
}

const BOLD = /\*\*([^*\n]{2,60})\*\*/g;

function boldTerms(text: string): string[] {
  return [...text.matchAll(BOLD)].map((match) => match[1].replace(/[.,;:]+$/u, "").trim()).filter((term) => term.length >= 2);
}

function sectionText(section: LessonV2["sections"][number]): string {
  return [
    section.heading,
    section.lead,
    section.body,
    section.note ? `${section.note.title} ${section.note.body}` : "",
    ...(section.cards ?? []).map((card) => `${card.title} ${card.body}`),
    section.formula ? `${section.formula.title} ${section.formula.expression} ${section.formula.note ?? ""}` : "",
    ...(section.procedure?.steps ?? []).map((step) => `${step.label} ${step.detail}`),
    section.table
      ? [section.table.caption ?? "", section.table.columns.join(" "), ...section.table.rows.map((row) => row.join(" "))].join(" ")
      : "",
    section.check ? `${section.check.prompt} ${section.check.explanation}` : "",
  ]
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

/** Kaydedilmiş derslerden (eskiden yeniye) yazarın okuyacağı bağlam. Ders yoksa ya da boşsa null. */
export function lessonQuizContext(lessons: readonly LessonV2[], missing: readonly string[] = []): LessonQuizContext | null {
  const checks: string[] = [];
  const terms: string[] = [];
  const seenChecks = new Set<string>();
  const seenTerms = new Set<string>();
  const texts: string[] = [];
  for (const lesson of lessons) {
    for (const section of lesson.sections ?? []) {
      // Ekran i = bölüm i: bölümün sorusu ekranın sorusu; yanlış cevapta gelen ikinci soru da derste görüldü.
      pushUnique(checks, seenChecks, clean(section.check?.prompt), LESSON_CHECKS_MAX);
      pushUnique(checks, seenChecks, clean(section.check?.review?.prompt), LESSON_CHECKS_MAX);
      for (const source of [section.body, section.lead ?? "", section.note?.body ?? "", ...(section.cards ?? []).map((card) => card.body)]) {
        for (const term of boldTerms(source)) pushUnique(terms, seenTerms, term, LESSON_TERMS_MAX);
      }
      for (const card of section.cards ?? []) pushUnique(terms, seenTerms, clean(card.title), LESSON_TERMS_MAX);
      texts.push(sectionText(section));
    }
    for (const prompt of [lesson.infoCheck?.prompt, lesson.findError?.prompt, lesson.numericalCheck?.prompt]) {
      pushUnique(checks, seenChecks, clean(prompt), LESSON_CHECKS_MAX);
    }
    texts.push(...(lesson.summary ?? []).map(clean));
  }
  const text = texts.filter(Boolean).join("\n").slice(0, LESSON_TEXT_MAX);
  if (!checks.length && !terms.length && !text) return null;
  const key = `L${fnv(`${checks.join("|")}#${terms.join("|")}#${text}`).toString(36).slice(0, 6)}`;
  const gaps = missing.map(clean).filter(Boolean).slice(0, 8);
  return { checks, terms, text, key, ...(gaps.length ? { missing: gaps } : {}) };
}

/**
 * Konu testinin madde listesinden dersin hazırlanamayan bölümüne ait maddeler çıkar: kavram adının kelime
 * köklerinin en az %60'ı maddede geçiyor ve madde derste işlenmemiş. Ders anlatmadığı bölümden soru sordurmaz.
 */
export function withoutMissingPoints(points: readonly string[], missing: readonly string[], lessonText: string): string[] {
  if (!missing.length) return [...points];
  return points.filter(
    (point) => pointTaught(point, lessonText) || !missing.some((concept) => pointTaught(concept, point)),
  );
}

/** Kayıtlı dersin `missingConcepts` alanı (kayıt biçimine eklenir; okuyucular bilmez). */
export function storedMissingConcepts(raw: unknown): string[] {
  const list = (raw as { missingConcepts?: unknown } | null)?.missingConcepts;
  return Array.isArray(list) ? list.map(clean).filter(Boolean).slice(0, 8) : [];
}

/** Kapsam sayımında kanıt sayılmayan genel kelimeler (5 harflik kök). */
const GENERIC_KEYS = new Set(["olara", "değil", "öneml", "arası", "yapıl", "edili", "gerek", "ancak", "özell", "birli", "olmas"]);

/**
 * Kelime kökleri: Türkçe ek için 5 harflik kök, rakamlı kelime bütün (B12, 38). Test motorunun
 * "kök cevabı ele veriyor" denetimiyle aynı ayırma.
 */
export function wordKeys(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("tr")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => (/\d/.test(word) ? word.length >= 2 : word.length >= 5))
      .map((word) => (/\d/.test(word) ? word : word.slice(0, 5))),
  );
}

/**
 * Madde derste işlendi mi: maddenin kelime köklerinin en az %60'ı ders metninde geçiyor.
 * Kaba bir ölçü; yalnız sırayı belirler (önce işlenen maddeler sorulur), soruyu düşürmez.
 */
export function pointTaught(point: string, lessonText: string): boolean {
  const keys = [...wordKeys(point)].filter((key) => !GENERIC_KEYS.has(key));
  if (!keys.length || !lessonText) return false;
  const lesson = wordKeys(lessonText);
  const hits = keys.filter((key) => lesson.has(key)).length;
  return hits / keys.length >= 0.6;
}

/**
 * Konunun kaydedilmiş dersleri (en yeni 8 kayıt; aynı başlıktan en yenisi, en çok 4 ders, eskiden
 * yeniye). `savedAt` en yeni kaydın zamanı: önceden yazılan test bundan önce başladıysa ders
 * bilgisi yoktur. Okuma düşerse boş — test bugünkü gibi dersi bilmeden yazılır.
 */
export async function loadTopicLessons(
  service: SupabaseClient,
  topicId: string,
): Promise<{ lessons: LessonV2[]; savedAt: string | null; missing: string[] }> {
  try {
    const { data, error } = await service
      .from("exam_prep_lessons")
      .select("title, content_json, created_at")
      .eq("topic_id", topicId)
      .not("content_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error || !Array.isArray(data) || !data.length) return { lessons: [], savedAt: null, missing: [] };
    const seen = new Set<string>();
    const lessons: LessonV2[] = [];
    const missing: string[] = [];
    for (const row of data as { title?: unknown; content_json?: unknown }[]) {
      const title = clean(row.title).toLocaleLowerCase("tr");
      if (title && seen.has(title)) continue;
      const lesson = readLessonV2(row.content_json);
      if (!lesson) continue;
      if (title) seen.add(title);
      lessons.push(lesson);
      missing.push(...storedMissingConcepts(row.content_json));
      if (lessons.length >= LESSONS_MAX) break;
    }
    const savedAt = typeof data[0]?.created_at === "string" ? (data[0].created_at as string) : null;
    return { lessons: lessons.reverse(), savedAt, missing };
  } catch {
    return { lessons: [], savedAt: null, missing: [] };
  }
}
