/** Kazanım dersi havuz kaydı (topic_content, kind='outcome_lesson'). Migration 20261103140000 yoksa her yol null döner. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFT_TTL_MS } from "@/lib/content-pool/pool";
import type { PoolUnit } from "@/lib/content-pool/keys";
import { OUTCOME_LESSON_KIND, OUTCOME_LESSON_VERSION } from "@/lib/content-pool/outcome-lesson";
import { lessonSchema, type LessonBody } from "@/lib/content-pool/schema";

export async function readOutcomeLesson(service: SupabaseClient, unit: PoolUnit, outcomeId: string): Promise<LessonBody | null> {
  const { data, error } = await service
    .from("topic_content")
    .select("body, unit_sha256")
    .eq("outcome_id", outcomeId)
    .eq("kind", OUTCOME_LESSON_KIND)
    .eq("version", OUTCOME_LESSON_VERSION)
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || data.unit_sha256 !== unit.sha256) return null;
  const parsed = lessonSchema.safeParse(data.body);
  return parsed.success ? parsed.data : null;
}

export type OutcomeClaim = { claimed: true; id: string } | { claimed: false };

/**
 * Kilit = taslak satır (kazanım başına tek canlı satır, benzersiz indeks). İkinci öğrenci 23505 alır ve üretmez.
 * Düşen üretimin taslağı DRAFT_TTL_MS sonra emekliye ayrılır ve bir kez yeniden denenir. Hata (migration yok) → null.
 */
export async function claimOutcomeLesson(service: SupabaseClient, unit: PoolUnit, outcomeId: string, retry = true): Promise<OutcomeClaim | null> {
  const { data, error } = await service
    .from("topic_content")
    .insert({
      unit_id: unit.unitId,
      program_id: unit.program.id,
      version: OUTCOME_LESSON_VERSION,
      kind: OUTCOME_LESSON_KIND,
      outcome_id: outcomeId,
      outcome_ids: [outcomeId],
      unit_sha256: unit.sha256,
      source_links: unit.sourceLinks,
      status: "draft",
    })
    .select("id")
    .single();
  if (data) return { claimed: true, id: data.id as string };
  if (error?.code !== "23505") return null;
  const { data: live } = await service
    .from("topic_content")
    .select("id, status, created_at")
    .eq("outcome_id", outcomeId)
    .eq("kind", OUTCOME_LESSON_KIND)
    .eq("version", OUTCOME_LESSON_VERSION)
    .in("status", ["draft", "verified"])
    .maybeSingle();
  if (retry && live?.status === "draft" && Date.now() - Date.parse(String(live.created_at)) > DRAFT_TTL_MS) {
    await retireOutcomeLesson(service, live.id as string, { abandoned: true });
    return claimOutcomeLesson(service, unit, outcomeId, false);
  }
  return { claimed: false };
}

export async function retireOutcomeLesson(service: SupabaseClient, id: string, qa: Record<string, unknown>): Promise<void> {
  await service.from("topic_content").update({ status: "rejected", qa, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
}

export async function verifyOutcomeLesson(service: SupabaseClient, id: string, lesson: LessonBody, qa: Record<string, unknown>, model: string): Promise<boolean> {
  const at = new Date().toISOString();
  const { error } = await service
    .from("topic_content")
    .update({ body: lesson, qa, model, status: "verified", verified_at: at, updated_at: at })
    .eq("id", id)
    .eq("status", "draft");
  return !error;
}
