import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIRST_DAY_MIN_ITEMS, chooseExamBaseline, type BaselineAttempt, type ExamBaseline } from "@/lib/learning/exam-result";

/**
 * Başlangıç seviyesinin kayıtları (31 Ekim 2026, Paket J3 #14): hazırlığın ilk tamamlanan seviye tespiti ve yolda
 * puanlı ilk çalışma gününün kayıtları (tür fark etmez). Karar `chooseExamBaseline`'da (saf). Okuma düşerse null: kart yalnız notu yazar.
 */
export async function loadExamBaseline(
  client: SupabaseClient,
  input: { prepId: string; userId: string },
): Promise<ExamBaseline | null> {
  try {
    const [{ data: intro }, { data: attempts }, { data: nodes }] = await Promise.all([
      client
        .from("exam_prep_intro_attempts")
        .select("score, total, created_at")
        .eq("exam_prep_id", input.prepId)
        .eq("user_id", input.userId)
        .eq("status", "completed")
        .gte("total", 3)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      client
        .from("exam_prep_node_attempts")
        .select("node_id, score, total, created_at")
        .eq("exam_prep_id", input.prepId)
        .eq("user_id", input.userId)
        .eq("status", "completed")
        .gte("total", FIRST_DAY_MIN_ITEMS)
        .order("created_at", { ascending: true })
        .limit(200),
      client.from("exam_prep_nodes").select("id, kind").eq("exam_prep_id", input.prepId),
    ]);
    const kindOf = new Map(((nodes ?? []) as { id: string; kind: string }[]).map((node) => [node.id, node.kind] as const));
    const rows: BaselineAttempt[] = ((attempts ?? []) as { node_id?: unknown; score?: unknown; total?: unknown; created_at?: unknown }[]).map(
      (row) => ({
        kind: kindOf.get(String(row.node_id ?? "")) ?? "",
        score: typeof row.score === "number" ? row.score : null,
        total: typeof row.total === "number" ? row.total : null,
        createdAt: String(row.created_at ?? ""),
      }),
    );
    const introRow = intro as { score?: unknown; total?: unknown } | null;
    return chooseExamBaseline({
      intro: introRow
        ? { score: typeof introRow.score === "number" ? introRow.score : null, total: typeof introRow.total === "number" ? introRow.total : null }
        : null,
      attempts: rows,
    });
  } catch {
    return null;
  }
}
