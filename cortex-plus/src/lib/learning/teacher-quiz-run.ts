import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  parseQuizIssues,
  parseTeacherQuiz,
  quizFixSystem,
  quizFixUserPrompt,
  quizStructureIssues,
  quizSystem,
  quizUserPrompt,
  quizVerifySystem,
  quizVerifyUserPrompt,
  shuffleOptions,
  type TeacherQuizInput,
} from "@/lib/learning/teacher-quiz";

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

/** Taslakta öğrenciye gidecek sayının üstüne yedek soru: elenen yerine geçer. */
const SPARE = 2;
const MAX_FIX_ROUNDS = 2;
/** 300 sn tavanı: yeni düzeltme turu bu süreden sonra başlamaz (temizlik dahil). */
const FIX_DEADLINE_MS = 200_000;

export function minimumQuestions(count: number): number {
  return Math.max(3, count - 2);
}

type Reviewed = { question: QuizQuestion; problems: string[] };

/**
 * Taslak → yapı + bağımsız çözüm denetimi → sorunlu sorular modelin
 * düzeltmesine. Krediye dokunmaz; `runTeacherQuiz` krediyi sarar, yerel
 * ölçüm betiği doğrudan çağırır.
 */
export async function teacherQuizLoop(
  ask: AskJson,
  input: TeacherQuizInput,
  started = Date.now(),
): Promise<{ questions: QuizQuestion[]; rejected: Reviewed[]; rounds: number }> {
  const mode = input.mode ?? "document";
  const review = async (questions: QuizQuestion[]): Promise<Reviewed[]> => {
    const structural = questions.map((question) => quizStructureIssues(question));
    let factual: ReturnType<typeof parseQuizIssues> = [];
    try {
      factual = parseQuizIssues(await ask(quizVerifySystem(mode), quizVerifyUserPrompt(questions, input)));
    } catch (error) {
      // Denetlenemeyen soru öğrenciye gitmez.
      return questions.map((question) => ({
        question,
        problems: [`Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}`],
      }));
    }
    return questions.map((question, index) => ({
      question,
      problems: [
        ...structural[index],
        ...factual
          .filter((issue) => issue.question === index && issue.severity === "high")
          .map((issue) => `${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`),
      ],
    }));
  };

  let draft = parseTeacherQuiz(await ask(quizSystem(mode, input.focus), quizUserPrompt(input, input.count + SPARE)));
  if (!draft) draft = parseTeacherQuiz(await ask(quizSystem(mode, input.focus), quizUserPrompt(input, input.count + SPARE)));
  if (!draft) return { questions: [], rejected: [], rounds: 0 };

  const reviewed = await review(draft);
  const good = reviewed.filter((item) => !item.problems.length).map((item) => item.question);
  let bad = reviewed.filter((item) => item.problems.length);
  let rounds = 0;
  while (good.length < input.count && bad.length && rounds < MAX_FIX_ROUNDS && Date.now() - started < FIX_DEADLINE_MS) {
    rounds += 1;
    const fixed = parseTeacherQuiz(await ask(quizFixSystem(mode, input.focus), quizFixUserPrompt(bad, input)));
    if (!fixed) break;
    const again = await review(fixed);
    good.push(...again.filter((item) => !item.problems.length).map((item) => item.question));
    bad = again.filter((item) => item.problems.length);
  }
  return { questions: good.slice(0, input.count).map(shuffleOptions), rejected: bad, rounds };
}

export type TeacherQuizOutcome =
  | { ok: true; questions: QuizQuestion[]; calls: number; ms: number; reservationId?: string }
  | { ok: false; status: number; error: string; reasons: string[] };

/** Kredi bir kez ayrılır; yeterli soru çıkarsa kesinleşir, çıkmazsa iade. */
export async function runTeacherQuiz(
  service: SupabaseClient,
  input: TeacherQuizInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    startedAt?: number;
    /**
     * Ücreti çağıran kessin (düello: soru kümesi kullanılamazsa iade).
     * true iken dönen reservationId bekleyen durumdadır.
     */
    deferCommit?: boolean;
    /** Asgari soru sayısı; yoksa count − 2 (en az 3). */
    minimum?: number;
  },
): Promise<TeacherQuizOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length && !input.sourceBlock?.trim() && input.mode !== "topic") {
    return { ok: false, status: 503, error: "source_unavailable", reasons: ["no_pages"] };
  }
  const reservation = await reserveCredits(service, input.userId, input.actionCode, input.idempotencyKey);
  if (!reservation.ok) {
    return {
      ok: false,
      status: reservation.reason === "insufficient_credits" ? 402 : 409,
      error: reservation.reason,
      reasons: [],
    };
  }
  const started = input.startedAt ?? Date.now();
  const model = contentModel();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  const ask: AskJson = async (system, user) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    await recordUsage(service, {
      userId: input.userId,
      actionCode: input.actionCode,
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId: reservation.reservationId,
    }).catch(() => undefined);
    return parseModelJson(response.choices[0]?.message?.content ?? "");
  };

  try {
    const loop = await teacherQuizLoop(ask, input, started);
    console.info("teacher_quiz", {
      topic: input.topicLabel.slice(0, 80),
      mode: input.mode ?? "document",
      kept: loop.questions.length,
      rejected: loop.rejected.length,
      rounds: loop.rounds,
      calls,
      ms: Date.now() - started,
    });
    if (loop.questions.length < (input.minimum ?? minimumQuestions(input.count))) {
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: loop.rejected.slice(0, 4).map((item) => item.problems[0]?.slice(0, 200) ?? "sorun"),
      };
    }
    if (input.deferCommit) {
      return { ok: true, questions: loop.questions, calls, ms: Date.now() - started, reservationId: reservation.reservationId };
    }
    await commitCredits(service, reservation.reservationId);
    return { ok: true, questions: loop.questions, calls, ms: Date.now() - started, reservationId: reservation.reservationId };
  } catch (error) {
    await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error("teacher_quiz_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}
