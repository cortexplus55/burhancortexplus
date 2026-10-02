import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPrepDocumentIds, loadTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";
import { searchDocumentChunksAcross, type DocumentMatch } from "@/lib/rag/pipeline";
import { citationHref } from "@/lib/ai/chat-citations";
import {
  coverageDecision,
  excerptsForQuestion,
  flattenTeacherAnalysis,
  contentTokens,
  readSyllabusScope,
  lexicalPageHit,
  rerankByOverlap,
  searchStems,
  type CorpusDoc,
  type CoverageDecision,
  type SyllabusScope,
} from "@/lib/learning/prep-corpus";
import type { GradedClaim } from "@/lib/learning/tutor-quant";
import { chatMisconceptionRow } from "@/lib/learning/tutor-reply";

export type PrepPassage = {
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  slide: boolean;
  content: string;
  href: string;
};

export type PrepChatGrounding = {
  decision: CoverageDecision;
  scope: SyllabusScope;
  excerpts: string;
  passages: PrepPassage[];
  corpus: string;
};

const EMPTY_SCOPE: SyllabusScope = { excluded: [], weighted: [] };

function slideMime(mime: string | null | undefined): boolean {
  return Boolean(mime && /presentation|powerpoint/i.test(mime));
}

/**
 * Hazırlıktaki her belgenin saklı öğretmen analizini ve bulunan pasajları okur.
 * Analiz veya arama düşerse boş korpus döner; sohbet yine cevap verir.
 */
export async function loadPrepChatGrounding(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  message: string,
): Promise<PrepChatGrounding> {
  const documentIds = await loadPrepDocumentIds(service, prepId);
  if (!documentIds.length) {
    return { decision: "unknown", scope: EMPTY_SCOPE, excerpts: "", passages: [], corpus: "" };
  }

  const { data: docs } = await service
    .from("documents")
    .select("id, file_name, mime_type")
    .in("id", documentIds)
    .eq("user_id", userId);

  const meta = new Map((docs ?? []).map((doc) => [doc.id as string, doc]));
  const corpusDocs: CorpusDoc[] = [];
  const scopeInputs: Array<{ documentName: string; text: string; pageNumber?: number | null; analysis?: unknown }> = [];

  for (const documentId of documentIds) {
    const row = meta.get(documentId);
    const name = (row?.file_name as string | undefined) ?? "Belge";
    const analysis = await loadTeacherAnalysis(service, documentId);
    const flat = analysis ? flattenTeacherAnalysis(analysis, name) : "";
    if (flat) {
      corpusDocs.push({
        documentId,
        documentName: name,
        text: flat,
        slide: slideMime(row?.mime_type as string | null),
      });
    }
    const { data: raw } = await service
      .from("document_teacher_analyses")
      .select("analysis")
      .eq("document_id", documentId)
      .maybeSingle();
    scopeInputs.push({ documentName: name, text: flat, analysis: raw?.analysis ?? analysis });
  }

  const { data: scopePages } = await service
    .from("document_pages")
    .select("document_id, page_number, text_content")
    .in("document_id", documentIds)
    .or("text_content.ilike.%kapsam%,text_content.ilike.%ağırlık%,text_content.ilike.%agirlik%")
    .limit(24);

  for (const page of scopePages ?? []) {
    const documentId = page.document_id as string;
    const row = meta.get(documentId);
    const name = (row?.file_name as string | undefined) ?? "Belge";
    const text = (page.text_content as string | null) ?? "";
    if (!text.trim()) continue;
    scopeInputs.push({
      documentName: name,
      text,
      pageNumber: page.page_number as number,
    });
    corpusDocs.push({
      documentId,
      documentName: name,
      text,
      pageNumber: page.page_number as number,
      slide: slideMime(row?.mime_type as string | null),
    });
  }

  let matches: DocumentMatch[] = [];
  try {
    // Geniş getir, kelime/sayı örtüşmesiyle yeniden sırala, en iyi 4'ü ver.
    // Eskiden tek belgeli hazırlıkta yalnız 2 pasaj geliyordu.
    const wide = await searchDocumentChunksAcross(service, userId, message, documentIds, {
      limit: 12,
      perDocument: Math.max(3, Math.ceil(12 / documentIds.length)),
    });
    matches = rerankByOverlap(message, wide).slice(0, 4);
  } catch {
    matches = [];
  }

  const passages: PrepPassage[] = matches.map((match) => {
    const row = meta.get(match.documentId);
    const slide = slideMime(row?.mime_type as string | null);
    return {
      documentId: match.documentId,
      documentName: match.documentName,
      pageNumber: match.pageNumber,
      slide,
      content: match.content,
      href: citationHref({
        reference: 0,
        documentId: match.documentId,
        documentName: match.documentName,
        pageNumber: match.pageNumber,
        chunkId: match.chunkId,
      }),
    };
  });

  // Kelime araması: anlam araması kaçırdığında belgedeki kesin cümleyi bul.
  const stems = searchStems(message);
  if (stems.length) {
    try {
      // Kök başına ayrı sorgu: sık geçen kök ("kurul") sınırı doldurup nadir
      // kökün ("sendi") sayfasını dışarıda bırakmasın.
      const batches = await Promise.all(
        stems.map((stem) =>
          service
            .from("document_pages")
            .select("document_id, page_number, text_content, clean_text")
            .in("document_id", documentIds)
            .ilike("text_content", `%${stem.raw}%`)
            .limit(40),
        ),
      );
      const unique = new Map<string, Record<string, unknown>>();
      for (const batch of batches) {
        for (const row of batch.data ?? []) unique.set(`${row.document_id}:${row.page_number}`, row);
      }
      const hits = [...unique.values()];
      const taken = new Set(passages.map((item) => `${item.documentId}:${item.pageNumber}`));
      const scored = hits
        .map((row) => {
          const text = ((row.clean_text as string | null) || (row.text_content as string | null) || "").trim();
          return { row, hit: text ? lexicalPageHit(message, text) : null };
        })
        .filter((item) => item.hit && item.hit.score >= Math.min(2, stems.length))
        .sort((a, b) => b.hit!.score - a.hit!.score)
        .filter((item) => !taken.has(`${item.row.document_id}:${item.row.page_number}`))
        .slice(0, 2);
      for (const { row, hit } of scored) {
        const documentId = row.document_id as string;
        const doc = meta.get(documentId);
        const name = (doc?.file_name as string | undefined) ?? "Belge";
        passages.push({
          documentId,
          documentName: name,
          pageNumber: row.page_number as number,
          slide: slideMime(doc?.mime_type as string | null),
          content: hit!.excerpt,
          href: citationHref({ reference: 0, documentId, documentName: name, pageNumber: row.page_number as number, chunkId: null }),
        });
      }
    } catch {
      // Kelime araması düşerse anlam araması yeter.
    }
  }

  for (const passage of passages) {
    corpusDocs.push({
      documentId: passage.documentId,
      documentName: passage.documentName,
      text: passage.content,
      pageNumber: passage.pageNumber,
      slide: passage.slide,
    });
  }

  if (!passages.length) {
    const tokens = contentTokens(message);
    const seen = new Set<string>();
    for (const doc of corpusDocs) {
      if (doc.pageNumber == null || !tokens.length) continue;
      const hay = new Set(contentTokens(doc.text));
      if (!tokens.some((token) => hay.has(token))) continue;
      const key = `${doc.documentId}:${doc.pageNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      passages.push({
        documentId: doc.documentId,
        documentName: doc.documentName,
        pageNumber: doc.pageNumber,
        slide: Boolean(doc.slide),
        content: doc.text.slice(0, 400),
        href: citationHref({
          reference: 0,
          documentId: doc.documentId,
          documentName: doc.documentName,
          pageNumber: doc.pageNumber,
          chunkId: null,
        }),
      });
      if (passages.length >= 2) break;
    }
  }

  const scope = readSyllabusScope(scopeInputs);
  const decision = coverageDecision(message, corpusDocs, passages.length);
  const excerpts = excerptsForQuestion(message, corpusDocs);
  const corpus = corpusDocs.map((doc) => doc.text).join("\n");
  return { decision, scope, excerpts, passages, corpus };
}

export async function recordChatMisconception(
  service: SupabaseClient,
  input: { userId: string; prepId: string; grade: GradedClaim; question: string },
): Promise<void> {
  const row = chatMisconceptionRow(input.grade, input.question);
  const { data: existing } = await service
    .from("exam_prep_misconceptions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("claim", row.claim)
    .limit(1);
  if (existing && existing.length > 0) return;
  await service.from("exam_prep_misconceptions").insert({
    user_id: input.userId,
    exam_prep_id: input.prepId,
    topic_label: row.topic_label,
    claim: row.claim,
    corrected: row.corrected,
    wrong_type: row.wrong_type,
    source_kind: row.source_kind,
    question_preview: row.question_preview,
  });
  await service.from("weak_topics").insert({
    user_id: input.userId,
    topic_label: row.topic_label,
    severity: input.grade.verdict === "yanlis" ? 0.8 : 0.45,
    source: "chat",
  });
}
