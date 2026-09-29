import type { SupabaseClient } from "@supabase/supabase-js";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";
import { nodeForTopic } from "@/lib/learning/exam-prep-ui-path";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

/**
 * Hazırlığın etkin konusunu seçer ve öğrencinin gideceği adresi döner.
 *
 * Hem "Konu seç" ucu hem de tek konulu hazırlıkta /konu sayfası kullanır:
 * tek seçenek arasında seçim yaptırmak öğrenciye boş bir tıklama
 * ekletiyordu (29 Eylül, ilk derse kadar giden akış).
 */
export async function selectPrepTopic(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string },
): Promise<{ ok: true; nextHref: string } | { ok: false }> {
  const { data: prep } = await service
    .from("exam_preps")
    .select("id, intro_completed_at, intro_deferred_at")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!prep) return { ok: false };

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id")
    .eq("id", input.topicId)
    .eq("exam_prep_id", input.prepId)
    .maybeSingle();
  if (!topic) return { ok: false };

  await service.from("exam_preps").update({ active_topic_id: topic.id }).eq("id", prep.id);

  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, status, sort_order, session_meta")
    .eq("exam_prep_id", prep.id)
    .order("sort_order");

  if (needsExamIntro(prep.intro_completed_at, nodes ?? [], prep.intro_deferred_at)) {
    return { ok: true, nextHref: examPrepIntroHref(prep.id) };
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
      ids: [topic.id as string, (topic.document_topic_node_id as string | null) ?? null],
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
  return {
    ok: true,
    nextHref: target ? examPrepNodeHref(prep.id, target.id as string) : examPrepHomeHref(prep.id),
  };
}
