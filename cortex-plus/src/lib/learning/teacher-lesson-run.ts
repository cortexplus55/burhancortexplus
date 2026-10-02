import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import { parseModelJson, type LessonV2 } from "@/lib/learning/teaching-standards";
import {
  FIX_SYSTEM,
  TEACHER_SYSTEM,
  VERIFY_SYSTEM,
  fixUserPrompt,
  lessonStructureIssues,
  parseIssues,
  parseTeacherLesson,
  teacherUserPrompt,
  verifyUserPrompt,
  type TeacherIssue,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";

export type TeacherLessonOutcome =
  | { ok: true; lesson: LessonV2; calls: number; ms: number; remainingLow: TeacherIssue[] }
  | { ok: false; status: number; error: string; reasons: string[] };

/**
 * 300 sn fonksiyon tavanı: yeni düzeltme turu (düzeltme + denetim ≈ 60-75 sn)
 * isteğin başından bu kadar süre geçtiyse başlamaz. Süre temizlik dahil ölçülür.
 */
const FIX_DEADLINE_MS = 200_000;
const MAX_FIX_ROUNDS = 2;

/**
 * Taslak → belgeyle eşleme → (gerekirse) modelin düzeltmesi → yeniden eşleme.
 * Kredi bir kez ayrılır; ders dönerse kesinleşir, dönmezse iade edilir.
 * Kod ders metnine hiçbir şey eklemez.
 */
export async function runTeacherLesson(
  service: SupabaseClient,
  input: TeacherLessonInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    /** İsteğin başladığı an (temizlik dahil); süre sınırı buna göre. */
    startedAt?: number;
  },
): Promise<TeacherLessonOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length) return { ok: false, status: 503, error: "source_unavailable", reasons: ["no_pages"] };

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
  const ask = async (system: string, user: string): Promise<unknown | null> => {
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
    const loop = await teacherLessonLoop(ask, input, started);
    if (!loop.lesson) {
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return { ok: false, status: 503, error: "generation_failed", reasons: ["schema"] };
    }
    const high = loop.issues.filter((issue) => issue.severity === "high");
    console.info("teacher_lesson", {
      topic: input.topicLabel.slice(0, 80),
      pages: input.pages.map((item) => item.page),
      calls,
      ms: Date.now() - started,
      high: high.length,
      low: loop.issues.length - high.length,
    });
    if (high.length) {
      // Belgeyle tutmayan ders öğrenciye gitmez; kredi iade.
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: high.slice(0, 6).map((issue) => `${issue.where}: ${issue.problem}`.slice(0, 200)),
      };
    }
    const lesson = loop.lesson;
    await commitCredits(service, reservation.reservationId);
    return { ok: true, lesson, calls, ms: Date.now() - started, remainingLow: loop.issues };
  } catch (error) {
    await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error("teacher_lesson_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

/**
 * Taslak → belgeyle eşleme → modelin düzeltmesi döngüsü. Krediye dokunmaz;
 * `runTeacherLesson` krediyi sarar, yerel ölçüm betiği doğrudan çağırır.
 */
export async function teacherLessonLoop(
  ask: AskJson,
  input: TeacherLessonInput,
  started = Date.now(),
): Promise<{ lesson: LessonV2 | null; issues: TeacherIssue[]; drafts: LessonV2[] }> {
  const drafts: LessonV2[] = [];
  const review = async (lesson: LessonV2): Promise<TeacherIssue[]> => {
    const structural = lessonStructureIssues(lesson, input);
    let factual: TeacherIssue[] = [];
    try {
      factual = parseIssues(await ask(VERIFY_SYSTEM, verifyUserPrompt(lesson, input.pages)));
    } catch (error) {
      // Denetçi düşerse dersi körlemesine yayınlamayız: yüksek bir sorun say.
      factual = [{ where: "ders", severity: "high", problem: `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}` }];
    }
    return [...structural, ...factual];
  };

  let lesson = parseTeacherLesson(await ask(TEACHER_SYSTEM, teacherUserPrompt(input)), input.upcomingTopics);
  // Şema tutmadı: bir kez yeniden yazdır.
  if (!lesson) lesson = parseTeacherLesson(await ask(TEACHER_SYSTEM, teacherUserPrompt(input)), input.upcomingTopics);
  if (!lesson) return { lesson: null, issues: [], drafts };
  drafts.push(lesson);

  let issues = await review(lesson);
  for (let round = 0; round < MAX_FIX_ROUNDS && issues.some((issue) => issue.severity === "high"); round += 1) {
    if (Date.now() - started > FIX_DEADLINE_MS) break;
    const fixed = parseTeacherLesson(await ask(FIX_SYSTEM, fixUserPrompt(lesson, issues, input)), input.upcomingTopics);
    if (!fixed) break;
    // Model dersi aynen geri verdiyse yeniden denetlemek boşa çağrı.
    if (JSON.stringify(fixed) === JSON.stringify(lesson)) break;
    lesson = fixed;
    drafts.push(lesson);
    issues = await review(lesson);
  }
  return { lesson, issues, drafts };
}
