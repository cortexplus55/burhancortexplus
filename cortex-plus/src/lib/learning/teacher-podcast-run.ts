import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import {
  MIN_CHECK_QUESTIONS,
  PODCAST_CHECK_BRIEF,
  PODCAST_CHECK_COUNT,
  podcastCheckEligible,
  podcastCheckSource,
} from "@/lib/learning/podcast-check";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel, fastTier } from "@/lib/learning/teacher-tier";
import { QUIZ_FIX_DEADLINE_MS, teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";
import { usesScriptWriter } from "@/lib/learning/podcast-script-writer";
import {
  parsePodcastIssues,
  parseTeacherPodcast,
  podcastFixSystem,
  podcastFixUserPrompt,
  podcastIssueLine,
  podcastStructureIssues,
  podcastWriterSystem,
  podcastUserPrompt,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
  salvagePodcast,
  type TeacherPodcastInput,
} from "@/lib/learning/teacher-podcast";

/**
 * "script" / "scriptfix": iki sesli podcast'in senarist taslağı ve düzeltmesi (23 Ekim 2026): yazar modeli
 * (`OPENAI_PODCAST_WRITER_MODEL`), taslak orta, düzeltme düşük düşünmeyle. Öbürleri içerik modeli; denetçi varsayılan.
 */
export type AskJson = (
  system: string,
  user: string,
  role?: "draft" | "verify" | "fix" | "script" | "scriptfix",
) => Promise<unknown | null>;

const MAX_FIX_ROUNDS = 2;
/**
 * İkinci düzeltme turu (yeniden yazım + yeniden denetim, ~40 sn) yerine kalan sorun en çok bu kadar
 * satırı çıkararak çözülüyorsa satır çıkarılır. 19 Ekim 2026: 1 dakikalık özet podcast 6 çağrıda
 * 126 sn sürdü; ikinci turdan sonra yine iki satır çıkarılmıştı.
 */
const SALVAGE_INSTEAD_OF_FIX_LINES = 3;
/**
 * Yeni düzeltme turu bu süreden sonra başlamaz; kalan sorun satır çıkarılarak çözülür (`salvagePodcast`).
 * 23 Ekim 2026: 200 sn'ydi; senarist yazar (orta düşünme) ve kulak düzeltmesiyle iki tur alan podcast'te dinleme
 * kontrolü 210. sn sınırına yetişmiyordu. Tur ~45 sn sürer: 150'de başlayan tur ~195'te biter, kontrol başlar.
 */
const FIX_DEADLINE_MS = 150_000;
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
  /** Son denetimin kulak maddeleri (20 Ekim 2026): G/H/I kaç kez yüksek çıktı. */
  earIssues?: { G: number; H: number; I: number };
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
  /** Son denetimin kulak maddeleri (G/H/I): ek düzeltme turunun bedeli ölçülsün. */
  let ear = { G: 0, H: 0, I: 0 };

  const review = async (episode: PodcastEpisode): Promise<{ problems: string[]; verified: boolean }> => {
    const structural = podcastStructureIssues(episode);
    try {
      // Madde harfiyle (20 Ekim 2026): kurtarma G/H/I'yı A-F'den ayrı işler (`salvagePodcast`).
      const high = parsePodcastIssues(await ask(podcastVerifySystem(mode), podcastVerifyUserPrompt(episode, input), "verify"))
        .filter((issue) => issue.severity === "high");
      ear = {
        G: high.filter((issue) => issue.rule === "G").length,
        H: high.filter((issue) => issue.rule === "H").length,
        I: high.filter((issue) => issue.rule === "I").length,
      };
      return { problems: [...structural, ...high.map(podcastIssueLine)], verified: true };
    } catch {
      return { problems: structural, verified: false };
    }
  };

  const attempt = async (
    fixRounds: number,
  ): Promise<{ episode: PodcastEpisode; problems: string[]; verified: boolean } | null> => {
    const writerRole = usesScriptWriter(input.length) ? "script" : "draft";
    let episode = parseTeacherPodcast(await ask(podcastWriterSystem(mode, input.length), podcastUserPrompt(input), writerRole), input);
    if (!episode) episode = parseTeacherPodcast(await ask(podcastWriterSystem(mode, input.length), podcastUserPrompt(input), writerRole), input);
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
        await ask(
          podcastFixSystem(mode, input.length),
          podcastFixUserPrompt(episode, reviewed.problems, input),
          usesScriptWriter(input.length) ? "scriptfix" : "fix",
        ),
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
      return { episode: outcome.episode, problems: [], drafts, salvaged: 0, unverified: !outcome.verified, earIssues: ear };
    }
    const salvaged = salvagePodcast(outcome.episode, outcome.problems);
    if (!salvaged) return null;
    return { episode: salvaged.episode, problems: [], drafts, salvaged: salvaged.removed, unverified: !outcome.verified, earIssues: ear };
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
      return { episode: second.episode, problems: second.problems, drafts, salvaged: 0, unverified: false, earIssues: ear };
    }
  }
  return { episode: first.episode, problems: first.problems, drafts, salvaged: 0, unverified: false, earIssues: ear };
}

/*
  Dinleme kontrolünün saati (23 Ekim 2026). Önce kontrol podcast'in 170. sn'sinden sonra hiç başlamıyordu; ölçümde
  podcast'ler 200-226 sn sürdü ve iki düzeltme turu alan podcast kontrolsüz geldi (öğrenci 5 soru yerine hiç soru
  görmedi). Şimdi kontrol 210. sn'ye kadar başlar; düzeltme turları kontrolden en çok 80 sn sonrasına ve podcast'in
  255. sn'sine kadar açılır. En geç başlayan kontrol: taslak + denetim ~50 sn → ~260. sn; rota tavanı 300 sn.
*/
export const CHECK_DEADLINE_MS = 210_000;
const CHECK_FIX_WINDOW_MS = 80_000;
const CHECK_FIX_CAP_MS = 255_000;

/** Test motoruna verilecek saat: düzeltme turu motorun kendi tavanında (`QUIZ_FIX_DEADLINE_MS`) biter. */
export function checkLoopClock(started: number, checkStarted: number): number {
  const fixUntil = Math.min(checkStarted + CHECK_FIX_WINDOW_MS, started + CHECK_FIX_CAP_MS);
  return Math.max(started, fixUntil - QUIZ_FIX_DEADLINE_MS);
}

/**
 * Dinleme kontrolü (20 Ekim 2026, kör kıyas: podcast'in sonunda soru yoktu). Denetlenmiş
 * senaryodan test motoru üç soru yazar; denetçi her soruyu önce kendisi çözer. Kaynak
 * senaryonun kendisi olduğu için kip "document" (belgesiz kipte test motoru kaynağı okumaz).
 * Aynı `ask`: hızlı işlem, kredi ayrılışı, kullanım kodu ve üretim yuvası podcast'inkiyle aynı;
 * ek ücret yok (PODCAST_GENERATE ikisini de karşılar). Kontrol hiçbir zaman podcast'i düşürmez:
 * yazılamazsa, iki sorunun altında kalırsa ya da süre geçtiyse boş döner, podcast kontrolsüz gelir.
 */
export async function podcastListeningCheck(
  ask: AskJson,
  episode: PodcastEpisode,
  input: Pick<TeacherPodcastInput, "topicLabel" | "prepTitle"> & { listeningCheck?: boolean },
  started: number,
): Promise<QuizQuestion[]> {
  if (input.listeningCheck !== true || !podcastCheckEligible(episode.length)) return [];
  if (Date.now() - started > CHECK_DEADLINE_MS) return [];
  const checkStarted = Date.now();
  // Podcast'in saatini verince 150 sn'yi geçen podcast'te düzeltme turu kalmıyor, 5 sorudan 2'si geliyordu.
  const loopClock = checkLoopClock(started, checkStarted);
  try {
    const loop = await teacherQuizLoop(
      ask,
      {
        topicLabel: input.topicLabel,
        prepTitle: input.prepTitle,
        pages: [],
        mode: "document",
        sourceBlock: podcastCheckSource(episode),
        brief: PODCAST_CHECK_BRIEF,
        count: PODCAST_CHECK_COUNT,
        focus: "practice",
        // Son soru çok cevaplı (23 Ekim 2026, ürün sahibinin kararı; konu testindeki gibi tek ve sonda).
        multi: true,
      },
      loopClock,
    );
    const questions = loop.questions.slice(0, PODCAST_CHECK_COUNT);
    console.info("teacher_podcast_check", {
      topic: input.topicLabel.slice(0, 80),
      kept: questions.length,
      rejected: loop.rejected.length,
      rounds: loop.rounds,
      ms: Date.now() - checkStarted,
    });
    return questions.length >= MIN_CHECK_QUESTIONS ? questions : [];
  } catch (error) {
    console.warn("teacher_podcast_check_failed", {
      topic: input.topicLabel.slice(0, 80),
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return [];
  }
}

export type TeacherPodcastOutcome =
  | { ok: true; episode: PodcastEpisode; check: QuizQuestion[]; calls: number; ms: number }
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
    /**
     * Dinleme kontrolü de yazılsın (20 Ekim 2026). Yalnız hazırlığın podcast'i (yol düğümü ve
     * hazırlığın podcast sayfası); stüdyo ve ders podcast'i v1'de kontrolsüz.
     */
    listeningCheck?: boolean;
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
    // Senarist yazar (23 Ekim 2026): 28. kör ölçümde gpt-6-sol ile öğrenci gözü Astra'yla başa baş (66 / 67), luna'yla
    // 6-7 puan geride. Hızlı işlem yalnız içerik modelinde: yazar modelinin hızlı kademesi denenmedi, istek düşmesin.
    const writer = role === "script" || role === "scriptfix";
    const callModel = writer ? env.OPENAI_PODCAST_WRITER_MODEL : model;
    const response = await openai.chat.completions.create({
      model: callModel,
      response_format: { type: "json_object" },
      ...(writer ? {} : tier),
      // 19 Ekim 2026: özet podcast 126 sn sürdü. Testteki gibi yazar ve düzeltme düşük düşünmeyle;
      // her satırı kaynağa karşı okuyan denetçi varsayılanda kalır.
      // Senarist taslağı orta düşünmeyle (23 Ekim 2026, yirmi beşinci ölçüm: öğrenci gözü 63,5 → 65; yoğun sıralar azaldı).
      ...(role === "verify" ? {} : { reasoning_effort: role === "script" ? ("medium" as const) : ("low" as const) }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    await recordUsage(service, {
      userId: input.userId,
      actionCode: free ? "CONTENT_PREFETCH" : input.actionCode,
      model: billedModel(callModel, response.service_tier),
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
      earIssues: loop.earIssues ?? null,
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
    // Kontrol, kredi kesinleşmeden önce aynı `ask` ile: kullanımı aynı ayrılışa yazılır.
    const check = await podcastListeningCheck(ask, loop.episode, input, started);
    if (reservation.reservationId) await commitCredits(service, reservation.reservationId);
    return { ok: true, episode: loop.episode, check, calls, ms: Date.now() - started };
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
