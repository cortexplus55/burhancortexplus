import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { completeLessonPartRepair } from "@/lib/ai/lesson-part-repair";
import { formatStructuredLesson } from "@/lib/learning/exam-lesson";
import { loadSourceContext, loadTopicSpanContext } from "@/lib/learning/source-context";
import {
  criticalTeachingFailures,
  finishTaughtLesson,
  LESSON_TEACH_RULE,
} from "@/lib/learning/lesson-teach";
import {
  resolvePrepSourceMode,
  shouldSearchSources,
  topicFence,
} from "@/lib/learning/prep-source";
import {
  LESSON_V2_SCHEMA_HINT,
  REVIEW_VARIANT_RULE,
  lessonDraftForVerifier,
  lessonHasTeachingCore,
  lessonPublishIssues,
  publishLessonDraft,
  teachingStandardConstraints,
  teachingSessionContext,
} from "@/lib/learning/teaching-standards";
import {
  contentDifficultyLine,
  parseFamiliarity,
  parseMood,
  sessionSignalsPrompt,
} from "@/lib/learning/session-signals";
import { loadPrepDocumentIds, loadTopicTeaching } from "@/lib/documents/teacher-analysis-run";
import {
  groundingRules,
  SOURCE_PAGE_FORMULA_RULE,
  teacherNoteGroundedInSource,
  teacherPersona,
} from "@/lib/learning/teacher-brain";
import { groundLearnerLesson, groundLessonDraft, upcomingTopicsAfter } from "@/lib/learning/lesson-grounding";

/**
 * Düğüm ucuyla aynı tavan. Kısa tekrar ayrı bir model çağrısı açmaz.
 * 300 saniye, 90 saniyelik üretim, doğrulama ve tek geçici yeniden denemeyi alır.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  force: z.boolean().optional(),
  familiarity: z
    .enum(["new", "heard", "basics", "good", "confident"])
    .optional(),
  mood: z
    .enum(["ready", "curious", "calm", "neutral", "low_energy", "stressed"])
    .optional(),
});

const legacyLessonSchema = z.object({
  title: z.string().min(2).max(120),
  overview: z.string().min(20),
  sections: z
    .array(z.object({ heading: z.string().min(2), body: z.string().min(20) }))
    .min(2)
    .max(5),
  example: z.object({
    prompt: z.string().min(8),
    solution: z.string().min(8),
  }),
  summary: z.array(z.string().min(2)).min(2).max(6),
  nextFocus: z.array(z.string().min(2)).min(1).max(4),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson", limit: 16 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, topicId, force } = parsed.data;
  const hasSignals = parsed.data.familiarity != null || parsed.data.mood != null;
  const familiarity = parseFamiliarity(parsed.data.familiarity);
  const mood = parseMood(parsed.data.mood);
  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, document_id, hard_topics_self")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, lesson_id, status, document_topic_node_id")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();

  if (!topic) return errorResponse(404, "not_found");

  if (topic.lesson_id && !force) {
    return NextResponse.json({ ok: true, lessonId: topic.lesson_id, reused: true });
  }

  const prepDocs = teachingV2 ? await loadPrepDocumentIds(service, prepId) : [];
  let topicDocumentId = (prep.document_id as string | null) ?? prepDocs[0] ?? null;
  if (teachingV2 && topic.document_topic_node_id) {
    const { data: node } = await service
      .from("document_topic_nodes")
      .select("document_id")
      .eq("id", topic.document_topic_node_id)
      .maybeSingle();
    if (node?.document_id) topicDocumentId = node.document_id as string;
  }
  const teaching =
    teachingV2 && (topicDocumentId || prepDocs.length)
      ? await loadTopicTeaching(
          service,
          topicDocumentId ? [topicDocumentId, ...prepDocs] : prepDocs,
          topic.label,
        )
      : null;
  const rawTeacherBrief = teaching?.brief ?? "";
  const depth = teaching?.depth;

  let sourceBlock = "";
  // Belge seçili değilse kaynak araması YAPILMAZ. Eskiden aranıyordu ve
  // arama belge filtresiz olduğu için öğrencinin ilgisiz belgelerinden
  // parça çekip derse "yalnızca buna dayan" diyordu.
  let documentBoundary: "documents_only" | "allow_supporting" | null = null;
  if (teachingV2 && (prep.document_id || topicDocumentId)) {
    const { data: doc } = await service
      .from("documents")
      .select("source_boundary_mode")
      .eq("id", topicDocumentId ?? prep.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    documentBoundary =
      (doc?.source_boundary_mode as "documents_only" | "allow_supporting" | null) ??
      "documents_only";
  }
  const sourceMode = resolvePrepSourceMode({
    documentId: prep.document_id,
    documentBoundary,
  });

  if (teachingV2 && shouldSearchSources(sourceMode)) {
    try {
      const spanIds = [topicDocumentId, prep.document_id as string | null, ...prepDocs];
      const spanned = await loadTopicSpanContext(service, userId, spanIds, topic.label, {
        sourceBoundaryMode: sourceMode,
        preferredNodeId:
          typeof topic.document_topic_node_id === "string" ? topic.document_topic_node_id : null,
      });
      const source = spanned?.block.trim()
        ? spanned
        : await loadSourceContext(
            service,
            userId,
            `${prep.title ?? ""} ${topic.label}`.trim(),
            {
              documentId: topicDocumentId ?? prep.document_id ?? null,
              sourceBoundaryMode: sourceMode,
            },
          );
      sourceBlock = source.block;
      if (!sourceBlock.trim()) return errorResponse(503, "source_unavailable");
    } catch {
      return errorResponse(503, "source_unavailable");
    }
  }

  // Belgesiz derste çit belge değil konunun kendisi.
  const topicBlock =
    sourceMode === "topic_only"
      ? topicFence({
          topic: topic.label,
          examTitle: prep.title,
          examType: prep.exam_type,
        })
      : "";
  const teacherBrief = teacherNoteGroundedInSource(rawTeacherBrief, sourceBlock);

  const hardTopics = Array.isArray(prep.hard_topics_self)
    ? (prep.hard_topics_self as string[])
    : [];
  const signalLine = hasSignals
    ? `${sessionSignalsPrompt(familiarity, mood)} ${contentDifficultyLine({
        requested: "orta",
        familiarity,
        focusTopic: hardTopics.some(
          (label) =>
            label.trim().toLocaleLowerCase("tr") ===
            topic.label.trim().toLocaleLowerCase("tr"),
        ),
      })}`
    : "";
  const sessionCtx = teachingV2
    ? teachingSessionContext({ topicTitle: topic.label, objective: `${topic.label} konusunu öğren` }, topic.label)
    : "";
  const standards = teachingV2 ? teachingStandardConstraints("lesson") : "";
  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("label, sort_order")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const upcomingTopics = upcomingTopicsAfter(
    topic.label,
    (topicRows ?? []).map((row) => String(row.label ?? "")),
  );
  const upcomingPrompt = !Array.isArray(upcomingTopics)
    ? ""
    : upcomingTopics.length
      ? ` SIRADA NE VAR yalnızca şu sonraki konu başlıkları: ${upcomingTopics.join(" | ")}. Başka konu uydurma.`
      : " Bu konudan sonra listede konu yok; nextFocus yazma.";

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    difficulty: teachingV2 ? (depth?.difficulty ?? "hard") : undefined,
    validationProfile: teachingV2 ? "v2" : "legacy",
    maxDraftAttempts: 1,
    verificationMode: teachingV2 ? "schema" : undefined,
    allowIndependentAccept: false,
    activityKind: "lesson",
    reviewDraft: teachingV2
      ? (draft: string) => lessonDraftForVerifier(groundLessonDraft(draft, sourceBlock))
      : undefined,
    buildIndependent: teachingV2
      ? (_content, parsed) => ({
          pedagogyIssues: lessonPublishIssues(parsed),
          minItems: 3,
          sourceExcerpt: sourceBlock,
          requireSourceSupport: shouldSearchSources(sourceMode),
          subjectHint: "lesson",
        })
      : undefined,
    schemaHint: teachingV2
      ? `${LESSON_V2_SCHEMA_HINT} trueFalse ise options tam olarak ["Doğru","Yanlış"]. Çeldirici gerçek yanılgı olsun; hiçbiri/hepsi yasak. explanation yanlış seçeneği çürütsün ve bölüm metnine bağlansın.`
      : 'Yalnızca JSON: {"title":string,"overview":string,"sections":[{"heading":string,"body":string}],"example":{"prompt":string,"solution":string},"summary":string[],"nextFocus":string[]}',
    verificationContext: teachingV2
      ? `${teacherPersona()} ${sourceBlock.trim() || teacherBrief.trim() ? groundingRules() : ""}
Öğrenci için tek konuluk sınav hazırlık dersi yaz.
Sınav: ${prep.title ?? "Hazırlık"} (${prep.exam_type ?? ""}).
${sessionCtx}
${signalLine}
${standards}
${teacherBrief}
${depth?.line ?? ""}
Bu dersin konusu YALNIZCA: ${topic.label}.
Başka konulara sapma. ${LESSON_TEACH_RULE}
${upcomingPrompt}
${SOURCE_PAGE_FORMULA_RULE}${sourceBlock}${topicBlock}`
      : undefined,
    userPrompt: teachingV2
      ? `${teacherPersona()} ${sourceBlock.trim() || teacherBrief.trim() ? groundingRules() : ""}
Öğrenci için tek konuluk sınav hazırlık dersi yaz.
Sınav: ${prep.title ?? "Hazırlık"} (${prep.exam_type ?? ""}).
${sessionCtx}
${signalLine}
${standards}
${teacherBrief}
${depth?.line ?? ""}
Bu dersin konusu YALNIZCA: ${topic.label}.
Başka konulara sapma. ${LESSON_TEACH_RULE}
${upcomingPrompt}
${SOURCE_PAGE_FORMULA_RULE} ${REVIEW_VARIANT_RULE}${sourceBlock}${topicBlock}`
      : `Öğrenci için Türkçe, tek konuluk sınav hazırlık dersi yaz.
Sınav: ${prep.title ?? "Hazırlık"} (${prep.exam_type ?? ""}).
${signalLine}
Bu dersin konusu YALNIZCA: ${topic.label}.
Başka konulara sapma. Anlatım + 1 çözümlü örnek + özet + sonraki odak.${topicBlock}`,
    parse: (raw) => {
      if (teachingV2) {
        const cleaned = publishLessonDraft(raw);
        if (!cleaned || lessonPublishIssues(raw).length) return null;
        const grounded = groundLearnerLesson(
          cleaned,
          sourceBlock,
          Array.isArray(upcomingTopics) ? { upcomingTopics } : {},
        );
        if (grounded.removed.length) {
          console.error("removed_for_source", { removed: grounded.removed });
        }
        if (!lessonHasTeachingCore(grounded.lesson)) return null;
        return grounded.lesson as NonNullable<typeof cleaned>;
      }
      const result = legacyLessonSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  // Legacy: soft placeholder so older UI does not hard-fail.
  // v2: fail closed — do not store ungated placeholder content.
  if (!outcome.ok) {
    if (teachingV2) return errorResponse(outcome.status, outcome.error);
  }

  let published = outcome.ok ? outcome.data : null;
  if (outcome.ok && teachingV2) {
    const finished = await finishTaughtLesson(
      outcome.data,
      { source: sourceBlock, topicLabel: topic.label },
      (prompt) => completeLessonPartRepair({ service, userId, prompt, maxTokens: 1200 }),
    );
    if (criticalTeachingFailures(finished.failures).length) {
      return errorResponse(500, "lesson_missing");
    }
    if (finished.lesson.sections.filter((section) => section.check).length < 3) {
      return errorResponse(500, "lesson_missing");
    }
    published = finished.lesson;
  }

  const contentMd = published
    ? formatStructuredLesson(published)
    : `## ${topic.label}\n\nBu konu için anlatım henüz üretilemedi. Tekrar dene.`;
  const title = published ? published.title : topic.label;

  const baseLesson = {
    exam_prep_id: prepId,
    topic_id: topicId,
    title,
    content_md: contentMd,
  };

  // Yapıyı da sakla ki ders adım adım gösterilebilsin; markdown yedek kalır.
  let { data: lesson, error: lessonError } = await service
    .from("exam_prep_lessons")
    .insert({ ...baseLesson, content_json: published })
    .select("id")
    .single();

  // content_json kolonu migration ile geliyor. Kod migration'dan önce
  // dağıtılırsa ders üretimi tamamen kırılmasın diye yapısız tekrar denenir —
  // node/route.ts'teki kalibrasyon kolonlarıyla aynı kalıp.
  if (lessonError) {
    ({ data: lesson, error: lessonError } = await service
      .from("exam_prep_lessons")
      .insert(baseLesson)
      .select("id")
      .single());
  }

  if (lessonError || !lesson) return errorResponse(500, "generation_failed");

  await service
    .from("exam_prep_topics")
    .update({
      lesson_id: lesson.id,
      status: topic.status === "done" ? "done" : "in_progress",
      ...(hasSignals ? { familiarity } : {}),
    })
    .eq("id", topicId)
    .eq("exam_prep_id", prepId);

  if (hasSignals) {
    await service.from("study_session_moods").insert({
      user_id: userId,
      exam_prep_id: prepId,
      mood,
    });
  }

  return NextResponse.json({
    ok: true,
    lessonId: lesson.id,
    reused: false,
    coverage: teaching
      ? {
          total: teaching.checklist.length,
          priority: teaching.priority,
        }
      : null,
  });
}

const patchSchema = z.object({
  lessonId: z.string().uuid(),
  liked: z.boolean(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson-like", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: lesson } = await service
    .from("exam_prep_lessons")
    .select("id, exam_prep_id")
    .eq("id", parsed.data.lessonId)
    .maybeSingle();

  if (!lesson) return errorResponse(404, "not_found");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", lesson.exam_prep_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { error } = await service
    .from("exam_prep_lessons")
    .update({ liked: parsed.data.liked })
    .eq("id", lesson.id);

  if (error) return errorResponse(500, "generation_failed");

  return NextResponse.json({ ok: true, liked: parsed.data.liked });
}
