import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { loadDocumentGenerationContext } from "@/lib/documents/generation-context";
import { corePageRun } from "@/lib/learning/core-pages";
import type { TeacherLessonMode } from "@/lib/learning/teacher-lesson";

export type StudioTeacherSource = {
  mode: TeacherLessonMode;
  pages: { page: number; text: string }[];
  edges: string[];
  fileName: string | null;
  /** Belgenin tamamından mı (öğrenci tamamını istedi ya da yazdığı konu belgede yoktu). */
  wholeDocument: boolean;
  /** Yazılan konu belgede bulundu mu; false ise ekran "belgenin tamamından hazırladım" der. */
  matched: boolean;
};

/**
 * Araçlar kısayolları (kart, podcast) için öğretmen motorunun kaynağı
 * (3 Ekim 2026). Belge seçildiyse konunun bitişik çekirdek sayfaları temiz
 * metinle; seçilmediyse belgesiz (konu) kipi. Belge hazır değilse null —
 * çağıran kredi ayırmadan 409 döner.
 */
export async function studioTeacherSource(
  service: SupabaseClient,
  input: { userId: string; topic: string; documentId?: string | null },
): Promise<StudioTeacherSource | null> {
  if (!input.documentId) return { mode: "topic", pages: [], edges: [], fileName: null, wholeDocument: false, matched: true };
  const context = await loadDocumentGenerationContext(service, input.userId, input.documentId, input.topic);
  if (!context) return null;
  const edges = await documentRunningHeaders(service, input.documentId);
  const clean = await ensureCleanPages(service, {
    userId: input.userId,
    documentId: input.documentId,
    // Konu istendiyse bitişik çekirdek (ders gibi tek birim); tamamı istendiyse her konudan seçilmiş
    // sayfalar olduğu gibi (19 Ekim 2026: 8 sayfalık notta podcast son iki dönemi atlıyordu).
    pages: context.wholeDocument ? context.topicPages : corePageRun(context.topicPages),
    edges,
  });
  if (!clean.length) return null;
  return {
    mode: "document",
    pages: clean.map((item) => ({ page: item.page, text: item.text })),
    edges,
    fileName: context.fileName,
    wholeDocument: context.wholeDocument,
    matched: context.matched,
  };
}
