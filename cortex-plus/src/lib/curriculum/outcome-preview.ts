import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnit } from "@/lib/content-pool/keys";
import { readPoolLesson } from "@/lib/content-pool/serve";

/**
 * Kazanım sayfasının havuz ön izlemesi (6 Kasım 2026, 360° denetim): 4.194 kazanım sayfası ~68 kelimeydi (başlık,
 * kazanım cümlesi, düğme) ve arama motoru bunları "ince sayfa" sayabilirdi. Havuzda zaten doğrulanmış ünite dersi
 * (kazanım başına bir bölüm) ve kazanım başına sorular var; sayfa onları gösterir. Model çağrısı yok.
 *
 * Örnek sorunun yalnız kökü ve şıkları gösterilir; doğru cevap ve açıklama GÖSTERİLMEZ (soru bankası anahtarıyla
 * 6 Kasım 2026'da herkese kapatıldı; 4.194 sayfada anahtar açık olsaydı bankanın üçte biri dışarı çıkardı).
 */

export type OutcomePreview = {
  heading: string;
  explanation: string;
  keyPoints: string[];
  steps: string[];
  ladder: { temel: string; orta: string; ileri: string } | null;
  workedExample: string | null;
  commonMistakes: string[];
  keyTerms: { term: string; definition: string }[];
  unitOverview: string | null;
  unitSummary: string | null;
  sampleQuestion: { stem: string; choices: string[] } | null;
};

const MAX_KEY_TERMS = 6;

/** Terim bölümün metninde geçiyor mu (büyük/küçük harf ve Türkçe I/İ duyarsız). */
function mentions(text: string, term: string): boolean {
  const norm = (value: string) => value.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
  const needle = norm(term);
  return needle.length >= 2 && norm(text).includes(needle);
}

/**
 * `unitIndex` 0 tabanlı (kayıt defteri sırası); havuz kimliği `program#sıra` 1 tabanlı.
 * Havuzda doğrulanmış ders yoksa ya da bu kazanımın bölümü yoksa null (sayfa eski hâlinde kalır).
 */
export async function loadOutcomePreview(
  service: SupabaseClient,
  input: { programId: string; unitIndex: number; outcomeCode: string; outcomeIndex: number },
): Promise<OutcomePreview | null> {
  const unit = poolUnit(`${input.programId}#${input.unitIndex + 1}`);
  if (!unit) return null;
  const lesson = await readPoolLesson(service, unit).catch(() => null);
  if (!lesson) return null;
  const section =
    lesson.sections.find((s) => s.outcome_code === input.outcomeCode) ??
    (lesson.sections.length === unit.outcomes.length ? lesson.sections[input.outcomeIndex] : undefined);
  if (!section) return null;

  const sectionText = [section.heading, section.explanation, ...section.key_points, section.worked_example ?? ""].join("\n");
  const keyTerms = (lesson.key_terms ?? []).filter((t) => mentions(sectionText, t.term)).slice(0, MAX_KEY_TERMS);

  const outcomeId = unit.outcomes[input.outcomeIndex]?.outcomeId ?? null;
  let sampleQuestion: OutcomePreview["sampleQuestion"] = null;
  if (outcomeId) {
    const { data } = await service
      .from("item_bank")
      .select("stem, choices, difficulty")
      .eq("outcome_id", outcomeId)
      .eq("status", "verified")
      .order("difficulty", { ascending: true })
      .limit(3);
    const rows = (data ?? []) as { stem: string; choices: unknown; difficulty: string }[];
    const pick = rows.find((r) => r.difficulty === "easy") ?? rows.find((r) => r.difficulty === "medium") ?? rows[0];
    if (pick && Array.isArray(pick.choices) && pick.choices.every((c) => typeof c === "string")) {
      sampleQuestion = { stem: pick.stem, choices: pick.choices as string[] };
    }
  }

  return {
    heading: section.heading,
    explanation: section.explanation,
    keyPoints: section.key_points,
    steps: section.steps ?? [],
    ladder: section.ladder && [section.ladder.temel, section.ladder.orta, section.ladder.ileri].every((t) => t?.trim()) ? section.ladder : null,
    workedExample: section.worked_example?.trim() ? section.worked_example : null,
    commonMistakes: section.common_mistakes ?? [],
    keyTerms,
    unitOverview: lesson.overview?.trim() || null,
    unitSummary: lesson.summary?.trim() || null,
    sampleQuestion,
  };
}

/** Sayfanın görünen kelime sayısı (bekçi ve günlük için). */
export function previewWordCount(preview: OutcomePreview, outcomeText: string): number {
  const text = [
    outcomeText,
    preview.heading,
    preview.explanation,
    ...preview.keyPoints,
    ...preview.steps,
    preview.ladder ? [preview.ladder.temel, preview.ladder.orta, preview.ladder.ileri].join(" ") : "",
    preview.unitSummary ?? "",
    preview.workedExample ?? "",
    ...preview.commonMistakes,
    ...preview.keyTerms.flatMap((t) => [t.term, t.definition]),
    preview.unitOverview ?? "",
    preview.sampleQuestion?.stem ?? "",
    ...(preview.sampleQuestion?.choices ?? []),
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
