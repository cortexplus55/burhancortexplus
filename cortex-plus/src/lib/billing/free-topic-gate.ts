import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { topicIdsOf } from "@/lib/learning/topic-identity";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { firstTopicOwnNodes, gatePrepWide, nodeLockedForFree, type FirstTopicRef, type SummaryNode } from "@/lib/billing/free-topic-rule";

/*
  İlk doz bedava (31 Ekim 2026, ürün sahibinin kararı — Paket J1 #3).

  Ücretsiz hesap ilk (ve tek) sınav hazırlığında bütün konu haritasını görür, **1. konunun** bütün adımlarını
  (ders, konu testi, doğru/yanlış, kartlar, tekrar) tam kalitede açar. 2. konudan itibaren her adım ve hazırlık
  geneli final adımları (zayıf nokta, odaklı pratik, son kontrol, son kartlar, Hazırsın; yazılı deneme zaten Plus)
  Plus ekranını açar: "🚀 1. Konuyu Başarıyla Tamamladın!". Öğrenci tadını aldıktan sonra duvara çarpar; önceden
  yazım da o konulara harcanmaz.

  11 Kasım 2026 (ürün sahibinin kararı): ilk hazırlıkta 1. konunun adımlarının ilk açılışı "derse dahil" sayacıyla
  ayrılır (`first-lesson-cycle.ts`). Aynı akşam haftalık ders hakkı kalktı (ücretsiz hesap = tek ders): Çalışma
  Stüdyosu üretimleri, "Farklı anlat" ve ilk hazırlık dışındaki dersler Plus'a yönlenir (`free-lesson-gate.ts`).
  Sohbet ve fotoğraf sayaçları değişmedi.
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

export type FirstTopicRow = { first: FirstTopicRef; firstIds: ReadonlySet<string> };

/** Kapı bu hesapta çalışır mı ve 1. konu hangisi; abone, kurucu ya da konusuz hazırlıkta null. */
async function loadFirstTopic(service: SupabaseClient, userId: string, prepId: string): Promise<FirstTopicRow | null> {
  const [entitlements, exempt] = await Promise.all([
    getUserEntitlements(service, userId),
    billingExempt(service, userId).catch(() => false),
  ]);
  if (entitlements.isPremium || exempt) return null;
  return readFirstTopic(service, prepId);
}

/** Hazırlığın 1. konusu (`exam_prep_topics.sort_order`); hesabın planına bakmaz. Konusuz hazırlıkta null. */
export async function readFirstTopic(service: SupabaseClient, prepId: string): Promise<FirstTopicRow | null> {
  const { data: first } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id")
    .eq("exam_prep_id", prepId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!first) return null;
  const firstIds = new Set(topicIdsOf({ id: first.id as string, documentTopicNodeId: (first.document_topic_node_id as string | null) ?? null }));
  return { first: { label: String(first.label ?? ""), ids: firstIds }, firstIds };
}

/** Ücretsiz hesapta açık olan tek konunun adı; abone, kurucu ya da konusuz hazırlıkta null (kilit yok). */
export async function freeOpenTopicLabel(service: SupabaseClient, userId: string, prepId: string): Promise<string | null> {
  return (await loadFirstTopic(service, userId, prepId))?.first.label ?? null;
}

/** Kilitliyse 1. konunun özeti, açıksa null. Başlatma isteği ve adım sayfası bunu çağırır (tek kaynak). */
export async function freeTopicGate(service: SupabaseClient, input: GateInput): Promise<FirstTopicSummary | null> {
  const row = await loadFirstTopic(service, input.userId, input.prepId);
  if (!row) return null;
  const base = { nodeTopicId: input.nodeTopicId, prepWide: input.prepWide, requestedTopicLabel: input.requestedTopicLabel };
  if (!nodeLockedForFree(row.first, { ...base, opened: false })) return null;

  // Kararın yayınından önce açılmış adım: kaydı varsa açılmaya devam eder.
  const { count: opened } = await service
    .from("exam_prep_node_attempts")
    .select("id", { count: "exact", head: true })
    .eq("node_id", input.nodeId)
    .eq("user_id", input.userId);
  if ((opened ?? 0) > 0) return null;

  return summarizeFirstTopic(service, { userId: input.userId, prepId: input.prepId, title: row.first.label, firstIds: row.firstIds });
}

/**
 * Hazırlık yolu için toplu karar (Paket J takip #1): hangi adımlar kilitli ve 1. konunun özeti. Yol `?konu=` taşımaz,
 * o yüzden hazırlık geneli adımda seçilmiş konu yok (sayfa ve başlatma isteğiyle aynı girdi). Kilit yoksa null.
 */
export async function freeTopicLocks(
  service: SupabaseClient,
  input: { userId: string; prepId: string; nodes: readonly { id: string; kind: string; sessionMeta: unknown; topicLabel: string }[] },
): Promise<{ summary: FirstTopicSummary; lockedIds: string[] } | null> {
  const row = await loadFirstTopic(service, input.userId, input.prepId);
  if (!row) return null;
  const candidates = input.nodes.filter((node) =>
    nodeLockedForFree(row.first, {
      nodeTopicId: ((node.sessionMeta as { topicId?: string } | null)?.topicId ?? null) || null,
      prepWide: gatePrepWide(node.kind, node.sessionMeta, node.topicLabel),
      requestedTopicLabel: null,
      opened: false,
    }),
  );
  if (!candidates.length) return null;
  const { data: attempts, error } = await service
    .from("exam_prep_node_attempts")
    .select("node_id")
    .eq("user_id", input.userId)
    .in("node_id", candidates.map((node) => node.id));
  if (error) return null;
  const opened = new Set(((attempts ?? []) as { node_id: string }[]).map((attempt) => attempt.node_id));
  const lockedIds = candidates.filter((node) => !opened.has(node.id)).map((node) => node.id);
  if (!lockedIds.length) return null;
  const summary = await summarizeFirstTopic(service, { userId: input.userId, prepId: input.prepId, title: row.first.label, firstIds: row.firstIds });
  return { summary, lockedIds };
}

async function summarizeFirstTopic(
  service: SupabaseClient,
  input: { userId: string; prepId: string; title: string; firstIds: ReadonlySet<string> },
): Promise<FirstTopicSummary> {
  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, title, session_meta")
    .eq("exam_prep_id", input.prepId);
  const mine = firstTopicOwnNodes((nodes ?? []) as SummaryNode[], input.firstIds);
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

/**
 * Ücretsiz hesabın ilk dersi ne durumda (11 Kasım 2026 akşamı: ücretsiz hesap = tek ders). /krediler eski haftalık
 * ders sayacının yerine bunu gösterir: hazırlık yok ("none"), ilk ders açık ("open") ya da 1. konunun ders adımları
 * bitti ("done"). Okunamazsa null (sayfa durum yerine yalnız kuralı yazar).
 */
export type FirstLessonStatus = { state: "none" | "open" | "done"; prepId: string | null; title: string | null };

export async function firstLessonStatus(service: SupabaseClient, userId: string): Promise<FirstLessonStatus | null> {
  try {
    const { data: prep, error } = await service
      .from("exam_preps")
      .select("id")
      .eq("user_id", userId)
      .neq("exam_type", "hedef")
      .neq("exam_type", STUDIO_EXAM_TYPE)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) return null;
    if (!prep?.id) return { state: "none", prepId: null, title: null };
    const prepId = prep.id as string;
    const row = await readFirstTopic(service, prepId);
    if (!row) return { state: "open", prepId, title: null };
    const { data: nodes, error: nodesError } = await service
      .from("exam_prep_nodes")
      .select("id, kind, status, title, session_meta")
      .eq("exam_prep_id", prepId);
    if (nodesError) return null;
    const lessons = firstTopicOwnNodes((nodes ?? []) as SummaryNode[], row.firstIds).filter((node) => node.kind === "lesson");
    const done = lessons.length > 0 && lessons.every((node) => node.status === "done");
    return { state: done ? "done" : "open", prepId, title: row.first.label || null };
  } catch {
    return null;
  }
}
