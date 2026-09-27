/**
 * Ders üretim hatalarının kurucu görünümü.
 *
 * Best-effort: üretim yolunu bozmaz. Taslak metni / PII saklanmaz.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceTrace } from "@/lib/learning/lesson-source-resolver";

export type LessonFailureRow = {
  id: string;
  user_id: string | null;
  prep_id: string | null;
  topic_id: string | null;
  topic_label: string | null;
  kind: string | null;
  stage: string | null;
  reason: string;
  reasons: string[];
  source_trace: SourceTrace | Record<string, unknown> | null;
  created_at: string;
};

export async function recordLessonGenerationFailure(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId?: string | null;
    topicId?: string | null;
    topicLabel?: string | null;
    kind?: string | null;
    stage: string;
    reason: string;
    reasons?: string[];
    sourceTrace?: SourceTrace | null;
  },
): Promise<void> {
  try {
    console.error("lesson_generation_failure", {
      prepId: input.prepId ?? null,
      topicId: input.topicId ?? null,
      kind: input.kind ?? null,
      stage: input.stage,
      reason: input.reason,
      reasons: (input.reasons ?? []).slice(0, 8),
    });
    await service.from("lesson_generation_failures").insert({
      user_id: input.userId,
      prep_id: input.prepId ?? null,
      topic_id: input.topicId ?? null,
      topic_label: (input.topicLabel ?? "").slice(0, 200) || null,
      kind: input.kind ?? null,
      stage: input.stage,
      reason: input.reason.slice(0, 120),
      reasons: (input.reasons ?? []).map((item) => item.slice(0, 200)).slice(0, 12),
      source_trace: input.sourceTrace ?? {},
    });
  } catch {
    // best-effort
  }
}

export type ListLessonFailuresResult = {
  rows: LessonFailureRow[];
  /** Tablo yok / sorgu hatası — admin 'Kayıt yok' yerine uyarı göstermeli. */
  tableMissing: boolean;
};

export async function listLessonGenerationFailures(
  service: SupabaseClient,
  options: {
    limit?: number;
    kind?: string | null;
    reason?: string | null;
    since?: string | null;
  } = {},
): Promise<ListLessonFailuresResult> {
  let query = service
    .from("lesson_generation_failures")
    .select(
      "id, user_id, prep_id, topic_id, topic_label, kind, stage, reason, reasons, source_trace, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.kind) query = query.eq("kind", options.kind);
  if (options.reason) query = query.eq("reason", options.reason);
  if (options.since) query = query.gte("created_at", options.since);
  const { data, error } = await query;
  if (error) {
    const msg = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
    const tableMissing =
      msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("42p01") ||
      msg.includes("schema cache");
    return { rows: [], tableMissing: tableMissing || Boolean(error) };
  }
  return { rows: (data ?? []) as LessonFailureRow[], tableMissing: false };
}
