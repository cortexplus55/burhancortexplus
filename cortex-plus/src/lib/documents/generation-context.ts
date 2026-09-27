import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pageSourceBlock } from "@/lib/learning/source-context";

/** Belge stüdyosunda konu seçimi fiziksel sayfa numaralarına dayanır. */
const PAGE_QUERY_BATCH = 200;
const MAX_CONTEXT_PAGES = 8;

export type DocumentGenerationContext = {
  documentId: string;
  fileName: string;
  excerpt: string;
};

type PageIndexRow = {
  page_number: number;
  headings: string[] | null;
  extraction_ok: boolean | null;
  page_kind: string | null;
};

function fold(text: string): string {
  return text.toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleScore(title: string, query: string): number {
  const wanted = fold(query);
  const label = fold(title);
  if (!wanted || !label) return 0;
  if (wanted === label) return 10;
  if (label.includes(wanted)) return 5;
  const words = wanted.split(" ").filter((word) => word.length >= 3);
  if (!words.length) return 0;
  const found = words.filter((word) => label.split(" ").some((part) =>
    part.startsWith(word) || word.startsWith(part),
  )).length;
  return found / words.length >= 0.67 ? found / words.length : 0;
}

export function representativePages(numbers: number[], limit = MAX_CONTEXT_PAGES): number[] {
  const ordered = [...new Set(numbers)].filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (ordered.length <= limit) return ordered;
  if (limit <= 1) return [ordered[0]];
  return [...new Set(Array.from({ length: limit }, (_, index) =>
    ordered[Math.round((index * (ordered.length - 1)) / (limit - 1))],
  ))];
}

async function loadPageIndex(service: SupabaseClient, documentId: string): Promise<PageIndexRow[] | null> {
  const out: PageIndexRow[] = [];
  for (let offset = 0; ; offset += PAGE_QUERY_BATCH) {
    const { data, error } = await service.from("document_pages")
      .select("page_number, headings, extraction_ok, page_kind")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .range(offset, offset + PAGE_QUERY_BATCH - 1);
    if (error) return null;
    out.push(...((data ?? []) as PageIndexRow[]));
    if ((data ?? []).length < PAGE_QUERY_BATCH) break;
  }
  return out;
}

async function linkedTopicPages(
  service: SupabaseClient,
  documentId: string,
  topic: string,
): Promise<number[] | null> {
  const { data: topics, error } = await service.from("document_topic_nodes")
    .select("id, title")
    .eq("document_id", documentId)
    .is("parent_id", null);
  if (error) return null;
  const chosen = (topics ?? []).map((row) => ({
    id: row.id as string,
    score: titleScore(row.title as string, topic),
  })).sort((a, b) => b.score - a.score)[0];
  if (!chosen || chosen.score <= 0) return [];
  const { data: links, error: linkError } = await service.from("document_topic_page_links")
    .select("page_number")
    .eq("document_id", documentId)
    .eq("topic_id", chosen.id)
    .order("page_number", { ascending: true });
  if (linkError) return null;
  return (links ?? []).map((row) => row.page_number as number);
}

export async function loadDocumentGenerationContext(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  topic: string,
  options: { maxChars?: number } = {},
): Promise<DocumentGenerationContext | null> {
  const { data: doc, error: docError } = await service
    .from("documents")
    .select("id, file_name, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !doc || doc.status !== "completed") return null;

  const fileName = (doc.file_name as string | null) ?? "belge";
  const index = await loadPageIndex(service, documentId);
  if (!index) return null;
  const readable = index.filter((page) =>
    page.extraction_ok !== false && page.page_kind !== "unreadable" && page.page_kind !== "blank",
  );
  if (!readable.length) return null;

  const linked = await linkedTopicPages(service, documentId, topic);
  if (linked === null) return null;
  const readableNumbers = new Set(readable.map((page) => page.page_number));
  let selected = linked.filter((number) => readableNumbers.has(number));
  if (!selected.length) {
    const scored = readable.map((page) => ({
      number: page.page_number,
      score: Math.max(0, ...(page.headings ?? []).map((heading) => titleScore(heading, topic))),
    })).filter((page) => page.score > 0).sort((a, b) => b.score - a.score);
    selected = scored.map((page) => page.number);
  }
  if (!selected.length && (titleScore(fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "), topic) > 0 ||
    /^(tümü|tamamı|genel|belge|doküman)$/i.test(topic.trim()))) {
    selected = readable.map((page) => page.page_number);
  }
  if (!selected.length) return null;

  const chosenNumbers = representativePages(selected);
  const { data: pages, error: pagesError } = await service.from("document_pages")
    .select("page_number, text_content, formulas, extraction_ok, page_kind")
    .eq("document_id", documentId)
    .in("page_number", chosenNumbers)
    .order("page_number", { ascending: true });
  if (pagesError) return null;
  const usable = (pages ?? []).filter((page) =>
    page.extraction_ok !== false && page.page_kind !== "unreadable" &&
    ((page.text_content as string | null) ?? "").trim(),
  ).map((page) => ({
    pageNumber: page.page_number as number,
    text: (page.text_content as string | null) ?? "",
    formulas: ((page.formulas as string[] | null) ?? []).slice(0, 8),
  }));
  if (!usable.length) return null;

  let excerpt = pageSourceBlock(fileName, usable, true);
  if (options.maxChars != null && excerpt.length > options.maxChars) {
    // Sayfa atıf işaretleri ve sonda duran kaynak sınırı yarım kesilmesin.
    while (usable.length > 1 && excerpt.length > options.maxChars) {
      usable.pop();
      excerpt = pageSourceBlock(fileName, usable, true);
    }
  }
  return excerpt.trim() ? { documentId, fileName, excerpt } : null;
}
