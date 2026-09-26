/**
 * Source-grounded context for adaptive action content.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSourceContext,
  EMPTY_SOURCE_CONTEXT,
} from "@/lib/learning/source-context";
import type { SourceRef } from "@/lib/adaptive/types";

export async function loadActionSourceContext(
  service: SupabaseClient,
  userId: string,
  topicTitle: string,
  documentId?: string | null,
): Promise<{ block: string; sourceRefs: SourceRef[] }> {
  try {
    const ctx = await loadSourceContext(service, userId, topicTitle, {
      documentId: documentId ?? null,
      limit: 4,
      sourceBoundaryMode: documentId ? "documents_only" : "allow_supporting",
    });
    const sourceRefs: SourceRef[] = ctx.matches.slice(0, 4).map((m) => ({
      documentId: m.documentId,
      chunkId: m.chunkId,
      page: m.pageNumber ?? undefined,
      label: m.documentName,
    }));
    return { block: ctx.block || EMPTY_SOURCE_CONTEXT.block, sourceRefs };
  } catch {
    return { block: "", sourceRefs: [] };
  }
}
