import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import {
  detectPageFurniture,
  extractTocUnits,
} from "@/lib/documents/outline-clean";
import {
  buildStudyOutlineFromNodes,
  seriesLabelFromFileName,
} from "@/lib/learning/study-outline";
import { buildExamPlan, daysUntilExam } from "@/lib/learning/exam-prep-plan";
import {
  refoldTopicMapIfNeeded,
  regenerateUnusedFlatTopicMap,
} from "@/lib/documents/pdf-learning-v2";
import { documentTitle } from "@/lib/documents/topic-title";
import { orderedSourceDocumentIds } from "@/lib/learning/prep-source";
import { PREP_TOPIC_CAP, prepTopicCapacityError } from "@/lib/learning/prep-topic-list";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";
import {
  contradictionsByTopicTitleResolved,
  readContradictionDocuments,
} from "@/lib/learning/prep-contradiction-read";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { remapPrerequisites, mergeTopicGroups, type MergeTopicInput, type MergedTopic } from "@/lib/learning/topic-merge";
import type { ConsolidatedTopic } from "@/lib/learning/cross-material-topics";
import { resolveAmbiguousMerges } from "@/lib/learning/topic-merge-model";
import { consolidatePrepDocuments } from "@/lib/learning/consolidate-documents";
import { formatContradictions } from "@/lib/learning/source-contradictions";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(24)
    .optional(),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Exam type/level for oneshot teacher perspective (optional on probe). */
  examType: z.string().min(2).max(40).optional(),
  documentId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).max(8).optional(),
  /** Flag+topic-map check only — no AI / no credits. */
  probeOnly: z.boolean().optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hardTopics: z.array(z.string().min(1).max(120)).max(24).optional(),
  learningPreferences: z
    .object({
      style: z.enum(["examples", "theory", "mixed"]).optional(),
      pace: z.enum(["slow", "normal", "fast"]).optional(),
      notes: z.string().max(400).optional(),
      modality: z
        .enum(["reading", "listening", "watching", "practice", "auto"])
        .optional(),
      language: z.enum(["tr", "en"]).optional(),
    })
    .optional(),
});

const draftSchema = z.object({
  reply: z.string().min(8).max(600),
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40),
  topics: z.array(z.string().min(1).max(80)).max(16),
  needDate: z.boolean(),
  ready: z.boolean(),
});

export type IntakeStudyUnit = { title: string; topicIndexes: number[] };

async function resolveTopicSuggestions(
  service: SupabaseClient,
  userId: string,
  documentId: string | undefined,
  v2: boolean,
) {
  let topicSuggestions: MergeTopicInput[] = [];
  let units: IntakeStudyUnit[] = [];
  let intakeMode: "legacy" | "v2" = "legacy";
  if (!v2 || !documentId) return { topicSuggestions, intakeMode, units };

  const { data: doc } = await service
    .from("documents")
    .select("id, topic_map_status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (doc?.topic_map_status === "ready" || doc?.topic_map_status === "reviewed") {
    const nodeRows = await loadPagedDocumentRows(
      service,
      "document_topic_nodes",
      "id, title, parent_id, sort_order, prerequisites, document_id",
      [doc.id],
      ["sort_order", "id"],
    );
    const pagesByTopic = new Map<string, number[]>();
    const prereqById = new Map(
      nodeRows.map((node) => [
        node.id as string,
        Array.isArray(node.prerequisites) ? (node.prerequisites as string[]) : [],
      ]),
    );
    // Konunun hangi sayfalara dayandığı. Referans ürünün konu kartında "1 kaynak"
    // yazıyor; bizde belge zaten tek, o yüzden sayı değil SAYFA
    // gösteriliyor — aynı soruya ("bu konu neye dayanıyor?") gerçekten
    // değişen bir cevap.
    const links = await loadPagedDocumentRows(
      service,
      "document_topic_page_links",
      "topic_id, page_number, document_id",
      [doc.id],
      ["topic_id", "page_number"],
    );
    for (const link of links) {
      const list = pagesByTopic.get(link.topic_id as string) ?? [];
      list.push(link.page_number as number);
      pagesByTopic.set(link.topic_id as string, list);
    }
    const { data: docName } = await service
      .from("documents")
      .select("file_name")
      .eq("id", doc.id)
      .maybeSingle();
    const fileName = (docName?.file_name as string | null) ?? "";
    const pageRows = await loadPagedDocumentRows(
      service,
      "document_pages",
      "page_number, text_content, page_kind, headings",
      [doc.id],
      ["page_number"],
    );
    const lightPages = pageRows.map((page) => ({
      pageNumber: page.page_number as number,
      text: ((page.text_content as string | null) ?? "").slice(0, 4000),
      pageKind: (page.page_kind as string | null) ?? null,
      headings: Array.isArray(page.headings) ? (page.headings as string[]) : undefined,
    }));
    const furniture = detectPageFurniture(lightPages);
    const tocUnits = extractTocUnits(lightPages);
    const seriesLabels = [
      ...new Set([...furniture.seriesLabels, ...seriesLabelFromFileName(fileName)]),
    ];
    const contentPageCount = pageRows.filter(
      (p) =>
        !p.page_kind || p.page_kind === "content" || p.page_kind === "uncertain",
    ).length;
    const outline = buildStudyOutlineFromNodes({
      nodes: nodeRows.map((n) => ({
        id: n.id as string,
        title: n.title as string,
        parentId: (n.parent_id as string | null) ?? null,
        sortOrder: typeof n.sort_order === "number" ? n.sort_order : 0,
      })),
      pagesByTopic,
      seriesLabels,
      unitRuns: furniture.unitRuns,
      tocUnits,
      contentPageCount: contentPageCount || pageRows.length,
    });
    units = outline.units;
    topicSuggestions = outline.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      pages: topic.pages,
      documentId,
      fileName,
      prerequisites: prereqById.get(topic.id) ?? [],
    }));
    if (topicSuggestions.length) intakeMode = "v2";
  }
  return { topicSuggestions, intakeMode, units };
}

/**
 * Belgenin adı — kapak başlığı, konu başlıklarının ortak kısmı ya da
 * dosya adı. Model çağrısı yok; bu uç kredi harcamıyor.
 */
async function probeDocumentTitle(
  service: SupabaseClient,
  userId: string,
  documentId: string | undefined,
  topicTitles: string[],
): Promise<string> {
  if (!documentId) return "";
  const [{ data: doc }, { data: pages }] = await Promise.all([
    service
      .from("documents")
      .select("file_name")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("document_pages")
      .select("page_number, page_kind, headings")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .limit(2),
  ]);
  // Yalnızca kapak. İlk iki sayfaya bakınca zemin belgesinin hazırlığı
  // "Öğrenme Hedefleri" adını aldı: kapak harf aralıklı olduğu için
  // elendi ve 2. sayfadaki içindekiler başlığı geçti. İçindekiler
  // sayfasının başlığı belgenin adı değildir.
  const cover = (pages ?? []).filter((page) => page.page_kind === "cover");
  return documentTitle({
    coverHeadings: cover.flatMap(
      (page) => (page.headings as string[] | null) ?? [],
    ),
    topicTitles,
    fileName: (doc?.file_name as string | null) ?? null,
  });
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-intake", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const documentIds = orderedSourceDocumentIds({
    documentId: parsed.data.documentId,
    documentIds: parsed.data.documentIds,
  });
  if (documentIds.length) {
    const { data: ownedDocuments, error: ownershipError } = await service
      .from("documents")
      .select("id, status, topic_map_status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("id", documentIds);
    if (ownershipError || ownedDocuments?.length !== documentIds.length) {
      return NextResponse.json({ error: "Bu belgeler bulunamadı." }, { status: 404 });
    }
    if (ownedDocuments.some((document) => document.status !== "completed")) {
      return NextResponse.json(
        { error: "Belgen hâlâ hazırlanıyor. İşlem bitince çalışma yolunu oluşturabilirsin." },
        { status: 409 },
      );
    }
    if (v2 && ownedDocuments.some((document) =>
      document.topic_map_status !== "ready" && document.topic_map_status !== "reviewed"
    )) {
      return NextResponse.json(
        { error: "Belgenin konuları hâlâ hazırlanıyor. İşlem bitince tekrar dene." },
        { status: 409 },
      );
    }
  }
  // Unused flat junk maps → oneshot regen. Used maps are never rewritten.
  // Katlamak model çağırmaz; hiyerarşik hazır haritalar yalnızca katlanır.
  if (v2) {
    for (const documentId of documentIds) {
      try {
        const regen = await regenerateUnusedFlatTopicMap(service, documentId, {
          examLabel: parsed.data.examType ?? null,
          examDate: parsed.data.examDate ?? null,
        });
        if (regen.regenerating) {
          return NextResponse.json(
            {
              error: "Belgenin konuları yeniden düzenleniyor. İşlem bitince tekrar dene.",
              code: "topic_map_regenerating",
            },
            { status: 409 },
          );
        }
        await refoldTopicMapIfNeeded(service, documentId);
      } catch (error) {
        console.error("intake_map_refresh_skipped", {
          documentId,
          errorType: error instanceof Error ? (error.constructor?.name ?? error.name) : "unknown",
        });
      }
    }
  }
  const groups: MergeTopicInput[][] = [];
  let intakeMode: "legacy" | "v2" = "legacy";
  let intakeUnits: IntakeStudyUnit[] = [];
  // Multi-file only: consolidate merges. Single-file reads the oneshot map
  // directly so the old merge-first path cannot short-circuit units/regen.
  let consolidated: Awaited<ReturnType<typeof consolidatePrepDocuments>> | null = null;
  let mergedTopics: Array<ConsolidatedTopic | MergedTopic> = [];
  if (documentIds.length > 1) {
    consolidated = await consolidatePrepDocuments(service, userId, documentIds, {
      allowModel: true,
    });
    mergedTopics = consolidated?.topics ?? [];
    if (consolidated?.units?.length) intakeUnits = consolidated.units;
    if (mergedTopics.length) intakeMode = "v2";
  } else if (documentIds.length === 1) {
    // Single doc: still use consolidate for perspective unpack (examHeavy /
    // whyLearn) — it reads the hierarchical oneshot nodes, not a flat junk pass
    // (unused flats were regenerated above).
    consolidated = await consolidatePrepDocuments(service, userId, documentIds, {
      allowModel: false,
    });
    mergedTopics = consolidated?.topics ?? [];
    if (consolidated?.units?.length) intakeUnits = consolidated.units;
    if (mergedTopics.length) intakeMode = "v2";
  }
  if (!mergedTopics.length) {
    for (const documentId of documentIds.length ? documentIds : [parsed.data.documentId]) {
      const resolved = await resolveTopicSuggestions(service, userId, documentId, v2);
      if (resolved.intakeMode === "v2") intakeMode = "v2";
      if (!intakeUnits.length && resolved.units.length) intakeUnits = resolved.units;
      groups.push(resolved.topicSuggestions);
    }
    const firstPass = mergeTopicGroups(groups);
    mergedTopics = remapPrerequisites(firstPass.topics);
    if (firstPass.ambiguous.length) {
      try {
        mergedTopics = remapPrerequisites(
          await resolveAmbiguousMerges(service, userId, mergedTopics, firstPass.ambiguous),
        );
      } catch {
        // Model yoksa iki başlık ayrı kalır. Konu düşmez.
      }
    }
  }
  // Learning order: prerequisites first (even when consolidate supplied topics).
  mergedTopics = orderTopicsForPath(mergedTopics, { manualOrder: false });
  const capacityError = prepTopicCapacityError(mergedTopics.length);
  if (capacityError) {
    return NextResponse.json(
      { error: capacityError, topicCount: mergedTopics.length, topicCap: PREP_TOPIC_CAP },
      { status: 422 },
    );
  }
  const merged = {
    topics: mergedTopics.map((topic) => topic.title),
    topicPages: mergedTopics.map((topic) => topic.pages),
    topicFiles: mergedTopics.map((topic) =>
      [...new Set(topic.sources.map((source) => source.fileName).filter(Boolean))],
    ),
    topicSourceCounts: mergedTopics.map((topic) =>
      "sourceCount" in topic ? topic.sourceCount : topic.sources.length,
    ),
    topicHeavy: mergedTopics.map((topic) => ("examHeavy" in topic ? topic.examHeavy : false)),
    topicImportant: mergedTopics.map((topic) =>
      "importance" in topic ? topic.importance === "important" && !topic.examHeavy : false,
    ),
    topicWeights: mergedTopics.map((topic) =>
      "weightPercent" in topic ? topic.weightPercent : null,
    ),
    topicSections: mergedTopics.map((topic) =>
      "sections" in topic ? topic.sections.map((section) => section.title) : [],
    ),
    topicScopeNotes: mergedTopics.map((topic) =>
      "scopeNote" in topic ? topic.scopeNote : null,
    ),
    topicDescriptions: mergedTopics.map((topic) => {
      if ("summary" in topic && typeof topic.summary === "string" && topic.summary.trim()) {
        return topic.summary.trim().slice(0, 240);
      }
      return null;
    }),
  };
  const contradictionDocs = await readContradictionDocuments(service, documentIds).catch(() => []);
  const contradictionMap = await contradictionsByTopicTitleResolved(
    service,
    userId,
    mergedTopics.map((topic) => ({
      title: topic.title,
      sources: topic.sources.map((source) => ({
        documentId: source.documentId,
        pages: source.pages,
      })),
    })),
    contradictionDocs,
  );
  // Warnings stay contradictions/narrow-scope only — short descriptions are separate.
  const topicWarnings = mergedTopics.map((topic, index) => {
    const scope = merged.topicScopeNotes[index];
    const contradiction = formatContradictions(contradictionMap.get(topic.title) ?? []);
    return [scope, contradiction].filter(Boolean).join(" ");
  });
  const topicSuggestions = groups.flat().filter(
    (topic, index, all) => all.findIndex((item) => item.id === topic.id) === index,
  );

  if (parsed.data.probeOnly) {
    return NextResponse.json({
      ok: true,
      intakeMode,
      topicSuggestions,
      draft: merged.topics.length
        ? {
            // Hazırlığın adı belgeden gelir; boş kalırsa sihirbaz
            // "${ders} sınav hazırlığı" diyordu ve aynı dersten yüklenen
            // her belge aynı adı taşıyordu.
            title: await probeDocumentTitle(
              service,
              userId,
              documentIds[0] ?? parsed.data.documentId,
              merged.topics,
            ),
            examType: "Serbest",
            topics: merged.topics,
            topicPages: merged.topicPages,
            topicFiles: merged.topicFiles,
            topicWarnings,
            topicSourceCounts: merged.topicSourceCounts,
            topicHeavy: merged.topicHeavy,
            topicImportant: merged.topicImportant,
            topicWeights: merged.topicWeights,
            topicSections: merged.topicSections,
            topicDescriptions: merged.topicDescriptions,
            excluded: consolidated?.excluded ?? [],
            missingTopics: consolidated?.missingFromMaterials ?? [],
            suggestedExamDate: consolidated?.suggestedExamDate ?? null,
            units: consolidated?.units ?? (intakeUnits.length ? intakeUnits : undefined),
          }
        : null,
    });
  }

  if (!parsed.data.messages?.length) return errorResponse(400, "invalid_input");

  const transcript = parsed.data.messages
    .map((message) => `${message.role === "user" ? "Öğrenci" : "Eğitmen"}: ${message.content}`)
    .join("\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"reply":string,"title":string,"examType":string,"topics":string[],"needDate":boolean,"ready":boolean}. examType: LGS, TYT, AYT, TUS, Okul veya Serbest. Konular kısa başlık. ready true yalnızca en az 3 konu netse. needDate true konu listesi hazır ama tarih yoksa.',
    userPrompt: `Sınav hazırlığı sohbeti. Öğrencinin yazdıklarından sınavı ve konuları çıkar.
Tarih henüz yoksa konuları netleştirip tarihi iste.
${topicSuggestions.length ? `Belge konu haritası (öncelikli konu listesi): ${topicSuggestions.map((t) => t.title).join(", ")}. Mümkünse topics olarak bunları kullan.` : ""}
${transcript}`,
    parse: (raw) => {
      const result = draftSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const draft = outcome.data;
  if (intakeMode === "v2" && merged.topics.length) {
    draft.topics = merged.topics;
  }

  const examDate = parsed.data.examDate;
  const ready = Boolean(examDate) && draft.topics.length >= 1;
  const days = examDate ? daysUntilExam(examDate) : null;

  return NextResponse.json({
    ok: true,
    reply: examDate
      ? `${days} günlük yolunu hazırladım. Konuları kontrol et, planı başlat.`
      : draft.reply,
    draft: {
      title: draft.title,
      examType: draft.examType,
      topics: draft.topics,
    },
    needDate: !examDate && (draft.needDate || draft.topics.length >= 2),
    ready,
    days,
    preview: days ? buildExamPlan(days) : [],
    intakeMode,
    topicSuggestions,
    profile: {
      dailyMinutes: parsed.data.dailyMinutes ?? null,
      studyDays: parsed.data.studyDays ?? [],
      hardTopics: parsed.data.hardTopics ?? [],
      learningPreferences: parsed.data.learningPreferences ?? {},
    },
  });
}
