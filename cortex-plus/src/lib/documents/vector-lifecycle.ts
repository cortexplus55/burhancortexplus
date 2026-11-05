import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { ensureDocumentEmbeddings, type EmbedFn } from "@/lib/documents/document-dedup";
import { missingColumn } from "@/lib/learning/missing-column";

/*
  Soğuk bellek (5 Kasım 2026, lansman zırhı). `document_embeddings` (vector(1536)) veritabanının en ağır tablosu;
  sınavı çoktan geçmiş, haftalardır açılmayan hazırlıkların vektörleri yer tutar. Günlük bakım, sınav tarihi
  45+ gün geçmiş ve son 30 gündür hiçbir etkinlik kaydı güncellenmemiş hazırlıkların belgelerinin YALNIZ gömme
  satırlarını siler; sayfa metinleri, parçalar, dersler ve kayıtlar olduğu gibi kalır. Belge `embeddings_evicted_at`
  ile işaretlenir; öğrenci o hazırlığı yeniden açınca (hazırlık sayfası) parçalar arka planda yeniden gömülür
  (yalnız gömme çağrısı; OCR ve okuma yok). Bir belge başka (aktif) bir hazırlıkta da duruyorsa dokunulmaz.
  Anahtar: feature_flags `vector_eviction`. Göç yoksa (sütun yok) hiçbir şey yapılmaz.
*/

export const COLD_EXAM_DAYS = 45;
export const COLD_IDLE_DAYS = 30;
export const EVICTION_FLAG = "vector_eviction";
const DAY_MS = 24 * 60 * 60 * 1000;

export type ColdCutoffs = { examBeforeIso: string; idleAfterIso: string };

export function coldCutoffs(now: Date = new Date()): ColdCutoffs {
  return {
    examBeforeIso: new Date(now.getTime() - COLD_EXAM_DAYS * DAY_MS).toISOString().slice(0, 10),
    idleAfterIso: new Date(now.getTime() - COLD_IDLE_DAYS * DAY_MS).toISOString(),
  };
}

export type PrepDocRefs = { document_id?: string | null; source_document_ids?: unknown };

/** Hazırlığın belge kimlikleri: ana belge + kaynak listesi (tekrarsız). */
export function prepDocumentIds(prep: PrepDocRefs): string[] {
  const ids = new Set<string>();
  if (typeof prep.document_id === "string" && prep.document_id) ids.add(prep.document_id);
  if (Array.isArray(prep.source_document_ids)) {
    for (const id of prep.source_document_ids) if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/** Saf karar: hazırlık soğuk mu — sınavı 45+ gün önce geçti ve 30 gündür etkinlik kaydı yok. */
export function prepIsCold(input: { examDate: string | null; lastActivityIso: string | null }, cutoffs: ColdCutoffs): boolean {
  if (!input.examDate || input.examDate >= cutoffs.examBeforeIso) return false;
  return !input.lastActivityIso || input.lastActivityIso < cutoffs.idleAfterIso;
}

/** Saf karar: belge ancak ONA GÖNDERME YAPAN bütün hazırlıklar soğuksa tahliye edilir. */
export function documentEvictable(referencing: { prepId: string; cold: boolean }[]): boolean {
  return referencing.length > 0 && referencing.every((ref) => ref.cold);
}

export type EvictionReport = {
  scannedPreps: number;
  coldPreps: number;
  evictedDocuments: number;
  evictedRows: number;
  skipped: string | null;
};

async function lastActivity(service: SupabaseClient, prepId: string, idleAfterIso: string): Promise<string | null> {
  const { data: nodes } = await service.from("exam_prep_nodes").select("id").eq("exam_prep_id", prepId).limit(500);
  const nodeIds = ((nodes ?? []) as { id: string }[]).map((row) => row.id);
  if (!nodeIds.length) return null;
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select("updated_at")
    .in("node_id", nodeIds)
    .gte("updated_at", idleAfterIso)
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as { updated_at: string }[])[0];
  return row?.updated_at ?? null;
}

async function evictDocument(service: SupabaseClient, documentId: string, nowIso: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data: chunks } = await service.from("document_chunks").select("id").eq("document_id", documentId).limit(500);
    const ids = ((chunks ?? []) as { id: string }[]).map((row) => row.id);
    if (!ids.length) break;
    const { count, error } = await service.from("document_embeddings").delete({ count: "exact" }).in("chunk_id", ids);
    if (error) throw new Error("embedding_delete_failed");
    if (!count) break;
    removed += count;
    if (count < ids.length) break;
  }
  const { error } = await service.from("documents").update({ embeddings_evicted_at: nowIso }).eq("id", documentId);
  if (error) throw error;
  return removed;
}

/**
 * Günlük bakım adımı: soğuk hazırlıkların belgelerinin gömmelerini siler. Süre ve sayı sınırlı; kalan yarın.
 */
export async function evictColdEmbeddings(
  service: SupabaseClient,
  options: { now?: Date; limit?: number; budgetMs?: number } = {},
): Promise<EvictionReport> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);
  // Bütçe gerçek saatten: `now` ölçüm/karar tarihi (testte sabit), süre sınırı duvar saatidir.
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  const report: EvictionReport = { scannedPreps: 0, coldPreps: 0, evictedDocuments: 0, evictedRows: 0, skipped: null };
  if (!(await isFeatureEnabled(service, EVICTION_FLAG))) return { ...report, skipped: "flag_off" };
  const cutoffs = coldCutoffs(now);

  const { data: preps, error } = await service
    .from("exam_preps")
    .select("id, exam_date, document_id, source_document_ids")
    .lt("exam_date", cutoffs.examBeforeIso)
    .or("document_id.not.is.null,source_document_ids.not.is.null")
    .order("exam_date", { ascending: true })
    .limit(300);
  if (error) return { ...report, skipped: missingColumn(error) ? "schema" : "prep_query_failed" };
  const rows = (preps ?? []) as ({ id: string; exam_date: string | null } & PrepDocRefs)[];
  report.scannedPreps = rows.length;

  const coldPrepIds = new Set<string>();
  const candidates = new Set<string>();
  for (const prep of rows) {
    if (Date.now() > deadline) break;
    const last = await lastActivity(service, prep.id, cutoffs.idleAfterIso);
    if (!prepIsCold({ examDate: prep.exam_date, lastActivityIso: last }, cutoffs)) continue;
    coldPrepIds.add(prep.id);
    for (const id of prepDocumentIds(prep)) candidates.add(id);
  }
  report.coldPreps = coldPrepIds.size;

  const nowIso = now.toISOString();
  for (const documentId of candidates) {
    if (report.evictedDocuments >= limit || Date.now() > deadline) break;
    const { data: doc, error: docError } = await service
      .from("documents")
      .select("id, status, part_of, deleted_at, embeddings_evicted_at")
      .eq("id", documentId)
      .maybeSingle();
    if (docError) return { ...report, skipped: missingColumn(docError) ? "schema" : "doc_query_failed" };
    const row = doc as { status: string; part_of: string | null; deleted_at: string | null; embeddings_evicted_at: string | null } | null;
    if (!row || row.status !== "completed" || row.part_of || row.deleted_at || row.embeddings_evicted_at) continue;
    const { data: referencing } = await service
      .from("exam_preps")
      .select("id")
      .or(`document_id.eq.${documentId},source_document_ids.cs.{${documentId}}`)
      .limit(200);
    const refs = ((referencing ?? []) as { id: string }[]).map((ref) => ({ prepId: ref.id, cold: coldPrepIds.has(ref.id) }));
    if (!documentEvictable(refs)) continue;
    try {
      report.evictedRows += await evictDocument(service, documentId, nowIso);
      report.evictedDocuments += 1;
    } catch (cause) {
      console.warn("vector_eviction_failed", { documentId, cause: cause instanceof Error ? cause.message.slice(0, 120) : "unknown" });
    }
  }
  return report;
}

/** Tahliye edilmiş belgeyi yeniden indeksler: eksik gömmeler yazılır, işaret kalkar. */
export async function reindexDocumentEmbeddings(service: SupabaseClient, documentId: string, embed: EmbedFn): Promise<number> {
  const written = await ensureDocumentEmbeddings(service, documentId, embed);
  await service.from("documents").update({ embeddings_evicted_at: null }).eq("id", documentId);
  return written;
}

/** Hazırlık açılınca: belgelerinden tahliye edilmiş olanlar arka planda yeniden indekslenir. */
export async function reindexEvictedForPrep(service: SupabaseClient, prepId: string, embed: EmbedFn): Promise<number> {
  const { data: prep } = await service.from("exam_preps").select("document_id, source_document_ids").eq("id", prepId).maybeSingle();
  const ids = prepDocumentIds((prep ?? {}) as PrepDocRefs);
  if (!ids.length) return 0;
  const { data: docs, error } = await service
    .from("documents")
    .select("id")
    .in("id", ids)
    .not("embeddings_evicted_at", "is", null);
  if (error || !docs?.length) return 0;
  let total = 0;
  for (const doc of docs as { id: string }[]) {
    try {
      total += await reindexDocumentEmbeddings(service, doc.id, embed);
    } catch (cause) {
      console.warn("vector_reindex_failed", { documentId: doc.id, cause: cause instanceof Error ? cause.message.slice(0, 120) : "unknown" });
    }
  }
  return total;
}
