import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";
import { parseIssues } from "@/lib/learning/teacher-lesson";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel, fastTier } from "@/lib/learning/teacher-tier";
import {
  parseTeacherPodcast,
  podcastFixSystem,
  podcastFixUserPrompt,
  podcastStructureIssues,
  podcastSystem,
  podcastUserPrompt,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
  salvagePodcast,
  type TeacherPodcastInput,
} from "@/lib/learning/teacher-podcast";

export type AskJson = (system: string, user: string, role?: "draft" | "verify" | "fix") => Promise<unknown | null>;

const MAX_FIX_ROUNDS = 2;
/**
 * İkinci düzeltme turu (yeniden yazım + yeniden denetim, ~40 sn) yerine kalan sorun en çok bu kadar
 * satırı çıkararak çözülüyorsa satır çıkarılır. 19 Ekim 2026: 1 dakikalık özet podcast 6 çağrıda
 * 126 sn sürdü; ikinci turdan sonra yine iki satır çıkarılmıştı.
 */
const SALVAGE_INSTEAD_OF_FIX_LINES = 3;
/** 300 sn tavanı: yeni düzeltme turu bu süreden sonra başlamaz (temizlik dahil). */
const FIX_DEADLINE_MS = 200_000;
/** İkinci taslak ancak bu süreden önce başlar; sonrası rota tavanına sığmaz. */
const SECOND_DRAFT_DEADLINE_MS = 150_000;
/** Model çağrısı düşerse (ağ, sağlayıcı) döngü bu süreden önce bir kez baştan koşar. */
const RERUN_DEADLINE_MS = 120_000;

export type PodcastLoopResult = {
  episode: PodcastEpisode | null;
  problems: string[];
  drafts: number;
  /** Kurtarmada çıkarılan satır sayısı (0: olduğu gibi geçti). */
  salvaged: number;
  /** Denetçi iki kez ulaşılamaz oldu; podcast yalnız yapı denetimiyle yayınlandı. */
  unverified: boolean;
};

/**
 * Taslak → yapı + belge denetimi → modelin düzeltmesi → (gerekirse) kurtarma → (gerekirse)
 * ikinci taslak. Krediye dokunmaz; `runTeacherPodcast` krediyi sarar, yerel ölçüm betiği
 * doğrudan çağırır.
 *
 * 19 Ekim 2026, ürün sahibi: "podcast istendiyse üretilsin; 'üretilemedi' olmasın". Önceden
 * düzeltme turlarından sonra tek bir sorunlu satır bile podcast'in tamamını düşürüyordu
 * (18 Ekim: iki podcast, bir "sınavda ağırlıklı" cümlesi ve tutmayan bir eşitlik). Şimdi
 * sorunlu satır çıkarılır (`salvagePodcast`); satıra bağlanamayan sorun kaldıysa ikinci
 * taslak yazılır; o da olmazsa ancak o zaman podcast yok.
 */
export async function teacherPodcastLoop(
  ask: AskJson,
  input: TeacherPodcastInput,
  started = Date.now(),
): Promise<PodcastLoopResult> {
  const mode = input.mode ?? "document";
  let drafts = 0;

  const review = async (episode: PodcastEpisode): Promise<{ problems: string[]; verified: boolean }> => {
    const structural = podcastStructureIssues(episode);
    try {
      const factual = parseIssues(await ask(podcastVerifySystem(mode), podcastVerifyUserPrompt(episode, input), "verify"))
        .filter((issue) => issue.severity === "high")
        .map((issue) => `[${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`);
      return { problems: [...structural, ...factual], verified: true };
    } catch {
      return { problems: structural, verified: false };
    }
  };

  const attempt = async (
    fixRounds: number,
  ): Promise<{ episode: PodcastEpisode; problems: string[]; verified: boolean } | null> => {
    let episode = parseTeacherPodcast(await ask(podcastSystem(mode, input.length), podcastUserPrompt(input), "draft"), input);
    if (!episode) episode = parseTeacherPodcast(await ask(podcastSystem(mode, input.length), podcastUserPrompt(input), "draft"), input);
    if (!episode) return null;
    drafts += 1;

    let reviewed = await review(episode);
    // Denetçi bir kez ulaşılamadıysa bir daha sorulur; denetimsiz yayın son çaredir.
    if (!reviewed.verified) reviewed = await review(episode);
    for (let round = 0; round < fixRounds && reviewed.problems.length; round += 1) {
      if (Date.now() - started > FIX_DEADLINE_MS) break;
      if (round > 0) {
        const cheap = salvagePodcast(episode, reviewed.problems);
        if (cheap && cheap.removed <= SALVAGE_INSTEAD_OF_FIX_LINES) break;
      }
      const fixed = parseTeacherPodcast(
        await ask(podcastFixSystem(mode, input.length), podcastFixUserPrompt(episode, reviewed.problems, input), "fix"),
        input,
      );
      if (!fixed) break;
      if (JSON.stringify(fixed) === JSON.stringify(episode)) break;
      episode = fixed;
      drafts += 1;
      reviewed = await review(episode);
    }
    return { episode, ...reviewed };
  };

  const finish = (outcome: { episode: PodcastEpisode; problems: string[]; verified: boolean }): PodcastLoopResult | null => {
    if (!outcome.problems.length) {
      return { episode: outcome.episode, problems: [], drafts, salvaged: 0, unverified: !outcome.verified };
    }
    const salvaged = salvagePodcast(outcome.episode, outcome.problems);
    if (!salvaged) return null;
    return { episode: salvaged.episode, problems: [], drafts, salvaged: salvaged.removed, unverified: !outcome.verified };
  };

  const first = await attempt(MAX_FIX_ROUNDS);
  if (!first) return { episode: null, problems: ["Podcast bölümleri kurulamadı."], drafts, salvaged: 0, unverified: false };
  const done = finish(first);
  if (done) return done;

  if (Date.now() - started < SECOND_DRAFT_DEADLINE_MS) {
    const second = await attempt(1);
    if (second) {
      const doneSecond = finish(second);
      if (doneSecond) return doneSecond;
      return { episode: second.episode, problems: second.problems, drafts, salvaged: 0, unverified: false };
    }
  }
  return { episode: first.episode, problems: first.problems, drafts, salvaged: 0, unverified: false };
}

export type TeacherPodcastOutcome =
  | { ok: true; episode: PodcastEpisode; calls: number; ms: number }
  | { ok: false; status: number; error: string; reasons: string[] };

/** Kredi bir kez ayrılır; podcast sorunsuz çıkarsa kesinleşir, çıkmazsa iade. */
async function runTeacherPodcastInner(
  service: SupabaseClient,
  input: TeacherPodcastInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    startedAt?: number;
    /** false: önceden yazım (18 Ekim 2026); kredi ayrılmaz, öğrenci açınca düşer. */
    charge?: boolean;
  },
): Promise<TeacherPodcastOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length && !input.lessonText && input.mode !== "topic") {
    return { ok: false, status: 503, error: "source_unavailable", reasons: ["no_pages"] };
  }
  const free = input.charge === false;
  const reservation = free
    ? ({ ok: true, reservationId: null } as const)
    : await reserveCredits(service, input.userId, input.actionCode, input.idempotencyKey);
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
  // Öğrenci bekliyor (önceden hazır podcast yok): hızlı işlem.
  // Hızlı işlem yalnız Plus/Sigma ve kurucuya (19 Ekim 2026, `fast-access.ts`).
  const tier = fastTier(!free && (await fastAllowedFor(service, input.userId)));
  const ask: AskJson = async (system, user, role) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...tier,
      // 19 Ekim 2026: özet podcast 126 sn sürdü. Testteki gibi yazar ve düzeltme düşük düşünmeyle;
      // her satırı kaynağa karşı okuyan denetçi varsayılanda kalır.
      ...(role === "verify" ? {} : { reasoning_effort: "low" as const }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    await recordUsage(service, {
      userId: input.userId,
      actionCode: free ? "CONTENT_PREFETCH" : input.actionCode,
      model: billedModel(model, response.service_tier),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId: reservation.reservationId,
    }).catch(() => undefined);
    return parseModelJson(response.choices[0]?.message?.content ?? "");
  };

  try {
    let loop: PodcastLoopResult;
    try {
      loop = await teacherPodcastLoop(ask, input, started);
    } catch (error) {
      // Ağ ya da sağlayıcı düştü: öğrenciye hata göstermeden önce döngü bir kez baştan koşar.
      if (Date.now() - started > RERUN_DEADLINE_MS) throw error;
      console.warn("teacher_podcast_rerun", {
        topic: input.topicLabel.slice(0, 80),
        calls,
        cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
      loop = await teacherPodcastLoop(ask, input, started);
    }
    console.info("teacher_podcast", {
      topic: input.topicLabel.slice(0, 80),
      length: input.length,
      mode: input.mode ?? "document",
      drafts: loop.drafts,
      problems: loop.problems.length,
      salvaged: loop.salvaged,
      unverified: loop.unverified,
      calls,
      ms: Date.now() - started,
    });
    if (!loop.episode || loop.problems.length) {
      if (reservation.reservationId) await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: loop.problems.slice(0, 6).map((problem) => problem.slice(0, 200)),
      };
    }
    if (reservation.reservationId) await commitCredits(service, reservation.reservationId);
    return { ok: true, episode: loop.episode, calls, ms: Date.now() - started };
  } catch (error) {
    if (reservation.reservationId) await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error("teacher_podcast_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}

/** Üretim yuvasıyla (19 Ekim 2026, Faz 3.2); bkz. `withGenerationSlot`. */
export async function runTeacherPodcast(...args: Parameters<typeof runTeacherPodcastInner>): Promise<TeacherPodcastOutcome> {
  return withGenerationSlot(
    args[1].charge === false ? "prefetch" : "student",
    () => runTeacherPodcastInner(...args),
    () => ({ ok: false, status: 503, error: "generation_busy", reasons: [] }),
  );
}
