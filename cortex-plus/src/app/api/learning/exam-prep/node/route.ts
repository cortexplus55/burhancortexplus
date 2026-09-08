import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  EMPTY_SOURCE_CONTEXT,
  loadSourceContext,
} from "@/lib/learning/source-context";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { trueFalseItemsSchema, TRUE_FALSE_FORMAT } from "@/lib/learning/true-false";
import {
  parseFamiliarity,
  parseMood,
  sessionSignalsPrompt,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import {
  normalizeQuizQuestion,
  publicQuizQuestion,
  scoreQuizAnswers,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import {
  extractMisconceptions,
  flashcardV2Schema,
  oralV2Schema,
  parseSessionMeta,
  podcastV2Schema,
  scoreFlashcardsV2,
  teachingActivityForKind,
  teachingSessionContext,
  teachingStandardConstraints,
  validateFlashcardPedagogy,
  validateOralPedagogy,
  validatePodcastPedagogy,
  validateTrueFalsePedagogy,
  type SessionTeachingMeta,
} from "@/lib/learning/teaching-standards";
import {
  recordLearningTrackingAfterComplete,
  stripAnswerMeta,
} from "@/lib/learning/learning-tracking-persist";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  action: z.enum(["start", "complete"]).default("start"),
  difficulty: z.enum(["kolay", "orta", "ileri"]).optional(),
  voiceMode: z.boolean().optional(),
  // Ders başında sorulan iki sinyal: konuya aşinalık ve o anki ruh hali.
  familiarity: z
    .enum(["new", "heard", "basics", "good", "confident"])
    .optional(),
  mood: z
    .enum(["ready", "curious", "calm", "neutral", "low_energy", "stressed"])
    .optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
});

const tfSchema = z.object({
  items: trueFalseItemsSchema,
});

const cardsSchema = z.object({
  cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(4).max(12),
});

const oralSchema = z.object({
  questions: z.array(z.object({ prompt: z.string().min(8), hint: z.string().optional() })).min(3).max(6),
});

const oralGradeSchema = z.object({
  correctCount: z.number().int().min(0),
  missingObjectives: z.array(z.string()).max(6).optional(),
  scoreRationale: z.string().max(400).optional(),
});

// Satır bazlı iki sesli biçim: her satır tek cümle, konuşmacı etiketli.
// Ses cümle başına üretildiği için senkron tahmine değil ölçüme dayanıyor.
const podcastSchema = z.object({
  title: z.string().min(1),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1),
        lines: z
          .array(
            z.object({
              speaker: z.enum(["ada", "kerem"]),
              text: z.string().min(4),
            }),
          )
          .min(2)
          .max(14),
      }),
    )
    .min(3)
    .max(5),
});

function actionForKind(kind: PlanNodeKind) {
  if (kind === "flashcards" || kind === "spaced") return "FLASHCARD_GENERATE" as const;
  if (kind === "podcast" || kind === "oral") return "STUDY_PLAN_GENERATE" as const;
  return "QUIZ_GENERATE" as const;
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-node", limit: 16 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, nodeId, action } = parsed.data;
  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, active_topic_id, target_score")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, kind, title, status, sort_order, session_meta")
    .eq("id", nodeId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  if (node.status === "locked") return errorResponse(403, "forbidden");

  const sessionMeta = teachingV2 ? parseSessionMeta(node.session_meta) : null;

  const { data: topic } = prep.active_topic_id
    ? await service
        .from("exam_prep_topics")
        .select("id, label")
        .eq("id", prep.active_topic_id)
        .maybeSingle()
    : await service
        .from("exam_prep_topics")
        .select("id, label")
        .eq("exam_prep_id", prepId)
        .order("sort_order")
        .limit(1)
        .maybeSingle();

  const topicLabel =
    sessionMeta?.topicTitle?.trim() || topic?.label || prep.title || "Konu";
  const kind = node.kind as PlanNodeKind;
  const difficulty = parsed.data.difficulty ?? "orta";
  const voiceMode = parsed.data.voiceMode ?? false;
  const familiarity = parseFamiliarity(parsed.data.familiarity);
  const mood = parseMood(parsed.data.mood);

  if (action === "complete") {
    let attemptQuery = service
      .from("exam_prep_node_attempts")
      .select("id, payload, total, score, status")
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId);
    // Explicit attempt IDs prevent another tab's newer attempt being graded.
    attemptQuery = parsed.data.attemptId
      ? attemptQuery.eq("id", parsed.data.attemptId)
      : attemptQuery.eq("status", "active");
    const { data: attempt, error: attemptError } = await attemptQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) return errorResponse(503, "attempt_lookup_failed");
    if (!attempt) return errorResponse(409, "active_attempt_required");

    let scored = scoreAttempt(
      kind,
      attempt?.payload,
      parsed.data.answers ?? {},
      teachingV2,
    );
    let oralExtras: { missingObjectives?: string[]; scoreRationale?: string } = {};
    if (kind === "oral" && attempt?.payload && attempt.status !== "completed") {
      const questions = ((attempt.payload as {
        questions?: {
          prompt?: string;
          learningObjective?: string;
          expectedPoints?: string[];
          rubricCriteria?: string[];
        }[];
      }).questions ?? []);
      const answerLines = questions
        .map((question, index) =>
          `${index + 1}. Soru: ${question.prompt ?? ""}\nHedef: ${question.learningObjective ?? "-"}\nRubrik: ${(question.rubricCriteria ?? []).join("; ")}\nBeklenen: ${(question.expectedPoints ?? []).join("; ")}\nÖğrenci yanıtı: ${String(parsed.data.answers?.[String(index)] ?? "")}`,
        )
        .join("\n\n");
      const grade = await generateJson({
        service,
        userId,
        actionCode: "PRACTICE_EXAM_GRADE",
        isPremium: await isPremiumUser(service, userId),
        schemaHint: teachingV2
          ? `Yalnızca {"correctCount":number,"missingObjectives":string[],"scoreRationale":string} JSON. correctCount 0-${questions.length}. Eşdeğer doğru kabul et; gerekçesiz uzun ilgisiz metin doğru sayma.`
          : `Yalnızca {"correctCount":number} JSON döndür. correctCount 0-${questions.length} arasında tam sayı olmalı. Anlamsız, ilgisiz veya yalnızca genel ifadeler doğru sayılmaz.`,
        userPrompt: `${topicLabel} sözlü yanıtlarını içerik doğruluğuna göre değerlendir. Her yanıtı ancak soruyu doğru ve yeterli biçimde cevaplıyorsa doğru say.\n\n${answerLines}`,
        parse: (raw) => oralGradeSchema.safeParse(raw).data ?? null,
      });
      if (!grade.ok) return errorResponse(grade.status, grade.error);
      if (grade.ok) {
        scored = {
          score: Math.min(questions.length, grade.data.correctCount),
          total: questions.length || 1,
        };
        oralExtras = {
          missingObjectives: grade.data.missingObjectives,
          scoreRationale: grade.data.scoreRationale,
        };
      }
    }
    const rawAnswers = parsed.data.answers ?? {};
    const answersForRpc = teachingV2 ? stripAnswerMeta(rawAnswers) : rawAnswers;

    const { data: completed, error: completeError } = await service.rpc("complete_exam_prep_node", {
      p_user_id: userId,
      p_prep_id: prepId,
      p_node_id: nodeId,
      p_attempt_id: attempt.id,
      p_score: scored.score,
      p_total: scored.total,
      p_answers: answersForRpc,
    });
    if (completeError || !completed) return errorResponse(503, "completion_failed");

    let nextHref = completed.nextId
      ? `/deneme-sinavlari/${prepId}/dugum/${completed.nextId}`
      : `/deneme-sinavlari/${prepId}`;
    let learningTracking: unknown = null;

    if (teachingV2) {
      let payloadForEvidence = attempt.payload;
      if (Object.keys(oralExtras).length) {
        payloadForEvidence = {
          ...((attempt.payload as object) ?? {}),
          gradeMeta: oralExtras,
        };
        await service
          .from("exam_prep_node_attempts")
          .update({ payload: payloadForEvidence })
          .eq("id", attempt.id);
      }

      const drafts = extractMisconceptions({
        kind,
        payload: payloadForEvidence,
        answers: answersForRpc,
        topicLabel,
      });
      if (drafts.length) {
        await service.from("exam_prep_misconceptions").insert(
          drafts.map((d) => ({
            user_id: userId,
            exam_prep_id: prepId,
            node_id: nodeId,
            attempt_id: attempt.id,
            topic_label: d.topicLabel,
            claim: d.claim,
            corrected: d.corrected,
            wrong_type: d.wrongType,
            source_kind: d.sourceKind,
            question_preview: d.questionPreview,
          })),
        );
      }

      try {
        const tracked = await recordLearningTrackingAfterComplete(service, {
          userId,
          prepId,
          nodeId,
          attemptId: attempt.id,
          kind,
          payload: payloadForEvidence,
          answers: rawAnswers,
          topicLabel,
          sessionObjective: sessionMeta?.objective ?? null,
          targetScore:
            typeof prep.target_score === "number" ? prep.target_score : null,
        });
        learningTracking = tracked.tracking;
        if (tracked.nextNodeId) {
          nextHref = `/deneme-sinavlari/${prepId}/dugum/${tracked.nextNodeId}`;
        }
      } catch {
        // Tracking is additive; completion already succeeded.
      }
    }

    return NextResponse.json({
      ok: true,
      score: completed.score,
      total: completed.total,
      nextHref,
      learningTracking,
    });
  }

  const premium = await isPremiumUser(service, userId);
  const voiceSession = voiceMode && (kind === "qa" || kind === "oral");

  // Ders öğrencinin kendi kaynağından üretilsin. Hazırlığa bağlı bir belge
  // varsa yalnızca onun içinde, yoksa kullanıcının tüm belgelerinde aranıyor.
  //
  // document_id ayrı okunuyor: kolon migration ile geliyor ve ana select'e
  // eklenseydi, kod migration'dan önce dağıtıldığında her düğüm 404 verirdi.
  const { data: prepSource, error: sourceLookupError } = await service
    .from("exam_preps")
    .select("document_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceLookupError || !prepSource) return errorResponse(503, "source_unavailable");

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

  let source;
  try {
    source = voiceSession
      ? EMPTY_SOURCE_CONTEXT
      : await loadSourceContext(
          service,
          userId,
          `${prep.title ?? ""} ${topicLabel} ${sessionMeta?.objective ?? ""}`.trim(),
          {
            documentId: prepSource?.document_id ?? null,
            sourceBoundaryMode: teachingV2
              ? sourceBoundaryMode ?? "documents_only"
              : null,
          },
        );
  } catch {
    return errorResponse(503, "source_unavailable");
  }

  // v2 + bound document: empty source must fail closed (no silent general-knowledge fill).
  if (
    teachingV2 &&
    !voiceSession &&
    prepSource.document_id &&
    !source.block.trim()
  ) {
    return errorResponse(503, "source_unavailable");
  }

  let payload: Record<string, unknown>;
  try {
    payload = voiceSession
      ? { type: "voice" }
      : await generateNodePayload({
          service,
          userId,
          isPremium: premium,
          kind,
          prepTitle: prep.title ?? "Hazırlık",
          topicLabel,
          difficulty,
          familiarity,
          mood,
          sourceBlock: source.block,
          teachingV2,
          sessionMeta,
          requireSourceSupport: Boolean(
            teachingV2 && prepSource.document_id && sourceBoundaryMode !== "allow_supporting",
          ),
        });
  } catch (error) {
    if (error instanceof NodeGenerationError) return errorResponse(error.status, error.code);
    return errorResponse(502, "generation_failed");
  }

  const total = countTotal(kind, payload);
  const baseAttempt = {
    node_id: nodeId,
    exam_prep_id: prepId,
    user_id: userId,
    topic_id: topic?.id ?? null,
    difficulty,
    voice_mode: voiceMode,
    payload,
    total,
    status: "active",
  };

  let { data: attempt, error } = await service
    .from("exam_prep_node_attempts")
    .insert({ ...baseAttempt, familiarity, mood })
    .select("id")
    .single();

  // Kalibrasyon kolonları migration ile geliyor. Kod migration'dan önce
  // dağıtılırsa ders üretimi tamamen kırılmasın diye sinyalsiz tekrar denenir.
  if (error) {
    ({ data: attempt, error } = await service
      .from("exam_prep_node_attempts")
      .insert(baseAttempt)
      .select("id")
      .single());
  }

  if (error || !attempt) return errorResponse(500, "generation_failed");

  // Aşinalık konuya yazılır ki sonraki derste varsayılan olarak gelsin;
  // ruh hali zaman içinde desen çıkarmak için ayrı tabloda birikir.
  // İkisi de yan etki: başarısız olurlarsa dersi engellemezler.
  if (topic?.id) {
    await service
      .from("exam_prep_topics")
      .update({ familiarity })
      .eq("id", topic.id);
  }
  await service.from("study_session_moods").insert({
    user_id: userId,
    exam_prep_id: prepId,
    node_id: nodeId,
    mood,
  });

  if (node.status !== "done") {
    await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    kind,
    title: PLAN_NODE_META[kind]?.setupLabel ?? node.title,
    topicLabel,
    voiceMode,
    payload: publicNodePayload(payload),
  });
}

class NodeGenerationError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

async function generateNodePayload(input: {
  service: Parameters<typeof generateJson>[0]["service"];
  userId: string;
  isPremium: boolean;
  kind: PlanNodeKind;
  prepTitle: string;
  topicLabel: string;
  difficulty: string;
  familiarity: Familiarity;
  mood: Mood;
  /** Öğrencinin kendi kaynağından alıntılar; kaynak yoksa boş. */
  sourceBlock: string;
  teachingV2: boolean;
  sessionMeta: SessionTeachingMeta | null;
  requireSourceSupport?: boolean;
}) {
  const activity = teachingActivityForKind(input.kind);
  const sessionCtx = input.teachingV2
    ? teachingSessionContext(input.sessionMeta, input.topicLabel)
    : "";
  const standards = input.teachingV2 ? teachingStandardConstraints(activity) : "";
  // Aşinalık içeriğin nereden başlayacağını, ruh hali tonunu belirler.
  // Kaynak bloğu sona geliyor: model en son okuduğu talimata daha sadık.
  const ctx = `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}. Zorluk: ${input.difficulty}. ${sessionSignalsPrompt(
    input.familiarity,
    input.mood,
  )} ${sessionCtx} ${standards}${input.sourceBlock}`;

  const v2Common = input.teachingV2
    ? {
        validationProfile: "v2" as const,
        maxDraftAttempts: 2 as const,
        allowIndependentAccept: true,
        activityKind: activity,
      }
    : {};

  const sourceIndependent = {
    sourceExcerpt: input.sourceBlock,
    requireSourceSupport: Boolean(input.requireSourceSupport),
    sourcePages: input.sessionMeta?.sourcePages,
  };

  if (input.kind === "qa") {
    const outcome = await generateExamQuiz({
      service: input.service,
      userId: input.userId,
      isPremium: input.isPremium,
      teachingV2: input.teachingV2,
      difficulty: input.teachingV2 ? "hard" : undefined,
      sourceExcerpt: input.sourceBlock,
      requireSourceSupport: input.requireSourceSupport,
      sourcePages: input.sessionMeta?.sourcePages,
      userPrompt: input.teachingV2
        ? `${ctx} 5 alıştırma sorusu (intro Q&A standardı). Tek kavramdan başla; en az 1 soruda kademeli ipucu için explanation'da ilk adımı ver. En az 1 multi=true yalnızca gerçekten birden fazla bağımsız doğru varken.`
        : `${ctx} 5 çoktan seçmeli alıştırma sorusu. Şıklar A/B/C/D gibi net olsun. En az 1 soruda birden fazla doğru şık olsun (multi true, correct dizi).`,
    });
    if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
    return { type: "quiz", questions: outcome.questions, teachingStandard: activity };
  }

  if (input.kind === "podcast") {
    const schema = input.teachingV2 ? podcastV2Schema : podcastSchema;
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      // Hard difficulty uses the advanced model — podcast pedagogy + review
      // rejected mini drafts too often in Stage 5 browser checks.
      difficulty: input.teachingV2 ? "hard" : undefined,
      ...v2Common,
      buildIndependent: input.teachingV2
        ? (_c, parsed) => {
            const data = schema.safeParse(parsed).data;
            return {
              pedagogyIssues: data
                ? validatePodcastPedagogy(data)
                : ["Podcast şeması geçersiz."],
              minItems: 4,
              ...sourceIndependent,
            };
          }
        : undefined,
      schemaHint: input.teachingV2
        ? 'JSON: {"title":string,"objective":string,"sourcePoints":string[],"chapters":[{"title":string,"lines":[{"speaker":"ada"|"kerem","text":string}]}]}. ' +
          "4-5 bölüm: Tanım, Neden, Örnek, Yaygın hata, Özet. Ada ve Kerem sırayla. Her text TEK cümle, ≤25 kelime. Kaynak dışı iddia yok."
        : 'JSON: {"title":string,"chapters":[{"title":string,"lines":[{"speaker":"ada"|"kerem","text":string}]}]}. ' +
          "Ada ve Kerem iki sunucu; sırayla konuşur, birbirine soru sorar. " +
          "Her text TEK cümle olsun ve 25 kelimeyi geçmesin.",
      userPrompt: input.teachingV2
        ? `${ctx} Ada ve Kerem'in kaynak bağlı 5 bölümlük podcast senaryosu (Tanım→Neden→Örnek→Yaygın hata→Özet).`
        : `${ctx} Ada ve Kerem'in sohbet ettiği 4 bölümlük kısa podcast senaryosu.`,
      parse: (raw) => {
        const data = schema.safeParse(raw).data ?? null;
        if (!data) return null;
        if (input.teachingV2) {
          const issues = validatePodcastPedagogy(data);
          if (issues.length) return null;
        }
        return data;
      },
    });
    if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
    return { type: "podcast", ...outcome.data, teachingStandard: activity };
  }

  if (input.kind === "oral") {
    const schema = input.teachingV2 ? oralV2Schema : oralSchema;
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      ...v2Common,
      buildIndependent: input.teachingV2
        ? (_c, parsed) => {
            const data = schema.safeParse(parsed).data;
            return {
              pedagogyIssues: data
                ? validateOralPedagogy(data.questions)
                : ["Sözlü şema geçersiz."],
              minItems: 3,
              ...sourceIndependent,
            };
          }
        : undefined,
      schemaHint: input.teachingV2
        ? 'JSON: {"questions":[{"prompt":string,"hint":string,"learningObjective":string,"rubricCriteria":string[],"expectedPoints":string[]}]}'
        : 'JSON: {"questions":[{"prompt":string,"hint":string}]}',
      userPrompt: input.teachingV2
        ? `${ctx} 5 sözlü soru; her birinde rubrik ve beklenen noktalar. Sınav kipinde yardım sınırlı — hint kısa tut veya boş bırak.`
        : `${ctx} 5 sözlü soru.`,
      parse: (raw) => {
        const data = schema.safeParse(raw).data ?? null;
        if (!data) return null;
        if (input.teachingV2) {
          const issues = validateOralPedagogy(data.questions);
          if (issues.length) return null;
        }
        return data;
      },
    });
    if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
    return { type: "oral", questions: outcome.data.questions, teachingStandard: activity };
  }

  if (input.kind === "flashcards" || input.kind === "spaced") {
    const schema = input.teachingV2 ? flashcardV2Schema : cardsSchema;
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      ...v2Common,
      buildIndependent: input.teachingV2
        ? (_c, parsed) => {
            const data = schema.safeParse(parsed).data;
            return {
              pedagogyIssues: data
                ? validateFlashcardPedagogy(data.cards)
                : ["Flashcard şeması geçersiz."],
              minItems: 4,
              ...sourceIndependent,
            };
          }
        : undefined,
      schemaHint: input.teachingV2
        ? 'JSON: {"cards":[{"front":string,"back":string,"difficulty":"easy"|"medium"|"hard"}]}. Zor kartlar önce. Ön yüz cevabı sızdırmasın. Tek olgu/kart.'
        : 'JSON: {"cards":[{"front":string,"back":string}]}',
      userPrompt: input.teachingV2
        ? `${ctx} 8 flashcard. difficulty=hard olanlar listenin başında. "Biliyorum" ustalığı iddiası değildir.`
        : `${ctx} 8 flashcard.`,
      parse: (raw) => {
        const data = schema.safeParse(raw).data ?? null;
        if (!data) return null;
        if (input.teachingV2) {
          const issues = validateFlashcardPedagogy(data.cards);
          if (issues.length) return null;
        }
        return data;
      },
    });
    if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
    return {
      type: "cards",
      cards: outcome.data.cards,
      teachingStandard: activity,
      masteryClaim: false,
    };
  }

  if (input.kind === "true_false") {
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      ...v2Common,
      buildIndependent: input.teachingV2
        ? (_c, parsed) => {
            const data = tfSchema.safeParse(parsed).data;
            return {
              pedagogyIssues: data
                ? validateTrueFalsePedagogy(data.items)
                : ["Doğru/yanlış şeması geçersiz."],
              minItems: 5,
              ...sourceIndependent,
            };
          }
        : undefined,
      schemaHint:
        'JSON: {"items":[{"text":string,"correct":boolean,"explanation":string,"correctedStatement":string,"misconceptionTag":string}]} ' +
        TRUE_FALSE_FORMAT,
      userPrompt: `${ctx} 8 doğru/yanlış önermesi. Her önerme bir kavramı veya yaygın yanılgıyı ölçsün. ${TRUE_FALSE_FORMAT}`,
      parse: (raw) => {
        const data = tfSchema.safeParse(raw).data ?? null;
        if (!data) return null;
        if (input.teachingV2) {
          const issues = validateTrueFalsePedagogy(data.items);
          if (issues.length) return null;
        }
        return data;
      },
    });
    if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
    return { type: "true_false", items: outcome.data.items, teachingStandard: activity };
  }

  const outcome = await generateExamQuiz({
    service: input.service,
    userId: input.userId,
    isPremium: input.isPremium,
    teachingV2: input.teachingV2,
    difficulty: input.teachingV2 ? "hard" : undefined,
    sourceExcerpt: input.sourceBlock,
    requireSourceSupport: input.requireSourceSupport,
    sourcePages: input.sessionMeta?.sourcePages,
    userPrompt: `${ctx} 5 çoktan seçmeli soru. ${
      input.teachingV2
        ? "multi=true yalnızca gerçekten birden fazla bağımsız doğru varken; aksi halde multi false. Her soruda learningObjective ve explanation yaz."
        : "En az 1 soruda birden fazla doğru şık olsun (multi true, correct dizi)."
    } ${input.kind === "written_exam" ? "Sınav disiplini, ipucu yok." : ""} ${input.kind === "gaps" ? "Zayıf nokta / tuzak sorular." : ""}`,
  });
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error);
  return { type: "quiz", questions: outcome.questions, teachingStandard: activity };
}

function publicNodePayload(payload: Record<string, unknown>) {
  if (payload.type !== "quiz") return payload;
  const questions = ((payload.questions as QuizQuestion[]) ?? []).map(publicQuizQuestion);
  return { ...payload, questions };
}

function countTotal(kind: PlanNodeKind, payload: Record<string, unknown>) {
  if (payload.type === "quiz") return ((payload.questions as unknown[]) ?? []).length;
  if (payload.type === "true_false") return ((payload.items as unknown[]) ?? []).length;
  if (payload.type === "cards") {
    // v2: participation total stays 1 (masteryClaim false); legacy uses card count.
    if (payload.masteryClaim === false) return 1;
    return ((payload.cards as unknown[]) ?? []).length;
  }
  if (payload.type === "oral") return ((payload.questions as unknown[]) ?? []).length;
  return 1;
}

function scoreAttempt(
  kind: PlanNodeKind,
  payload: unknown,
  answers: Record<string, unknown>,
  teachingV2: boolean,
) {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type === "quiz") {
    const questions = ((data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) ?? [])
      .map(normalizeQuizQuestion)
      .filter((question): question is QuizQuestion => question !== null);
    return scoreQuizAnswers(questions, answers);
  }
  if (data.type === "true_false") {
    const items = (data.items as { correct: boolean }[]) ?? [];
    let score = 0;
    items.forEach((item, index) => {
      const value = answers[String(index)];
      if (value === item.correct || value === String(item.correct)) score += 1;
    });
    return { score, total: items.length || 1 };
  }
  if (data.type === "cards") {
    const cards = (data.cards as unknown[]) ?? [];
    if (teachingV2 || data.masteryClaim === false) {
      return scoreFlashcardsV2(cards.length, answers);
    }
    let score = 0;
    cards.forEach((_, index) => {
      if (answers[String(index)] === true || answers[String(index)] === "true") score += 1;
    });
    return { score, total: cards.length || 1 };
  }
  if (data.type === "oral") {
    const questions = (data.questions as unknown[]) ?? [];
    let score = 0;
    questions.forEach((_, index) => {
      if (String(answers[String(index)] ?? "").trim().length > 8) score += 1;
    });
    return { score, total: questions.length || 1 };
  }
  return { score: 1, total: 1 };
}
