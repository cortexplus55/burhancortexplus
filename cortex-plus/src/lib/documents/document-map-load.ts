import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDocumentMap, readDocumentMap, type DocumentMap, type MapPage } from "@/lib/documents/document-map";

/*
  Belge haritası yükleyicisi (PROMPT-V2 §4, PR-3). Sıra: belgenin kaydındaki harita (`documents.study_map`) → sunucu
  belleği → hesapla ve yaz. Hesap yalnız arka planda çağrılır (`ensureDocumentMap`, `after()` içinde); sohbet turu
  hesap beklemez (`knownDocumentMap` yalnız hazır olanı okur). Göç uygulanmadıysa sütun yok: okuma ve yazma hatası
  yutulur, harita bellekte kalır. Yalnız öğrencinin kendi belgesi (`user_id` süzgeci).

  Disk IO: belge birincil anahtarla, sayfalar `document_id` indeksiyle ve `LIMIT`'le okunur; vektör araması yok.
*/

const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
const MEMORY_MAX = 200;
const PAGE_LIMIT = 1500;

const memory = new Map<string, { at: number; map: DocumentMap }>();
const building = new Map<string, Promise<DocumentMap | null>>();

export function clearDocumentMapMemory(): void {
  memory.clear();
  building.clear();
}

function remember(documentId: string, map: DocumentMap): void {
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string);
  memory.set(documentId, { at: Date.now(), map });
}

function fromMemory(documentId: string): DocumentMap | null {
  const hit = memory.get(documentId);
  return hit && Date.now() - hit.at < MEMORY_TTL_MS ? hit.map : null;
}

async function storedMap(service: SupabaseClient, userId: string, documentId: string): Promise<DocumentMap | null> {
  try {
    const { data, error } = await service
      .from("documents")
      .select("study_map")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return readDocumentMap((data as { study_map?: unknown } | null)?.study_map);
  } catch {
    return null;
  }
}

/** Hazır harita (kayıt ya da bellek); yoksa null. Hesap yapmaz: sohbet turunda çağrılır. */
export async function knownDocumentMap(service: SupabaseClient, userId: string, documentId: string): Promise<DocumentMap | null> {
  return fromMemory(documentId) ?? (await storedMap(service, userId, documentId));
}

/** Haritayı hazırlar: yoksa sayfalardan hesaplar ve kayda yazmayı dener. Arka plan işi; asla fırlatmaz. */
export async function ensureDocumentMap(service: SupabaseClient, userId: string, documentId: string): Promise<DocumentMap | null> {
  const known = await knownDocumentMap(service, userId, documentId);
  if (known) {
    remember(documentId, known);
    return known;
  }
  const running = building.get(documentId);
  if (running) return running;
  const work = (async () => {
    const started = Date.now();
    try {
      const { data: owner, error: ownerError } = await service
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (ownerError || !owner) return null;
      const { data: rows, error } = await service
        .from("document_pages")
        .select("page_number, text_content, clean_text")
        .eq("document_id", documentId)
        .order("page_number", { ascending: true })
        .limit(PAGE_LIMIT);
      if (error || !rows?.length) return null;
      const pages: MapPage[] = (rows as { page_number: number; text_content: string | null; clean_text: string | null }[]).map((row) => ({
        pageNumber: Number(row.page_number),
        text: String(row.clean_text || row.text_content || ""),
      }));
      const map = buildDocumentMap(pages);
      remember(documentId, map);
      const { error: writeError } = await service
        .from("documents")
        .update({ study_map: map })
        .eq("id", documentId)
        .eq("user_id", userId);
      console.info("document_map_built", {
        ms: Date.now() - started,
        pages: pages.length,
        sections: map.sections.length,
        rules: map.rules.length,
        stored: !writeError,
      });
      return map;
    } catch (error) {
      console.warn("document_map_failed", { cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
      return null;
    } finally {
      building.delete(documentId);
    }
  })();
  building.set(documentId, work);
  return work;
}
