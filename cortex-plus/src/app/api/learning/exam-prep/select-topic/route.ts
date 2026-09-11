import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";
import { nodeForTopic } from "@/lib/learning/exam-prep-ui-path";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-select-topic", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, intro_completed_at, intro_deferred_at")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id")
    .eq("id", parsed.data.topicId)
    .eq("exam_prep_id", parsed.data.prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  await service
    .from("exam_preps")
    .update({ active_topic_id: topic.id })
    .eq("id", prep.id);

  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, status, sort_order, session_meta")
    .eq("exam_prep_id", prep.id)
    .order("sort_order");

  if (needsExamIntro(prep.intro_completed_at, nodes ?? [], prep.intro_deferred_at)) {
    return NextResponse.json({ ok: true, nextHref: examPrepIntroHref(prep.id) });
  }

  // Seçilen konunun kendi etkinliği; bulunamazsa plandaki ilk hazır düğüm.
  const chosen = nodeForTopic(
    (nodes ?? []).map((row) => ({
      id: row.id as string,
      sortOrder: (row.sort_order as number) ?? 0,
      status: row.status as "locked" | "ready" | "done",
      sessionMeta: parseSessionMeta(row.session_meta),
    })),
    {
      // Aynı konunun iki kimliği: hazırlığa ait olan ve belgeden gelen.
      // Düğümler belgedekini taşıyor.
      ids: [
        topic.id as string,
        (topic.document_topic_node_id as string | null) ?? null,
      ],
      label: (topic.label as string | null) ?? null,
    },
  );

  // Plan sırayla kilitli geliyor. Öğrenci konuyu kendisi seçtiyse o konu
  // açılmalı: yol haritasını biz veriyoruz, sırayı öğrenci seçiyor. Kilidi
  // açmazsak seçim ekranı kendi seçtiği konuya 403 döndürür.
  if (chosen?.status === "locked") {
    await service
      .from("exam_prep_nodes")
      .update({ status: "ready" })
      .eq("id", chosen.id)
      .eq("exam_prep_id", prep.id);
  }

  const fallback = (nodes ?? []).find((row) => row.status === "ready");
  const target = chosen ?? fallback ?? null;
  return NextResponse.json({
    ok: true,
    nextHref: target
      ? examPrepNodeHref(prep.id, target.id as string)
      : examPrepHomeHref(prep.id),
  });
}
