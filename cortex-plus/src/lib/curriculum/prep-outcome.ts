import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProgram, outcomesForTopic } from "@/lib/curriculum/registry";
import type { OfficialOutcomeGrounding } from "@/lib/curriculum/grounding";
import type { CurriculumRef } from "@/lib/curriculum/types";

/** Hazırlık resmî müfredattan kurulduysa konunun resmî kazanımı; değilse ya da okunamazsa null. */
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
    const hit = program ? outcomesForTopic(ref, topicLabel)[0] : null;
    if (!program || !hit) return null;
    return {
      code: hit.outcome.code,
      text: hit.outcome.text,
      limitations: hit.outcome.limitations ?? [],
      programLabel: program.label,
      programVersion: program.programVersion,
      unitTitle: hit.unit,
    };
  } catch {
    return null;
  }
}
