import { prepDocumentIds, type PrepDocumentRow } from "@/lib/learning/exam-coverage";

export type ProcessingDocRow = {
  id: string;
  file_name?: string | null;
  topic_map_status?: string | null;
};

/**
 * Dashboard ana aksiyonu yalnızca aktif hazırlığın belgelerindeki işlemeyi
 * bekler; başka bir hazırlığın yarım kalan PDF'i bugünkü oturumu kilitlemez.
 */
export function scopedDocumentIdsForPrep(
  prep: PrepDocumentRow | null | undefined,
): string[] {
  return prepDocumentIds(prep ?? null);
}

export function pickScopedProcessingDocument(
  docs: ProcessingDocRow[],
  scopedIds: string[],
): ProcessingDocRow | null {
  const eligible = docs.filter(
    (doc) =>
      doc.topic_map_status !== "failed" &&
      (scopedIds.length === 0 || scopedIds.includes(doc.id)),
  );
  return eligible[0] ?? null;
}

/** Hazırlıkta çalışılabilir düğüm veya devam yolu varsa işleme NBA'yı kilitlemesin. */
export function processingBlocksNextAction(input: {
  scopedProcessingId: string | null;
  hasRunnablePrepContent: boolean;
}): boolean {
  if (!input.scopedProcessingId) return false;
  return !input.hasRunnablePrepContent;
}
