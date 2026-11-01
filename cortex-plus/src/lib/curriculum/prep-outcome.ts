import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProgram, outcomesForTopic } from "@/lib/curriculum/registry";
import type { OfficialOutcomeGrounding } from "@/lib/curriculum/grounding";
import type { CurriculumRef } from "@/lib/curriculum/types";

/** Hazırlık resmî müfredattan kurulduysa konunun bütün resmî kazanımları; değilse ya da okunamazsa null. */
export async function loadOfficialOutcome(
  service: SupabaseClient,
  prepId: string | null | undefined,
  topicLabel: string,
): Promise<OfficialOutcomeGrounding | null> {
  if (!prepId || !topicLabel.trim()) return null;
  try {
    const { data } = await service.from("exam_preps").select("learning_preferences").eq("id", prepId).maybeSingle();
    const ref = (data?.learning_preferences as { curriculum?: CurriculumRef } | null)?.curriculum ?? null;
    const program = ref ? getProgram(ref.programId) : null;
    const hits = program ? outcomesForTopic(ref, topicLabel) : [];
    if (!program || !hits.length) return null;
    const units = [...new Set(hits.map((h) => h.unit))];
    return {
      outcomes: hits.map((h) => ({ code: h.outcome.code, text: h.outcome.text, limitations: h.outcome.limitations ?? [] })),
      programLabel: program.label,
      programVersion: program.programVersion,
      unitTitle: units.join(" + "),
      topicLabel: hits.length > 1 ? topicLabel : null,
    };
  } catch {
    return null;
  }
}
