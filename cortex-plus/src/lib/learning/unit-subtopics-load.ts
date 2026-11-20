import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnitSubtopics } from "@/lib/learning/lesson-subtopics";
import { missingColumn } from "@/lib/learning/missing-column";
import { parseSubtopicList, subtopicKey } from "@/lib/learning/subtopic-list";

type TopicRow = { id?: unknown; label?: unknown; subtopics?: unknown };

/**
 * Hazırlığın ünite alt konuları (20 Kasım 2026): etkin ünitenin listesi ve öbür ünitelerinki, tek okumayla.
 *
 * `exam_prep_topics.subtopics` göçle gelir; göçten önce sütun yoktur (42703) ve okuma sessizce null döner — ders
 * bugünkü gibi yazılır. Ünite kimlikle (yoksa adla) bulunur. Okuma hiçbir durumda fırlatmaz. Alt konu yoksa null.
 */
export async function loadUnitSubtopics(
  service: SupabaseClient,
  input: { prepId: string; topicId: string | null; topicLabel: string },
): Promise<UnitSubtopics | null> {
  try {
    const { data, error } = await service
      .from("exam_prep_topics")
      .select("id, label, subtopics")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order")
      .limit(200);
    if (error) {
      if (!missingColumn(error)) {
        console.warn("lesson_unit_subtopics_unavailable", { code: error.code ?? null, cause: String(error.message ?? "").slice(0, 120) });
      }
      return null;
    }
    if (!Array.isArray(data) || !data.length) return null;
    const rows = data as TopicRow[];
    const label = subtopicKey(input.topicLabel);
    const active =
      (input.topicId ? rows.find((row) => row.id === input.topicId) : undefined) ??
      rows.find((row) => typeof row.label === "string" && subtopicKey(row.label) === label);
    const unit = parseSubtopicList(active?.subtopics);
    const others = rows.filter((row) => row !== active).flatMap((row) => parseSubtopicList(row.subtopics));
    if (!unit.length && !others.length) return null;
    return { unit, others };
  } catch {
    return null;
  }
}
