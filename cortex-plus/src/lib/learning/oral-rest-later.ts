import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sözlü sınavın kalan soruları (3 Kasım 2026, t260u): 1. soru yanıtla gider, kalanlar burada yazılıp kayda eklenir.
 * Öğrenci `progress` ile yoklar. Kayıt yalnız açıkken değişir; yazım düşerse `oralPending` kalkar ve sınav eldeki
 * sorularla biter (öğrenci takılmaz).
 */
export async function fillOralRestLater(
  service: SupabaseClient,
  input: { attemptId: string; task: () => Promise<Record<string, unknown>[]> },
): Promise<{ added: number }> {
  let rest: Record<string, unknown>[] = [];
  try {
    rest = await input.task();
  } catch {
    rest = [];
  }
  try {
    const { data } = await service
      .from("exam_prep_node_attempts")
      .select("payload, status")
      .eq("id", input.attemptId)
      .maybeSingle();
    const payload = (data?.payload ?? null) as Record<string, unknown> | null;
    if (!payload || data?.status !== "active") return { added: 0 };
    const { oralPending: _pending, ...base } = payload;
    void _pending;
    const questions = [...((base.questions as unknown[]) ?? []), ...rest];
    const { error } = await service
      .from("exam_prep_node_attempts")
      .update({ payload: { ...base, questions }, total: questions.length })
      .eq("id", input.attemptId)
      .eq("status", "active");
    console.info("oral_rest_later", { attemptId: input.attemptId, added: rest.length, ok: !error });
    return { added: error ? 0 : rest.length };
  } catch (error) {
    console.warn("oral_rest_later_failed", {
      attemptId: input.attemptId,
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { added: 0 };
  }
}
