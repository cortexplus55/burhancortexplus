import { NextResponse, after } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { requestPrepPrefetch } from "@/lib/learning/lesson-prefetch";
import { shiftFamiliarity } from "@/lib/learning/prep-level";
import { parseFamiliarity } from "@/lib/learning/session-signals";

/**
 * Sonuç ekranındaki "Bu hazırlık sana fazla zor / kolay gelebilir" (18 Ekim 2026, Astra'daki
 * gibi). Öğrencinin seçimiyle bütün konuların düzeyi bir basamak kayar; önceden yazılmış
 * sıradaki içerik eski düzeyde kalmasın diye atılır ve yeni düzeyde yeniden yazılır.
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  direction: z.enum(["easier", "harder"]),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-level", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, direction } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: topics } = await service.from("exam_prep_topics").select("id, familiarity").eq("exam_prep_id", prepId);
  for (const topic of topics ?? []) {
    const current = parseFamiliarity(topic.familiarity);
    const next = shiftFamiliarity(current, direction);
    if (next !== current) {
      const { error } = await service.from("exam_prep_topics").update({ familiarity: next }).eq("id", topic.id);
      if (error) return errorResponse(500, "save_failed");
    }
  }

  // Hazır bekleyen içerik eski düzeyde yazıldı: atılır, sıradaki yeni düzeyde hazırlanır.
  const { data: nodes } = await service.from("exam_prep_nodes").select("id").eq("exam_prep_id", prepId);
  const nodeIds = (nodes ?? []).map((row) => row.id as string);
  if (nodeIds.length) {
    await service
      .from("exam_prep_prefetch")
      .delete()
      .in("node_id", nodeIds)
      .eq("status", "ready")
      .then(undefined, () => undefined);
  }
  const origin = new URL(request.url).origin;
  after(() => requestPrepPrefetch(service, { origin, userId, prepId }));

  return NextResponse.json({ ok: true });
}
