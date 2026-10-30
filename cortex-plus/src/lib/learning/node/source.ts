/**
 * Açılışın kaynağı: hazırlığın belgeleri, öğretmen analizi, konunun kendi sayfaları (öğretmen motorları), sözlü
 * "Tüm sınav" dengeli kaynağı, podcast korpusu. Belgeli hazırlıkta boş kaynak üretime gitmez.
 */
import "server-only";
import { errorResponse } from "@/lib/api/guards";
import { EMPTY_SOURCE_CONTEXT, loadPageSourceAcrossDocuments, loadPageSourceContext, loadSourceContext, pagesMarkedInSource, widenSourcePages } from "@/lib/learning/source-context";
import { enrichLessonSource, resolveLessonSource, type SourceTrace, type SourceUnavailableReason } from "@/lib/learning/lesson-source-resolver";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { prepSourceDocumentIds, resolvePrepSourceMode, shouldSearchSources } from "@/lib/learning/prep-source";
import { loadPodcastCorpus, mergePodcastSource } from "@/lib/learning/podcast-episode";
import { loadPrepDocumentIds, loadTopicTeaching } from "@/lib/documents/teacher-analysis-run";
import type { TeachingPriority } from "@/lib/learning/teacher-brain";
import { TEACHER_PAGE_KINDS } from "@/lib/learning/node/shared";
import { loadOralAllSource } from "@/lib/learning/node/oral";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function resolveStartSource(context: NodeContext, state: Pick<StartLocals, "sessionMeta" | "topic" | "topicDocumentId" | "topicNodeId" | "topicSourceRefs" | "topicLabel" | "topicWiden" | "voiceSession">) {
  const { userId, service, parsed, prepId, teachingV2, prep, kind, oralCount, oralTopicIds, oralMultiTopic } = context;
  const { sessionMeta, topic, topicDocumentId, topicNodeId, topicSourceRefs, topicLabel, topicWiden, voiceSession } = state;
  // Ders öğrencinin kendi kaynağından üretilsin. Hazırlığa bağlı bir belge
  // varsa yalnızca onun içinde, yoksa kullanıcının tüm belgelerinde aranıyor.
  //
  // document_id ayrı okunuyor: kolon migration ile geliyor ve ana select'e
  // eklenseydi, kod migration'dan önce dağıtıldığında her düğüm 404 verirdi.
  const { data: prepSource, error: sourceLookupError } = await service
    .from("exam_preps")
    .select("document_id, source_document_ids")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceLookupError || !prepSource) {
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason: "no_prep_documents",
      reasons: ["prep_lookup_failed"],
    });
    return errorResponse(503, "source_unavailable", {
      reason: "no_prep_documents",
      refunded: false,
    });
  }

  const prepDocs = teachingV2 ? await loadPrepDocumentIds(service, prepId) : [];
  if (topicDocumentId) prepSource.document_id = topicDocumentId;
  const teachingPlan = teachingV2
    ? await loadTopicTeaching(
        service,
        prepSource.document_id
          ? [prepSource.document_id as string, ...prepDocs]
          : prepDocs,
        topicLabel,
        sessionMeta?.sourcePages ?? [],
      )
    : {
        brief: "",
        priority: null as TeachingPriority | null,
        checklist: [],
        depth: { difficulty: "hard" as const, maxDraftAttempts: 2 as const, quizItems: 5, line: "" },
        examPoints: [] as string[],
      };

  let sourceBoundaryMode: "documents_only" | "allow_supporting" | null = null;
  if (teachingV2 && prepSource.document_id) {
    const { data: doc } = await service
      .from("documents")
      .select("source_boundary_mode")
      .eq("id", prepSource.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    sourceBoundaryMode =
      (doc?.source_boundary_mode as "documents_only" | "allow_supporting" | null) ??
      "documents_only";
  }
  // Belge seçili değilse kaynak araması yapılmaz. Eskiden `sourceBoundaryMode
  // ?? "documents_only"` ile filtresiz arama yapılıyordu: öğrencinin ilgisiz
  // belgesinden gelen bir parça derse "yalnızca buna dayan" diye giriyordu.
  const sourceMode = resolvePrepSourceMode({
    documentId: prepSource.document_id,
    documentBoundary: sourceBoundaryMode,
  });

  let source;
  let sourceTrace: SourceTrace | null = null;
  // Öğretmen motoru: dersin belgesi ve konunun kendi sayfaları.
  let lessonCoreDocumentId: string | null = null;
  let lessonCorePages: number[] = [];
  // Belgesiz hazırlık dersi: öğretmen motoru doğruluk kuralıyla yazar.
  let lessonTopicOnly = false;
  // Sözlü "Tüm sınav": soru i → konu (K1..KN boyunca eşit aralık).
  let oralAllPlan: string[] = [];
  try {
    const mappedPages = topicWiden ? undefined : sessionMeta?.sourcePages;
    const pageDocumentIds = [
      topicDocumentId,
      prepSource.document_id as string | null,
      ...prepDocs,
    ];
    const sourceQuery = `${prep.title ?? ""} ${topicLabel} ${sessionMeta?.objective ?? ""}`.trim();

    /*
      Belgesiz hazırlık ("Belgem yok, konudan çalışayım"). Çözücü belge
      listesi boşken her zaman "no_prep_documents" dönüyor; ders bu yüzden
      HİÇ üretilmiyordu (29 Eylül 2026, canlıda "Bu hazırlığa bağlı okunabilir
      belge bulunamadı"). Oysa aşağıdaki üretim çağrısı bu hâli bekliyor:
      kaynak şartı kapalı, yerine konu çiti (topicFence) veriliyor — tanışma
      testi ve eski ders ucu da aynı yoldan çalışıyor. Belgesiz derste
      kaynak aranmaz (prep-source.ts), boş bağlamla konu çitine geçilir.
    */
    const hasPrepDocuments =
      Boolean(topicDocumentId) ||
      prepDocs.length > 0 ||
      prepSourceDocumentIds({
        documentId: prepSource.document_id as string | null,
        sourceDocumentIds: prepSource.source_document_ids as string[] | null,
      }).length > 0;
    const topicOnlyLesson =
      kind === "lesson" && teachingV2 && !voiceSession && sourceMode === "topic_only" && !hasPrepDocuments;

    if (topicOnlyLesson) {
      lessonTopicOnly = true;
      source = EMPTY_SOURCE_CONTEXT;
    } else if (kind === "lesson" && teachingV2 && !voiceSession) {
      lessonCoreDocumentId = topicDocumentId ?? (prepSource.document_id as string | null) ?? prepDocs[0] ?? null;
      // Ders: birleşik çözücü. Sonraki adım önceki kaynağı silemez.
      const resolved = await resolveLessonSource(service, {
        userId,
        prepId,
        topicId: topic?.id ?? null,
        topicLabel,
        sessionMeta,
        prepDocs,
        primaryDocumentId: (prepSource.document_id as string | null) ?? null,
        topicDocumentId,
        topicNodeId,
        sourceRefs: topicSourceRefs,
        sourceDocumentIds: prepSource.source_document_ids,
        sourceBoundaryMode,
        query: sourceQuery,
      });
      sourceTrace = resolved.trace;
      // Öğretmen motoru dersi yalnız konunun kendi sayfalarından yazar;
      // aşağıdaki zenginleştirmenin belgenin başka yerlerinden eklediği
      // parçalar (KPSS dersi s.5'ten s.28'e dağılmıştı) motora gitmez.
      lessonCorePages =
        !topicWiden && sessionMeta?.sourcePages?.length
          ? sessionMeta.sourcePages
          : pagesMarkedInSource(resolved.context?.block ?? "");
      if (resolved.unavailable) {
        console.error("node_source_unavailable", {
          kind,
          requestId: parsed.data.clientRequestId ?? null,
          topic: topicLabel,
          reason: resolved.unavailable,
          trace: resolved.trace,
        });
        await recordLessonGenerationFailure(service, {
          userId,
          prepId,
          topicId: topic?.id ?? null,
          topicLabel,
          kind,
          stage: "source",
          reason: resolved.unavailable,
          reasons: resolved.trace.steps
            .filter((step) => !step.ok)
            .map((step) => `${step.step}:${step.detail ?? "fail"}`)
            .slice(0, 8),
          sourceTrace: resolved.trace,
        });
        return errorResponse(503, "source_unavailable", {
          reason: resolved.unavailable,
          refunded: false,
        });
      }
      // Zenginleştirme ölümcül değil — related parçalar eklenir (#118, sayfa yolu dahil).
      source = shouldSearchSources(sourceMode)
        ? await enrichLessonSource(
            service,
            userId,
            resolved.context,
            sourceQuery,
            prepDocs,
          )
        : resolved.context;
    } else if (
      kind === "oral" &&
      (parsed.data.oralScope === "all" || oralMultiTopic) &&
      !voiceSession &&
      hasPrepDocuments
    ) {
      // Birden çok konu seçildiyse (30 Ekim 2026) "Tüm sınav"ın dengeli kaynağı yalnız o konulardan.
      const balanced = await loadOralAllSource(service, {
        userId,
        prepId,
        count: oralCount ?? 5,
        fallbackDocumentIds: pageDocumentIds,
        sourceBoundaryMode,
        onlyTopicIds: oralMultiTopic ? oralTopicIds : null,
      });
      oralAllPlan = balanced.plan;
      source = balanced.source.block.trim()
        ? balanced.source
        : await loadSourceContext(service, userId, sourceQuery, {
            documentId: prepSource?.document_id ?? null,
            sourceBoundaryMode: teachingV2 ? sourceBoundaryMode : null,
            limit: 12,
          });
    } else {
      let pageSource =
        teachingV2 && !voiceSession
          ? await loadPageSourceAcrossDocuments(
              service,
              userId,
              pageDocumentIds,
              mappedPages,
              { sourceBoundaryMode, topicLabel, mode: "strict" },
            )
          : EMPTY_SOURCE_CONTEXT;
      if (
        teachingV2 &&
        !voiceSession &&
        prepSource.document_id &&
        mappedPages?.length &&
        pageSource.block.trim()
      ) {
        const widened = await widenSourcePages(
          service,
          prepSource.document_id as string,
          topicLabel,
          mappedPages,
          pageSource.block,
        );
        if (widened.some((page) => !mappedPages.includes(page))) {
          pageSource = await loadPageSourceContext(
            service,
            userId,
            prepSource.document_id,
            widened,
            { sourceBoundaryMode, topicLabel },
          );
        }
      }
      source = pageSource.block
        ? pageSource
        : voiceSession || !shouldSearchSources(sourceMode)
          ? EMPTY_SOURCE_CONTEXT
          : await loadSourceContext(
              service,
              userId,
              sourceQuery,
              {
                documentId: prepSource?.document_id ?? null,
                sourceBoundaryMode: teachingV2 ? sourceMode : null,
              },
            );
    }
  } catch {
    const reason: SourceUnavailableReason = "search_error";
    console.error("node_source_unavailable", {
      kind,
      requestId: parsed.data.clientRequestId ?? null,
      topic: topicLabel,
      reason,
      trace: sourceTrace,
    });
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason,
      reasons: ["exception"],
      sourceTrace: sourceTrace ?? undefined,
    });
    return errorResponse(503, "source_unavailable", {
      reason,
      refunded: false,
    });
  }

  // Öğretmen test motoru: konu testi de konunun kendi sayfalarından yazılır;
  // belgesiz hazırlıkta konunun yerleşik bilgisinden.
  if (TEACHER_PAGE_KINDS.has(kind) && teachingV2 && !voiceSession && !lessonCoreDocumentId) {
    const documentId = topicDocumentId ?? (prepSource.document_id as string | null) ?? prepDocs[0] ?? null;
    if (documentId) {
      lessonCoreDocumentId = documentId;
      if (!topicWiden && sessionMeta?.sourcePages?.length) {
        lessonCorePages = sessionMeta.sourcePages;
      } else {
        // Sayfa listesi yoksa dersin çözücüsü: test ve podcast dersle aynı
        // sayfalardan yazılsın (KPSS test düğümlerinde sourcePages boştu).
        const resolved = await resolveLessonSource(service, {
          userId,
          prepId,
          topicId: topic?.id ?? null,
          topicLabel,
          sessionMeta,
          prepDocs,
          primaryDocumentId: (prepSource.document_id as string | null) ?? null,
          topicDocumentId,
          topicNodeId,
          sourceRefs: topicSourceRefs,
          sourceDocumentIds: prepSource.source_document_ids,
          sourceBoundaryMode,
          query: `${prep.title ?? ""} ${topicLabel} ${sessionMeta?.objective ?? ""}`.trim(),
        }).catch(() => null);
        const lessonPages = pagesMarkedInSource(resolved?.context?.block ?? "");
        lessonCorePages = lessonPages.length ? lessonPages : pagesMarkedInSource(source.block);
      }
    } else if (sourceMode === "topic_only") {
      lessonTopicOnly = true;
    }
  }

  // Podcast, sayfa kaynağı duruyorsa hazırlıktaki diğer belgelere de bakar.
  // Sayfa listesi okunamadıysa buraya gelinmez; o durumda arama yedeği yok.
  let podcastSyllabus = "";
  if (kind === "podcast" && teachingV2 && !voiceSession && source.block.trim()) {
    const corpus = await loadPodcastCorpus(service, userId, prepId, topicLabel);
    podcastSyllabus = corpus.syllabus;
    source = { ...source, block: mergePodcastSource(source.block, corpus.excerpts) };
  }

  // v2 + bound document: empty source must fail closed (no silent general-knowledge fill).
  if (
    teachingV2 &&
    !voiceSession &&
    prepSource.document_id &&
    !source.block.trim()
  ) {
    const reason: SourceUnavailableReason = "search_no_match";
    console.error("node_source_unavailable", {
      kind,
      requestId: parsed.data.clientRequestId ?? null,
      topic: topicLabel,
      reason,
      trace: sourceTrace,
    });
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason,
      reasons: ["empty_block"],
      sourceTrace: sourceTrace ?? undefined,
    });
    return errorResponse(503, "source_unavailable", {
      reason,
      refunded: false,
    });
  }
  return { prepSource, prepDocs, teachingPlan, sourceBoundaryMode, sourceMode, source, sourceTrace, lessonCoreDocumentId, lessonCorePages, lessonTopicOnly, oralAllPlan, podcastSyllabus };
}

/** Kaynak aşamasının erken yanıt dışındaki dönüşü. */
export type StartSource = Exclude<Awaited<ReturnType<typeof resolveStartSource>>, Response>;
