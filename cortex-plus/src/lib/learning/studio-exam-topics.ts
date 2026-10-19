import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickStudyTopics } from "@/lib/learning/diagnostic";
import { isWholeDocumentRequest, titleScore } from "@/lib/documents/generation-context";

/** `exam_prep_topics.source_refs` biçimi (deneme motoru `documentId`, `nodeId`, `pages` okur). */
export type StudioExamTopic = {
  label: string;
  refs: { documentId: string; nodeId?: string; pages?: number[] }[];
};

export type StudioExamTopics = {
  fileName: string;
  topics: StudioExamTopic[];
  wholeDocument: boolean;
  /** Yazılan konu belgede bulundu mu (false: belgenin tamamına genişledi). */
  matched: boolean;
};

/** Bir yazılıda en çok bu kadar konu; fazlası belgeye eşit aralıkla yayılır. */
const MAX_EXAM_TOPICS = 8;

/** Sıralı listeden eşit aralıkla `limit` öğe (ilk ve son dahil). */
export function spreadPick<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  if (limit <= 1) return items.slice(0, 1);
  const picked = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    picked.add(Math.round((index * (items.length - 1)) / (limit - 1)));
  }
  return [...picked].sort((a, b) => a - b).map((index) => items[index]!);
}

/**
 * Araçlar'daki yazılı deneme belgeden (19 Ekim 2026). Önce yalnız konu yazılabiliyordu; öteki araçlar
 * belge seçerken yazılı "hazırlığının sayfasını aç" diyordu. Konular belgenin kendi çalışma konuları:
 * "Belgenin tamamı" (ya da belgede bulunamayan konu) her bölümden, yazılan konu bulunursa yalnız o.
 *
 * Geçici hazırlığa `document_id` yazılmaz — belge listesi o zaman bu denemeyi belgenin "yolu" sanardı;
 * belge yalnız konuların kaynak bilgisinde durur.
 */
export async function studioExamTopics(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  topic: string,
  questionCount: number,
): Promise<StudioExamTopics | null> {
  const { data: doc } = await service
    .from("documents")
    .select("id, file_name, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc || doc.status !== "completed") return null;
  const fileName = (doc.file_name as string | null) ?? "Belge";

  const { data: nodes } = await service
    .from("document_topic_nodes")
    .select("id, title, parent_id, sort_order")
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });
  const study = pickStudyTopics(
    ((nodes ?? []) as { id: string; title: string; parent_id: string | null }[]).map((row) => ({
      id: row.id,
      title: row.title,
      parentId: row.parent_id ?? null,
    })),
  ).filter((row) => row.title.trim());
  const { data: links } = await service
    .from("document_topic_page_links")
    .select("topic_id, page_number")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });
  const rows = (links ?? []) as { topic_id: string; page_number: number }[];
  const asTopic = (row: { id: string; title: string }): StudioExamTopic => ({
    label: row.title.trim(),
    refs: [{ documentId, nodeId: row.id, pages: rows.filter((link) => link.topic_id === row.id).map((link) => link.page_number) }],
  });
  const whole = (): StudioExamTopic[] => {
    if (!study.length) {
      const label = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Belge";
      return [{ label, refs: [{ documentId }] }];
    }
    return spreadPick(study, Math.max(1, Math.min(MAX_EXAM_TOPICS, questionCount))).map(asTopic);
  };

  if (isWholeDocumentRequest(topic)) return { fileName, topics: whole(), wholeDocument: true, matched: true };
  const best = study
    .map((row) => ({ row, score: titleScore(row.title, topic) }))
    .sort((a, b) => b.score - a.score)[0];
  if (best && best.score > 0) {
    return { fileName, topics: [asTopic(best.row)], wholeDocument: false, matched: true };
  }
  return { fileName, topics: whole(), wholeDocument: true, matched: false };
}
