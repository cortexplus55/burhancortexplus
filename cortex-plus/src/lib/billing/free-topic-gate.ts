import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { topicIdsOf } from "@/lib/learning/topic-identity";

/*
  İlk doz bedava (31 Ekim 2026, ürün sahibinin kararı — Paket J1 #3).

  Ücretsiz hesap ilk (ve tek) sınav hazırlığında bütün konu haritasını görür, **1. konunun** bütün adımlarını
  (ders, konu testi, doğru/yanlış, kartlar, tekrar) tam kalitede açar. 2. konudan itibaren her adım ve hazırlık
  geneli final adımları (zayıf nokta, odaklı pratik, son kontrol, son kartlar, Hazırsın; yazılı deneme zaten Plus)
  Plus ekranını açar: "🚀 1. Konuyu Başarıyla Tamamladın!". Öğrenci tadını aldıktan sonra duvara çarpar; önceden
  yazım da o konulara harcanmaz.

  Haftalık ders sayacı (3) 1. konunun içinde geçerli kalır; Araçlar, sohbet ve fotoğraf sayaçları değişmedi.
  "1. konu" = hazırlığın konu listesinde ilk konu (`exam_prep_topics.sort_order`; yol bu sırayla kurulur).
  Daha önce açılmış (kaydı olan) adım açılmaya devam eder: kararın yayınından önce başlanan konu yarıda kalmasın.
  Abone ve kurucu (önizleme kapalı) muaf; okuma düşerse kapı kapanmaz (öğrenci aleyhine hata yapma).
*/

export const FREE_TOPIC_LIMIT_CODE = "free_topic_limit";

export type FirstTopicSummary = {
  title: string;
  /** 1. konunun yoldaki bitmiş / toplam adımı. */
  done: number;
  total: number;
  lessonsDone: number;
  /** 1. konunun puanlı adımlarındaki en iyi sonuç (%); yoksa null. */
  bestScore: number | null;
  completed: boolean;
};

type GateInput = {
  userId: string;
  prepId: string;
  nodeId: string;
  /** Düğümün kendi konusu (`session_meta.topicId`); hazırlık geneli adımda devralınmış olabilir. */
  nodeTopicId: string | null;
  /** Hazırlık geneli adım ve öğrenci konu seçmedi: kendi konusu yok, final adımı sayılır. */
  prepWide: boolean;
  /** Hazırlık geneli adımda öğrencinin seçtiği konu (`?konu=`). */
  requestedTopicLabel: string | null;
};

function foldLabel(value: string | null | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr");
}

/** Kilitliyse 1. konunun özeti, açıksa null. */
export async function freeTopicGate(service: SupabaseClient, input: GateInput): Promise<FirstTopicSummary | null> {
  const [entitlements, exempt] = await Promise.all([
    getUserEntitlements(service, input.userId),
    billingExempt(service, input.userId).catch(() => false),
  ]);
  if (entitlements.isPremium || exempt) return null;

  const { data: first } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id")
    .eq("exam_prep_id", input.prepId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!first) return null;
  const firstIds = new Set(topicIdsOf({ id: first.id as string, documentTopicNodeId: (first.document_topic_node_id as string | null) ?? null }));

  const open = input.prepWide
    ? Boolean(input.requestedTopicLabel) && foldLabel(input.requestedTopicLabel) === foldLabel(first.label as string)
    : Boolean(input.nodeTopicId) && firstIds.has(input.nodeTopicId!);
  if (open) return null;

  // Kararın yayınından önce açılmış adım: kaydı varsa açılmaya devam eder.
  const { count: opened } = await service
    .from("exam_prep_node_attempts")
    .select("id", { count: "exact", head: true })
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId);
  if ((opened ?? 0) > 0) return null;

  return summarizeFirstTopic(service, { userId: input.userId, prepId: input.prepId, title: String(first.label ?? ""), firstIds });
}

async function summarizeFirstTopic(
  service: SupabaseClient,
  input: { userId: string; prepId: string; title: string; firstIds: ReadonlySet<string> },
): Promise<FirstTopicSummary> {
  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, session_meta")
    .eq("exam_prep_id", input.prepId);
  const mine = ((nodes ?? []) as { id: string; kind: string; status: string; session_meta: { topicId?: string } | null }[])
    .filter((node) => node.session_meta?.topicId && input.firstIds.has(node.session_meta.topicId));
  const done = mine.filter((node) => node.status === "done");
  let bestScore: number | null = null;
  const scored = mine.filter((node) => node.kind !== "lesson").map((node) => node.id);
  if (scored.length) {
    const { data: attempts } = await service
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .in("node_id", scored)
      .limit(200);
    for (const row of (attempts ?? []) as { score: number | null; total: number | null }[]) {
      const total = Number(row.total ?? 0);
      if (total < 1) continue;
      const percent = Math.round((Number(row.score ?? 0) / total) * 100);
      if (bestScore == null || percent > bestScore) bestScore = Math.min(100, percent);
    }
  }
  return {
    title: input.title,
    done: done.length,
    total: mine.length,
    lessonsDone: done.filter((node) => node.kind === "lesson").length,
    bestScore,
    completed: mine.length > 0 && done.length === mine.length,
  };
}
