import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { getActionCost } from "@/lib/credits/service";
import { planTier } from "@/lib/billing/entitlements";
import { isAdminUser } from "@/lib/auth/roles";
import {
  coverageStatusLine,
  mergeCoverage,
  prepDocumentIds,
  priorityForTopic,
  type PrepDocumentRow,
} from "@/lib/learning/exam-coverage";
import {
  analysisCreditOk,
  chunkPagesForAnalysis,
  detectMaterialLanguage,
  lessonDepth,
  mergeTeacherAnalyses,
  parseTeacherAnalysis,
  sanitizeAnalysisAgainstSource,
  selectAnalysisPages,
  teacherAnalysisPrompt,
  teacherBriefForTopic,
  teacherBriefForTopicMap,
  type AnalysisPage,
  type CoverageItem,
  type TeacherAnalysis,
  type TeachingPriority,
} from "@/lib/learning/teacher-brain";

export type TeacherAnalysisRun = {
  ok: boolean;
  status: "ready" | "failed" | "skipped";
  analysis: TeacherAnalysis | null;
  topicMapBrief: string | null;
};

const EMPTY: TeacherAnalysisRun = {
  ok: false,
  status: "skipped",
  analysis: null,
  topicMapBrief: null,
};

function reportAnalysis(
  documentId: string,
  status: string,
  error?: string | null,
) {
  console.info(
    JSON.stringify({
      event: "teacher_analysis",
      documentId,
      status,
      error: error ?? null,
    }),
  );
}

async function save(
  service: SupabaseClient,
  documentId: string,
  row: {
    status: TeacherAnalysisRun["status"];
    analysis?: TeacherAnalysis | null;
    error?: string | null;
    chunkCount?: number;
  },
): Promise<boolean> {
  const { error } = await service.from("document_teacher_analyses").upsert(
    {
      document_id: documentId,
      status: row.status,
      analysis: row.analysis ?? null,
      error: row.error ?? null,
      chunk_count: row.chunkCount ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "document_id" },
  );
  if (error) {
    reportAnalysis(documentId, "failed", "persist_failed");
    return false;
  }
  return true;
}

const ANALYSIS_CACHE_MS = 5 * 60 * 1000;
const analysisCache = new Map<string, { at: number; analysis: TeacherAnalysis | null }>();

function rememberAnalysis(documentId: string, analysis: TeacherAnalysis | null) {
  analysisCache.set(documentId, { at: Date.now(), analysis });
}

/**
 * Belge başına bir öğretmen analizi.
 *
 * Model susarsa, kredi yetmezse ya da kayıt yazılamazsa yükleme akışı
 * olduğu gibi sürer. Hazır kayıt varsa yeniden üretilmez.
 */
export async function runTeacherAnalysis(
  service: SupabaseClient,
  documentId: string,
  input: { userId: string; fileName: string; mimeType?: string | null },
): Promise<TeacherAnalysisRun> {
  try {
    const existingResult = await service
      .from("document_teacher_analyses")
      .select("status, analysis")
      .eq("document_id", documentId)
      .maybeSingle();
    if (existingResult.error) {
      reportAnalysis(documentId, "failed", "store_unavailable");
      return { ...EMPTY, status: "failed" };
    }
    const existing = existingResult.data;
    if (existing?.status === "ready") {
      const stored = parseTeacherAnalysis(existing.analysis);
      if (stored) {
        rememberAnalysis(documentId, stored);
        reportAnalysis(documentId, "ready", "reused");
        return {
          ok: true,
          status: "ready",
          analysis: stored,
          topicMapBrief: teacherBriefForTopicMap(stored),
        };
      }
    }

    const { data: pageRows, error: pageError } = await service
      .from("document_pages")
      .select("page_number, text_content")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true });
    if (pageError) {
      await save(service, documentId, { status: "failed", error: "page_load_failed" });
      reportAnalysis(documentId, "failed", "page_load_failed");
      return { ...EMPTY, status: "failed" };
    }

    let tier: "free" | "plus" | "sigma" = "plus";
    try {
      tier = await planTier(service, input.userId);
    } catch {
      tier = "plus";
    }
    const pages = selectAnalysisPages(
      (pageRows ?? []).map((row) => ({
        pageNumber: row.page_number as number,
        text: (row.text_content as string | null) ?? "",
      })),
      { mimeType: input.mimeType, tier },
    );
    const chunks = chunkPagesForAnalysis(pages);
    if (!chunks.length) {
      await save(service, documentId, { status: "skipped", error: "too_short" });
      reportAnalysis(documentId, "skipped", "too_short");
      return EMPTY;
    }

    const cost = await getActionCost(service, "STUDY_PLAN_GENERATE");
    const { data: wallet } = await service
      .from("credit_wallets")
      .select("balance, reserved")
      .eq("user_id", input.userId)
      .maybeSingle();
    const available = Math.max(
      0,
      Number(wallet?.balance ?? 0) - Number(wallet?.reserved ?? 0),
    );
    // Yöneticinin bakiyesi hiç düşmediği için ön kontrol ona bakmıyor; aksi
    // hâlde boş cüzdanlı kurucu hesabında analiz sessizce atlanırdı.
    const exempt = await isAdminUser(service, input.userId);
    if (!exempt && !analysisCreditOk(available, cost ?? 0, chunks.length)) {
      await save(service, documentId, { status: "skipped", error: "credit_budget" });
      reportAnalysis(documentId, "skipped", "credit_budget");
      return EMPTY;
    }

    const source = pages.map((page) => page.text).join("\n");
    const language = detectMaterialLanguage(source);
    const nonce = existing?.status === "failed" ? Date.now().toString(36) : "v1";
    const isPremium = await isPremiumUser(service, input.userId);
    const parts: TeacherAnalysis[] = [];

    for (const [index, chunk] of chunks.entries()) {
      const prompt = teacherAnalysisPrompt({
        fileName: input.fileName,
        pages: chunk,
        language,
        part: index + 1,
        parts: chunks.length,
      });
      try {
        const outcome = await generateJson({
          service,
          userId: input.userId,
          actionCode: "STUDY_PLAN_GENERATE",
          isPremium,
          verificationMode: "schema",
          maxDraftAttempts: 1,
          idempotencyKey: `teacher-brain:${documentId}:${nonce}:${index}`,
          schemaHint: prompt.schemaHint,
          userPrompt: prompt.userPrompt,
          parse: (raw) => parseTeacherAnalysis(raw, language),
        });
        if (outcome.ok && outcome.data) parts.push(outcome.data);
      } catch (error) {
        console.error("teacher analysis chunk failed", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    const merged = mergeTeacherAnalyses(parts);
    if (!merged) {
      await save(service, documentId, {
        status: "failed",
        error: "analysis_unavailable",
        chunkCount: chunks.length,
      });
      reportAnalysis(documentId, "failed", "analysis_unavailable");
      return { ...EMPTY, status: "failed" };
    }
    const checked = sanitizeAnalysisAgainstSource(merged, source);
    const wrote = await save(service, documentId, {
      status: "ready",
      analysis: checked.analysis,
      error: null,
      chunkCount: chunks.length,
    });
    if (!wrote) {
      return {
        ok: false,
        status: "failed",
        analysis: checked.analysis,
        topicMapBrief: teacherBriefForTopicMap(checked.analysis),
      };
    }
    rememberAnalysis(documentId, checked.analysis);
    reportAnalysis(documentId, "ready", null);
    return {
      ok: true,
      status: "ready",
      analysis: checked.analysis,
      topicMapBrief: teacherBriefForTopicMap(checked.analysis),
    };
  } catch {
    reportAnalysis(documentId, "failed", "crashed");
    return { ...EMPTY, status: "failed" };
  }
}

export async function loadTeacherAnalysis(
  service: SupabaseClient,
  documentId: string | null | undefined,
): Promise<TeacherAnalysis | null> {
  if (!documentId) return null;
  const cached = analysisCache.get(documentId);
  if (cached?.analysis && Date.now() - cached.at < ANALYSIS_CACHE_MS) return cached.analysis;
  try {
    const { data, error } = await service
      .from("document_teacher_analyses")
      .select("status, analysis")
      .eq("document_id", documentId)
      .maybeSingle();
    if (error || data?.status !== "ready") return null;
    const parsed = parseTeacherAnalysis(data.analysis);
    if (parsed) rememberAnalysis(documentId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function loadPrepDocumentIds(
  service: SupabaseClient,
  prepId: string,
): Promise<string[]> {
  const { data } = await service
    .from("exam_preps")
    .select("document_id")
    .eq("id", prepId)
    .maybeSingle();
  const ids = prepDocumentIds(data as PrepDocumentRow | null);
  const extra = await service
    .from("exam_preps")
    .select("source_document_ids")
    .eq("id", prepId)
    .maybeSingle();
  if (!extra.error) {
    ids.push(
      ...prepDocumentIds({
        source_document_ids: (extra.data?.source_document_ids as string[] | null) ?? null,
      }),
    );
  }
  const { data: topicRows, error: topicError } = await service
    .from("exam_prep_topics")
    .select("document_topic_node_id")
    .eq("exam_prep_id", prepId);
  const nodeIds = topicError
    ? []
    : (topicRows ?? [])
        .map((row) => row.document_topic_node_id as string | null)
        .filter((id): id is string => Boolean(id));
  if (nodeIds.length) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("document_id")
      .in("id", nodeIds);
    for (const node of nodes ?? []) {
      if (node.document_id) ids.push(node.document_id as string);
    }
  }
  return [...new Set(ids)];
}

export type TopicTeaching = {
  brief: string;
  priority: TeachingPriority | null;
  checklist: CoverageItem[];
  depth: ReturnType<typeof lessonDepth>;
};

/**
 * Saklı analizlerden konu notu. Hazır satır yoksa boş döner; modeli yeniden
 * çağırmaz, başarısız kaydı da döngüye sokmaz.
 */
export async function loadTopicTeaching(
  service: SupabaseClient,
  documentIds: string[],
  topicTitle: string,
): Promise<TopicTeaching> {
  const groups: { documentId: string; analysis: TeacherAnalysis }[] = [];
  for (const documentId of documentIds) {
    const analysis = await loadTeacherAnalysis(service, documentId);
    if (analysis) groups.push({ documentId, analysis });
  }
  const priority = priorityForTopic(groups, topicTitle);
  const owner = groups.find((group) => priorityForTopic([group], topicTitle));
  const brief = owner ? teacherBriefForTopic(owner.analysis, topicTitle) : "";
  return {
    brief,
    priority,
    checklist: mergeCoverage(groups),
    depth: lessonDepth(priority),
  };
}

export function taughtCoverageLine(
  checklist: CoverageItem[],
  taughtTopicTitles: string[],
): string {
  return coverageStatusLine(checklist, taughtTopicTitles);
}

export async function loadTeacherBrief(
  service: SupabaseClient,
  documentId: string | null | undefined,
  topicTitle: string,
): Promise<string> {
  const analysis = await loadTeacherAnalysis(service, documentId);
  if (!analysis) return "";
  return teacherBriefForTopic(analysis, topicTitle);
}

export type { AnalysisPage };
