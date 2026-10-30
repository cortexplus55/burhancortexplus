import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPrepDocumentIds, loadTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";
import { searchDocumentChunksAcross, type DocumentMatch } from "@/lib/rag/pipeline";
import { citationHref } from "@/lib/ai/chat-citations";
import { FIGURE_APPENDIX_LABEL } from "@/lib/learning/figure-pages";
import {
  CHAT_PASSAGE_BUDGET,
  asksAboutFigure,
  coverageDecision,
  exactSearchTokens,
  excerptsForQuestion,
  flattenTeacherAnalysis,
  contentTokens,
  readSyllabusScope,
  lexicalPageHit,
  rerankByOverlap,
  searchStems,
  takeWithinBudget,
  type CorpusDoc,
  type CoverageDecision,
  type SyllabusScope,
} from "@/lib/learning/prep-corpus";
import type { GradedClaim } from "@/lib/learning/tutor-quant";
import { chatMisconceptionRow } from "@/lib/learning/tutor-reply";
import { withOpenMisconceptions } from "@/lib/learning/misconception-store";

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
    // Geniş getir, kelime/sayı örtüşmesiyle yeniden sırala, karakter bütçesiyle doldur (30 Ekim 2026, Paket I #11;
    // önce sabit 4 parça). Eskiden tek belgeli hazırlıkta yalnız 2 pasaj geliyordu.
    const wide = await searchDocumentChunksAcross(service, userId, message, documentIds, {
      limit: 16,
      perDocument: Math.max(4, Math.ceil(16 / documentIds.length)),
    });
    matches = takeWithinBudget(rerankByOverlap(message, wide), CHAT_PASSAGE_BUDGET * 0.6);
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

  // Hazırlıktaki her dosyadan en az bir sayfa: taranmış not aramada boş kalsa da "paylaşılmadı" denmesin.
  const coveredDocs = new Set(passages.map((item) => item.documentId));
  const missingDocs = documentIds.filter((id) => !coveredDocs.has(id));
  if (missingDocs.length) {
    const { data: fallbackPages } = await service
      .from("document_pages")
      .select("document_id, page_number, text_content, clean_text")
      .in("document_id", missingDocs)
      .limit(Math.max(24, missingDocs.length * 4));
    const seenDoc = new Set<string>();
    for (const row of fallbackPages ?? []) {
      const documentId = row.document_id as string;
      if (seenDoc.has(documentId)) continue;
      const text = ((row.clean_text as string | null) || (row.text_content as string | null) || "").trim();
      if (text.length < 40) continue;
      seenDoc.add(documentId);
      const doc = meta.get(documentId);
      const name = (doc?.file_name as string | undefined) ?? "Belge";
      passages.push({
        documentId,
        documentName: name,
        pageNumber: row.page_number as number,
        slide: slideMime(doc?.mime_type as string | null),
        content: text.slice(0, 900),
        href: citationHref({
          reference: 0,
          documentId,
          documentName: name,
          pageNumber: row.page_number as number,
          chunkId: null,
        }),
      });
    }
  }

  // Kelime araması: anlam araması kaçırdığında belgedeki kesin cümleyi bul. Kökler ve kesin belirteçler (kısaltma,
  // sayı, sayı dizisi, formül; 30 Ekim 2026, Paket I #11): "belgede yok" demeden önce bütün sayfalara bakılır.
  const stems = searchStems(message);
  const exactPatterns = exactSearchTokens(message).flatMap((token) => token.patterns);
  const likePatterns = [...new Set([...stems.map((stem) => `%${stem.raw}%`), ...exactPatterns])];
  if (likePatterns.length) {
    try {
      // Kalıp başına ayrı sorgu: sık geçen kök ("kurul") sınırı doldurup nadir
      // kökün ("sendi") sayfasını dışarıda bırakmasın.
      const batches = await Promise.all(
        likePatterns.map((pattern) =>
          service
            .from("document_pages")
            .select("document_id, page_number, text_content, clean_text")
            .in("document_id", documentIds)
            .ilike("text_content", pattern)
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
        .map((item) => ({ ...item, content: item.hit!.excerpt }));
      for (const { row, hit } of takeWithinBudget(scored, CHAT_PASSAGE_BUDGET * 0.3, { min: 2, max: 4 })) {
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

  // Şekil, tablo ya da el notu soruluyorsa şekil okunmuş sayfanın ve fotoğraf belgesinin TAMAMI bağlama girer
  // (30 Ekim 2026, Paket I #11): şekil eki ("Şekilde işaretli değerler:") parçalara bölünüp aramada kayboluyor,
  // öğretmen bir kenarı eksik okuyup yanlış toplam veriyor ya da el notundaki bilgiye "notlarda yok" diyordu.
  if (asksAboutFigure(message)) {
    try {
      const imageDocs = documentIds.filter((id) => /^image\//i.test(String(meta.get(id)?.mime_type ?? "")));
      const [figureQuery, imageQuery] = await Promise.all([
        service
          .from("document_pages")
          .select("document_id, page_number, text_content")
          .in("document_id", documentIds)
          .ilike("text_content", `%${FIGURE_APPENDIX_LABEL}%`)
          .limit(40),
        imageDocs.length
          ? service.from("document_pages").select("document_id, page_number, text_content").in("document_id", imageDocs).limit(20)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);
      const taken = new Set(passages.map((item) => `${item.documentId}:${item.pageNumber}`));
      const rows = new Map<string, Record<string, unknown>>();
      for (const row of [...(figureQuery.data ?? []), ...(imageQuery.data ?? [])]) {
        rows.set(`${row.document_id}:${row.page_number}`, row as Record<string, unknown>);
      }
      const ranked = [...rows.entries()]
        .filter(([key]) => !taken.has(key))
        .map(([, row]) => {
          const text = String(row.text_content ?? "").trim();
          return { row, score: lexicalPageHit(message, text)?.score ?? 0, content: text.slice(0, 2400) };
        })
        .filter((item) => item.content.length >= 40)
        .sort((a, b) => b.score - a.score);
      for (const { row, content } of takeWithinBudget(ranked, CHAT_PASSAGE_BUDGET * 0.45, { min: 1, max: 3 })) {
        const documentId = row.document_id as string;
        const doc = meta.get(documentId);
        const name = (doc?.file_name as string | undefined) ?? "Belge";
        passages.push({
          documentId,
          documentName: name,
          pageNumber: row.page_number as number,
          slide: slideMime(doc?.mime_type as string | null),
          content,
          href: citationHref({ reference: 0, documentId, documentName: name, pageNumber: row.page_number as number, chunkId: null }),
        });
      }
    } catch {
      // Şekil sayfası okunamazsa öbür aramalar yeter.
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
  // Aynı iddianın yalnız AÇIK satırı tekrar yazımı engeller (20 Ekim 2026): çözülmüş yanılgıya
  // yeniden düşen öğrencinin yanılgısı yeniden açılır. Sütun yoksa eskisi gibi bütün satırlar.
  const { data: existing } = await withOpenMisconceptions((onlyOpen) => {
    const query = service
      .from("exam_prep_misconceptions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("claim", row.claim);
    return (onlyOpen ? query.is("resolved_at", null) : query).limit(1);
  });
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
