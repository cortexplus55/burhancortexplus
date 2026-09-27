import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 200;

/** PostgREST limits one response to a bounded number of rows. Keep reading
 * until the requested documents' complete, deterministically ordered set is loaded. */
export async function loadPagedDocumentRows(
  service: SupabaseClient,
  table: "document_pages" | "document_topic_nodes" | "document_topic_page_links",
  columns: string,
  documentIds: string[],
  orderFields: string[],
): Promise<Record<string, unknown>[]> {
  if (!documentIds.length) return [];
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = service.from(table).select(columns).in("document_id", documentIds);
    for (const field of ["document_id", ...orderFields]) {
      query = query.order(field, { ascending: true });
    }
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`document_rows_unavailable:${table}`);
    // Dynamic projection strings cannot be inferred by Supabase's static types.
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
