import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";
import { parseIssues } from "@/lib/learning/teacher-lesson";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  parseTeacherPodcast,
  podcastFixSystem,
  podcastFixUserPrompt,
  podcastStructureIssues,
  podcastSystem,
  podcastUserPrompt,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
  type TeacherPodcastInput,
} from "@/lib/learning/teacher-podcast";

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

const MAX_FIX_ROUNDS = 2;
/** 300 sn tavanı: yeni düzeltme turu bu süreden sonra başlamaz (temizlik dahil). */
const FIX_DEADLINE_MS = 200_000;

/**
 * Taslak → yapı + belge denetimi → modelin düzeltmesi. Krediye dokunmaz;
 * `runTeacherPodcast` krediyi sarar, yerel ölçüm betiği doğrudan çağırır.
 */
export async function teacherPodcastLoop(
  ask: AskJson,
  input: TeacherPodcastInput,
  started = Date.now(),
): Promise<{ episode: PodcastEpisode | null; problems: string[]; drafts: number }> {
  const mode = input.mode ?? "document";
  const review = async (episode: PodcastEpisode): Promise<string[]> => {
    const structural = podcastStructureIssues(episode);
    try {
      const factual = parseIssues(await ask(podcastVerifySystem(mode), podcastVerifyUserPrompt(episode, input)))
        .filter((issue) => issue.severity === "high")
        .map((issue) => `[${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`);
      return [...structural, ...factual];
    } catch (error) {
      return [...structural, `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}`];
    }
  };

  let episode = parseTeacherPodcast(await ask(podcastSystem(mode, input.length), podcastUserPrompt(input)), input);
  if (!episode) episode = parseTeacherPodcast(await ask(podcastSystem(mode, input.length), podcastUserPrompt(input)), input);
  if (!episode) return { episode: null, problems: ["Podcast bölümleri kurulamadı."], drafts: 0 };
  let drafts = 1;

  let problems = await review(episode);
  for (let round = 0; round < MAX_FIX_ROUNDS && problems.length; round += 1) {
    if (Date.now() - started > FIX_DEADLINE_MS) break;
    const fixed = parseTeacherPodcast(
      await ask(podcastFixSystem(mode, input.length), podcastFixUserPrompt(episode, problems, input)),
      input,
    );
    if (!fixed) break;
    if (JSON.stringify(fixed) === JSON.stringify(episode)) break;
    episode = fixed;
    drafts += 1;
    problems = await review(episode);
  }
  return { episode, problems, drafts };
}

export type TeacherPodcastOutcome =
  | { ok: true; episode: PodcastEpisode; calls: number; ms: number }
  | { ok: false; status: number; error: string; reasons: string[] };

/** Kredi bir kez ayrılır; podcast sorunsuz çıkarsa kesinleşir, çıkmazsa iade. */
export async function runTeacherPodcast(
  service: SupabaseClient,
  input: TeacherPodcastInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    startedAt?: number;
  },
): Promise<TeacherPodcastOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length && !input.lessonText && input.mode !== "topic") {
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
    const loop = await teacherPodcastLoop(ask, input, started);
    console.info("teacher_podcast", {
      topic: input.topicLabel.slice(0, 80),
      length: input.length,
      mode: input.mode ?? "document",
      drafts: loop.drafts,
      problems: loop.problems.length,
      calls,
      ms: Date.now() - started,
    });
    if (!loop.episode || loop.problems.length) {
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: loop.problems.slice(0, 6).map((problem) => problem.slice(0, 200)),
      };
    }
    await commitCredits(service, reservation.reservationId);
    return { ok: true, episode: loop.episode, calls, ms: Date.now() - started };
  } catch (error) {
    await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error("teacher_podcast_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}
