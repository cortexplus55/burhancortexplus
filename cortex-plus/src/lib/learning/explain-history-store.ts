import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExplainReview } from "@/lib/learning/explain-review";
import { missingSchema } from "@/lib/learning/missing-column";
import type { ExplainAttempt } from "@/lib/learning/explain-history";

const TABLE = "explain_attempts";

type Row = {
  id: string;
  topic: string;
  document_id: string | null;
  explanation: string;
  verdict: string;
  summary: string | null;
  gaps: unknown;
  missed: unknown;
  follow_up: string | null;
  probe_question: string | null;
  created_at: string;
};

function asGaps(value: unknown): { point: string; why: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const point = typeof (item as { point?: unknown }).point === "string" ? (item as { point: string }).point.trim() : "";
    const why = typeof (item as { why?: unknown }).why === "string" ? (item as { why: string }).why.trim() : "";
    return point ? [{ point, why: why || point }] : [];
  });
}

function asMissed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function fromRow(row: Row): ExplainAttempt {
  return {
    id: row.id,
    topic: row.topic,
    documentId: row.document_id,
    explanation: row.explanation,
    verdict: (row.verdict as ExplainAttempt["verdict"]) ?? "kismen",
    summary: row.summary ?? "",
    gaps: asGaps(row.gaps),
    missed: asMissed(row.missed),
    followUp: row.follow_up ?? undefined,
    probe: row.probe_question,
    createdAt: row.created_at,
  };
}

export async function saveExplainAttempt(
  service: SupabaseClient,
  input: {
    userId: string;
    topic: string;
    explanation: string;
    documentId?: string | null;
    probe?: string | null;
    review: ExplainReview;
  },
): Promise<ExplainAttempt | null> {
  try {
    const { data, error } = await service
      .from(TABLE)
      .insert({
        user_id: input.userId,
        topic: input.topic,
        document_id: input.documentId ?? null,
        explanation: input.explanation,
        verdict: input.review.verdict,
        summary: input.review.summary,
        gaps: input.review.gaps ?? [],
        missed: input.review.missed ?? [],
        follow_up: input.review.followUp,
        probe_question: input.probe ?? null,
      })
      .select("id, topic, document_id, explanation, verdict, summary, gaps, missed, follow_up, probe_question, created_at")
      .maybeSingle();
    if (error || !data) {
      if (error && !missingSchema(error)) {
        console.warn("[explain-history] save failed", error.message);
      }
      return null;
    }
    return fromRow(data as Row);
  } catch {
    return null;
  }
}

export async function listExplainAttempts(
  service: SupabaseClient,
  input: { userId: string; topic?: string; limit?: number },
): Promise<ExplainAttempt[]> {
  try {
    let query = service
      .from(TABLE)
      .select("id, topic, document_id, explanation, verdict, summary, gaps, missed, follow_up, probe_question, created_at")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 20);
    const topic = input.topic?.trim();
    if (topic) query = query.eq("topic", topic);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as Row[]).map(fromRow);
  } catch {
    return [];
  }
}
