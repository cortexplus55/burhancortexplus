import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProgram, outcomesForTopic } from "@/lib/curriculum/registry";
import type { OfficialOutcomeGrounding } from "@/lib/curriculum/grounding";
import type { CurriculumRef } from "@/lib/curriculum/types";
import { outcomesForPlannedUnit } from "@/lib/curriculum/official-setup";

type PlannedUnitPref = { topic: string; unitId: string; codes: string[] };

/** Resmî sınav kurulumundan (çok dersli) konu: ünitenin seçilen bütün kazanımları ve sınırlamaları. */
export function plannedUnitGrounding(prefs: unknown, topicLabel: string): OfficialOutcomeGrounding | null {
  const units = (prefs as { officialPlan?: { units?: PlannedUnitPref[] } } | null)?.officialPlan?.units;
  const label = topicLabel.replace(/\s+/g, " ").trim();
  const hit = Array.isArray(units) ? units.find((u) => u && u.topic === label) : undefined;
  if (!hit) return null;
  const found = outcomesForPlannedUnit(hit.unitId, hit.codes);
  if (!found || !found.outcomes.length) return null;
  return {
    outcomes: found.outcomes.map((o) => ({ code: o.code, text: o.text, limitations: o.limitations ?? [] })),
    programLabel: found.program.label,
    programVersion: found.program.programVersion,
    unitTitle: found.unit.title,
    topicLabel: found.outcomes.length > 1 ? label : null,
  };
}

/** Hazırlık resmî müfredattan kurulduysa konunun bütün resmî kazanımları; değilse ya da okunamazsa null. */
export async function loadOfficialOutcome(
  service: SupabaseClient,
  prepId: string | null | undefined,
  topicLabel: string,
): Promise<OfficialOutcomeGrounding | null> {
  if (!prepId || !topicLabel.trim()) return null;
  try {
    const { data } = await service.from("exam_preps").select("learning_preferences").eq("id", prepId).maybeSingle();
    const planned = plannedUnitGrounding(data?.learning_preferences, topicLabel);
    if (planned) return planned;
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
