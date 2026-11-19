/**
 * Kardeş ünite sınırı (19 Kasım 2026, Faz 1-A §1) — ders bağımsız.
 *
 * Aynı kaynak sayfa aralığını paylaşan üniteler ("kardeş ünite") birbirinin tanımını, kuralını ya da formülünü
 * almasın: ders, konu testi, kartlar, Doğru/Yanlış, podcast ve video aynı sınır bloğunu okur. Sayfası kesişmeyen
 * öbür konular bugünkü kapsam satırında (`prepTopicScopeLine`) kalır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Sınır bloğunun sabit metni (§1). Köşeli yer tutucular çağrıda doldurulur. */
export const EXCLUDED_SIBLING_TOPICS_TEMPLATE =
  "Kaynak sayfalarda şu kardeş ünite başlıkları da bulunuyor: [EXCLUDED_SIBLING_TOPICS]. Bu ünitede YALNIZCA " +
  "[ACTIVE_TOPIC_TITLE] kapsamındaki bilgileri anlat ve yalnız bu başlıktan soru üret. Kardeş başlıklara ait tanımları, " +
  "kanun maddelerini veya formülleri bu üniteye KESİNLİKLE alma.";

/** İstemde en çok bu kadar kardeş adı geçer (istem şişmesin). */
export const EXCLUDED_SIBLING_CAP = 12;

/** Bir ünitenin kaynak sayfaları; belge bilinmiyorsa `documentId` null (sayfa numarasıyla karşılaştırılır). */
export type TopicPageSpan = {
  label: string;
  pages: { documentId: string | null; page: number }[];
};

function foldLabel(label: string): string {
  return label.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

/** Etkin ünitenin dışındaki adlar; boşlar ve tekrarlar bir kez. */
function distinctOthers(active: string, labels: readonly string[]): string[] {
  const own = foldLabel(active);
  const seen = new Map<string, string>();
  for (const label of labels) {
    const key = foldLabel(label);
    if (!key || key === own || seen.has(key)) continue;
    seen.set(key, label.trim().replace(/\s+/g, " "));
  }
  return [...seen.values()];
}

/**
 * Etkin üniteyle en az bir kaynak sayfası paylaşan öbür üniteler (sıra korunur). İki tarafta da belge biliniyorsa
 * belge + sayfa, biri bilinmiyorsa yalnız sayfa numarası karşılaştırılır.
 */
export function siblingTopicsSharingPages(active: TopicPageSpan, others: readonly TopicPageSpan[]): string[] {
  if (!active.pages.length) return [];
  const withDocument = new Set(active.pages.filter((ref) => ref.documentId).map((ref) => `${ref.documentId}:${ref.page}`));
  const undocumented = new Set(active.pages.filter((ref) => !ref.documentId).map((ref) => ref.page));
  const pageNumbers = new Set(active.pages.map((ref) => ref.page));
  const shares = (span: TopicPageSpan) =>
    span.pages.some((ref) =>
      ref.documentId ? withDocument.has(`${ref.documentId}:${ref.page}`) || undocumented.has(ref.page) : pageNumbers.has(ref.page),
    );
  return distinctOthers(
    active.label,
    others.filter((span) => foldLabel(span.label) !== foldLabel(active.label) && shares(span)).map((span) => span.label),
  );
}

/**
 * Sınır bloğu (§1): kardeş yoksa boş. Etkin başlık ve kardeş adları «…» içinde, metnin geri kalanı sabittir.
 */
export function excludedSiblingBoundaryBlock(activeTitle: string, siblings: readonly string[] | null | undefined): string {
  const title = activeTitle.trim().replace(/\s+/g, " ");
  const others = distinctOthers(title, siblings ?? []).slice(0, EXCLUDED_SIBLING_CAP);
  if (!title || !others.length) return "";
  return EXCLUDED_SIBLING_TOPICS_TEMPLATE.replace(
    "[EXCLUDED_SIBLING_TOPICS]",
    others.map((other) => `«${other}»`).join(", "),
  ).replace("[ACTIVE_TOPIC_TITLE]", `«${title}»`);
}

/**
 * Kapsam satırının (`prepTopicScopeLine`) okuyacağı öbür konular: kardeşler katı sınır bloğunda olduğu için
 * oradan çıkar ("gerekirse bir cümleyle an" kuralı kardeşe uygulanmaz).
 */
export function siblingsOutsideBoundary(allOthers: readonly string[], excluded: readonly string[] | null | undefined): string[] {
  if (!excluded?.length) return [...allOthers];
  const strict = new Set(excluded.map(foldLabel));
  return allOthers.filter((label) => !strict.has(foldLabel(label)));
}

type SourceRefRow = { documentId?: unknown; document_id?: unknown; pages?: unknown; page?: unknown };

/** `exam_prep_topics.source_refs` → sayfa listesi (eski `document_id` / tekil `page` biçimleri de okunur). */
export function pagesFromSourceRefs(raw: unknown): TopicPageSpan["pages"] {
  if (!Array.isArray(raw)) return [];
  const out: TopicPageSpan["pages"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const ref = item as SourceRefRow;
    const documentId =
      typeof ref.documentId === "string" && ref.documentId
        ? ref.documentId
        : typeof ref.document_id === "string" && ref.document_id
          ? ref.document_id
          : null;
    const pages = [
      ...(Array.isArray(ref.pages) ? ref.pages : []),
      ...(typeof ref.page === "number" ? [ref.page] : []),
    ].filter((page): page is number => typeof page === "number" && Number.isFinite(page));
    for (const page of pages) out.push({ documentId, page });
  }
  return out;
}

/** `source_refs` içindeki belge konu düğümü kimlikleri (`nodeId`). */
export function nodeIdsFromSourceRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const nodeId = item && typeof item === "object" ? (item as { nodeId?: unknown }).nodeId : null;
    if (typeof nodeId === "string" && nodeId && !out.includes(nodeId)) out.push(nodeId);
  }
  return out;
}

/** `source_refs` içinde belgesi bilinen ama sayfası boş kalan kaynaklar. */
export function pagelessDocumentIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const ref = item as SourceRefRow;
    const documentId =
      typeof ref.documentId === "string" ? ref.documentId : typeof ref.document_id === "string" ? ref.document_id : null;
    const hasPages = (Array.isArray(ref.pages) && ref.pages.length > 0) || typeof ref.page === "number";
    if (documentId && !hasPages && !out.includes(documentId)) out.push(documentId);
  }
  return out;
}

type TopicRow = { id: string; label: string | null; source_refs: unknown; document_topic_node_id: string | null };

/**
 * Hazırlıkta etkin üniteyle aynı kaynak sayfalarını paylaşan üniteler. Sayfalar konunun `source_refs`'inden, yoksa
 * belge konu haritasının sayfa bağlarından (`document_topic_page_links`) okunur; etkin ünitenin o anki çekirdek
 * sayfaları (`core`) da eklenir. Okuma hatasında boş dizi: sınır bloğu yazılmaz, üretim bugünkü gibi sürer.
 */
export async function loadExcludedSiblingTopics(
  service: SupabaseClient,
  input: {
    prepId: string;
    topicLabel: string;
    topicId?: string | null;
    core?: { documentId: string; pages: readonly number[] } | null;
  },
): Promise<string[]> {
  try {
    const { data, error } = await service
      .from("exam_prep_topics")
      .select("id, label, source_refs, document_topic_node_id")
      .eq("exam_prep_id", input.prepId)
      .limit(120);
    if (error || !data?.length) return [];
    const rows = data as TopicRow[];
    const spans = new Map<string, TopicPageSpan>(
      rows.map((row) => [row.id, { label: row.label ?? "", pages: pagesFromSourceRefs(row.source_refs) }]),
    );
    // Sayfası boş konu: önce konu haritasının sayfa bağları (sütundaki ya da `source_refs` içindeki düğüm kimliğiyle).
    const byNode = new Map<string, string>();
    for (const row of rows) {
      if (spans.get(row.id)?.pages.length) continue;
      for (const nodeId of [row.document_topic_node_id, ...nodeIdsFromSourceRefs(row.source_refs)]) {
        if (nodeId && !byNode.has(nodeId)) byNode.set(nodeId, row.id);
      }
    }
    if (byNode.size) {
      const { data: links, error: linkError } = await service
        .from("document_topic_page_links")
        .select("topic_id, document_id, page_number")
        .in("topic_id", [...byNode.keys()])
        .limit(4000);
      if (!linkError) {
        for (const link of (links ?? []) as { topic_id: string; document_id: string | null; page_number: number }[]) {
          const topicId = byNode.get(link.topic_id);
          const span = topicId ? spans.get(topicId) : undefined;
          if (span && typeof link.page_number === "number") {
            span.pages.push({ documentId: link.document_id ?? null, page: link.page_number });
          }
        }
      }
    }
    // Hâlâ sayfasız ve belgesi tek sayfalık olan konu o sayfadadır (fotoğraf, tek sayfalık not): bütün içerik orada.
    const pageless = rows.filter((row) => !spans.get(row.id)?.pages.length);
    const pagelessDocs = [...new Set(pageless.flatMap((row) => pagelessDocumentIds(row.source_refs)))];
    if (pagelessDocs.length) {
      const { data: docs, error: docError } = await service
        .from("documents")
        .select("id, page_count")
        .in("id", pagelessDocs.slice(0, 40));
      if (!docError) {
        const single = new Set(
          ((docs ?? []) as { id: string; page_count: number | null }[]).filter((doc) => doc.page_count === 1).map((doc) => doc.id),
        );
        for (const row of pageless) {
          for (const documentId of pagelessDocumentIds(row.source_refs)) {
            if (single.has(documentId)) spans.get(row.id)?.pages.push({ documentId, page: 1 });
          }
        }
      }
    }
    const own = foldLabel(input.topicLabel);
    const activeRow =
      (input.topicId ? rows.find((row) => row.id === input.topicId) : undefined) ??
      rows.find((row) => foldLabel(row.label ?? "") === own);
    const active: TopicPageSpan = {
      label: input.topicLabel,
      pages: [
        ...(activeRow ? (spans.get(activeRow.id)?.pages ?? []) : []),
        ...(input.core?.pages ?? []).map((page) => ({ documentId: input.core?.documentId ?? null, page })),
      ],
    };
    const others = rows.filter((row) => row.id !== activeRow?.id).map((row) => spans.get(row.id)!);
    return siblingTopicsSharingPages(active, others);
  } catch (error) {
    console.warn("excluded_sibling_topics_load_failed", { cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return [];
  }
}
