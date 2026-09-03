import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  EMPTY_SOURCE_CONTEXT,
  loadSourceContext,
} from "@/lib/learning/source-context";
import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { PLAN_NODE_META, readinessScore } from "@/lib/learning/exam-prep-plan";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
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

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
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
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        correct: z.boolean(),
        explanation: z.string().min(4),
      }),
    )
    .min(5)
    .max(8),
});

const cardsSchema = z.object({
  cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(4).max(12),
});

const oralSchema = z.object({
  questions: z.array(z.object({ prompt: z.string().min(8), hint: z.string().optional() })).min(3).max(6),
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

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, active_topic_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, kind, title, status, sort_order")
    .eq("id", nodeId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  if (node.status === "locked") return errorResponse(403, "forbidden");

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

  const topicLabel = topic?.label ?? prep.title ?? "Konu";
  const kind = node.kind as PlanNodeKind;
  const difficulty = parsed.data.difficulty ?? "orta";
  const voiceMode = parsed.data.voiceMode ?? false;
  const familiarity = parseFamiliarity(parsed.data.familiarity);
  const mood = parseMood(parsed.data.mood);

  if (action === "complete") {
    const { data: attempt } = await service
      .from("exam_prep_node_attempts")
      .select("id, payload, total")
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const scored = scoreAttempt(kind, attempt?.payload, parsed.data.answers ?? {});
    if (attempt) {
      await service
        .from("exam_prep_node_attempts")
        .update({
          status: "completed",
          score: scored.score,
          total: scored.total,
          answers: parsed.data.answers ?? {},
        })
        .eq("id", attempt.id);
    }

    await service.from("exam_prep_nodes").update({ status: "done" }).eq("id", nodeId);

    const { data: rows } = await service
      .from("exam_prep_nodes")
      .select("id, kind, status, sort_order")
      .eq("exam_prep_id", prepId)
      .order("sort_order");

    const next = (rows ?? []).find(
      (row) => row.sort_order > node.sort_order && row.status === "locked",
    );
    if (next) {
      await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", next.id);
    }

    // Hazırlık puanı arayüzde düğümlerden anlık hesaplanıyor; kolon ise
    // yazılmadığı için ölüydü. Burada tek bir update ile dolduruluyor —
    // düğüm listesi zaten elimizde. Böylece puan, tüm düğümleri çekmeden
    // sunucu tarafında da (okul akışı, ilerleme özetleri) okunabiliyor.
    const readiness = readinessScore(
      (rows ?? []).map((row) => ({
        kind: row.kind as PlanNodeKind,
        status: (row.status as NodeStatus) ?? "locked",
      })),
    );
    // Hata bilerek yutuluyor: kolon migration ile geldi, ama kod ondan
    // önce dağıtılırsa ders tamamlama akışı bir puan yazamadı diye
    // kırılmamalı.
    await service
      .from("exam_preps")
      .update({ readiness_score: readiness })
      .eq("id", prepId);

    return NextResponse.json({
      ok: true,
      score: scored.score,
      total: scored.total,
      nextHref: next
        ? `/deneme-sinavlari/${prepId}/dugum/${next.id}`
        : `/deneme-sinavlari/${prepId}`,
    });
  }

  const premium = await isPremiumUser(service, userId);
  const voiceSession = voiceMode && (kind === "qa" || kind === "oral");

  // Ders öğrencinin kendi kaynağından üretilsin. Hazırlığa bağlı bir belge
  // varsa yalnızca onun içinde, yoksa kullanıcının tüm belgelerinde aranıyor.
  //
  // document_id ayrı okunuyor: kolon migration ile geliyor ve ana select'e
  // eklenseydi, kod migration'dan önce dağıtıldığında her düğüm 404 verirdi.
  const { data: prepSource } = await service
    .from("exam_preps")
    .select("document_id")
    .eq("id", prepId)
    .maybeSingle();

  const source = voiceSession
    ? EMPTY_SOURCE_CONTEXT
    : await loadSourceContext(
        service,
        userId,
        `${prep.title ?? ""} ${topicLabel}`.trim(),
        { documentId: prepSource?.document_id ?? null },
      );

  const payload = voiceSession
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
      });

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
}) {
  // Aşinalık içeriğin nereden başlayacağını, ruh hali tonunu belirler.
  // Kaynak bloğu sona geliyor: model en son okuduğu talimata daha sadık.
  const ctx = `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}. Zorluk: ${input.difficulty}. ${sessionSignalsPrompt(
    input.familiarity,
    input.mood,
  )}${input.sourceBlock}`;

  if (input.kind === "qa") {
    const outcome = await generateExamQuiz({
      service: input.service,
      userId: input.userId,
      isPremium: input.isPremium,
      userPrompt: `${ctx} 5 çoktan seçmeli alıştırma sorusu. Şıklar A/B/C/D gibi net olsun. En az 1 soruda birden fazla doğru şık olsun (multi true, correct dizi).`,
    });
    return { type: "quiz", questions: outcome.ok ? outcome.questions : [] };
  }

  if (input.kind === "podcast") {
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      schemaHint:
        'JSON: {"title":string,"chapters":[{"title":string,"lines":[{"speaker":"ada"|"kerem","text":string}]}]}. ' +
        "Ada ve Kerem iki sunucu; sırayla konuşur, birbirine soru sorar. " +
        "Her text TEK cümle olsun ve 25 kelimeyi geçmesin.",
      userPrompt: `${ctx} Ada ve Kerem'in sohbet ettiği 4 bölümlük kısa podcast senaryosu.`,
      parse: (raw) => podcastSchema.safeParse(raw).data ?? null,
    });
    return outcome.ok
      ? { type: "podcast", ...outcome.data }
      : { type: "podcast", title: input.topicLabel, chapters: [] };
  }

  if (input.kind === "oral") {
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      schemaHint: 'JSON: {"questions":[{"prompt":string,"hint":string}]}',
      userPrompt: `${ctx} 5 sözlü soru.`,
      parse: (raw) => oralSchema.safeParse(raw).data ?? null,
    });
    return { type: "oral", questions: outcome.ok ? outcome.data.questions : [] };
  }

  if (input.kind === "flashcards" || input.kind === "spaced") {
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      schemaHint: 'JSON: {"cards":[{"front":string,"back":string}]}',
      userPrompt: `${ctx} 8 flashcard.`,
      parse: (raw) => cardsSchema.safeParse(raw).data ?? null,
    });
    return { type: "cards", cards: outcome.ok ? outcome.data.cards : [] };
  }

  if (input.kind === "true_false") {
    const outcome = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: actionForKind(input.kind),
      isPremium: input.isPremium,
      schemaHint: 'JSON: {"items":[{"text":string,"correct":boolean,"explanation":string}]}',
      userPrompt: `${ctx} 8 doğru/yanlış.`,
      parse: (raw) => tfSchema.safeParse(raw).data ?? null,
    });
    return { type: "true_false", items: outcome.ok ? outcome.data.items : [] };
  }

  const outcome = await generateExamQuiz({
    service: input.service,
    userId: input.userId,
    isPremium: input.isPremium,
    userPrompt: `${ctx} 5 çoktan seçmeli soru. En az 1 soruda birden fazla doğru şık olsun (multi true, correct dizi). ${input.kind === "written_exam" ? "Sınav disiplini, ipucu yok." : ""} ${input.kind === "gaps" ? "Zayıf nokta / tuzak sorular." : ""}`,
  });
  return { type: "quiz", questions: outcome.ok ? outcome.questions : [] };
}

function publicNodePayload(payload: Record<string, unknown>) {
  if (payload.type !== "quiz") return payload;
  const questions = ((payload.questions as QuizQuestion[]) ?? []).map(publicQuizQuestion);
  return { ...payload, questions };
}

function countTotal(kind: PlanNodeKind, payload: Record<string, unknown>) {
  if (payload.type === "quiz") return ((payload.questions as unknown[]) ?? []).length;
  if (payload.type === "true_false") return ((payload.items as unknown[]) ?? []).length;
  if (payload.type === "cards") return ((payload.cards as unknown[]) ?? []).length;
  if (payload.type === "oral") return ((payload.questions as unknown[]) ?? []).length;
  return 1;
}

function scoreAttempt(
  kind: PlanNodeKind,
  payload: unknown,
  answers: Record<string, unknown>,
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
