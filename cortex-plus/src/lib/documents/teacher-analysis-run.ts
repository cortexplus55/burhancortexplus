import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { getActionCost } from "@/lib/credits/service";
import { planTier } from "@/lib/billing/entitlements";
import {
  analysisCreditOk,
  chunkPagesForAnalysis,
  detectMaterialLanguage,
  mergeTeacherAnalyses,
  parseTeacherAnalysis,
  sanitizeAnalysisAgainstSource,
  selectAnalysisPages,
  teacherAnalysisPrompt,
  teacherBriefForTopic,
  teacherBriefForTopicMap,
  type AnalysisPage,
  type TeacherAnalysis,
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

async function save(
  service: SupabaseClient,
  documentId: string,
  row: {
    status: TeacherAnalysisRun["status"];
    analysis?: TeacherAnalysis | null;
    error?: string | null;
    chunkCount?: number;
  },
) {
  await service.from("document_teacher_analyses").upsert(
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
      console.error("teacher analysis store unavailable", {
        message: existingResult.error.message,
      });
      return { ...EMPTY, status: "failed" };
    }
    const existing = existingResult.data;
    if (existing?.status === "ready") {
      const stored = parseTeacherAnalysis(existing.analysis);
      if (stored) {
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
    if (!analysisCreditOk(available, cost ?? 0, chunks.length)) {
      await save(service, documentId, { status: "skipped", error: "credit_budget" });
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
      return { ...EMPTY, status: "failed" };
    }
    const checked = sanitizeAnalysisAgainstSource(merged, source);
    await save(service, documentId, {
      status: "ready",
      analysis: checked.analysis,
      error: null,
      chunkCount: chunks.length,
    });
    return {
      ok: true,
      status: "ready",
      analysis: checked.analysis,
      topicMapBrief: teacherBriefForTopicMap(checked.analysis),
    };
  } catch (error) {
    console.error("teacher analysis crashed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { ...EMPTY, status: "failed" };
  }
}

export async function loadTeacherAnalysis(
  service: SupabaseClient,
  documentId: string | null | undefined,
): Promise<TeacherAnalysis | null> {
  if (!documentId) return null;
  try {
    const { data } = await service
      .from("document_teacher_analyses")
      .select("status, analysis")
      .eq("document_id", documentId)
      .maybeSingle();
    if (data?.status !== "ready") return null;
    return parseTeacherAnalysis(data.analysis);
  } catch {
    return null;
  }
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
