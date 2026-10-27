import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import {
  studentOptionCount,
  studentPedagogyBlock,
  withStudentProfile,
  type OptionCount,
} from "@/lib/learning/student-pedagogy";
import { commitCredits, recordUsage, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { balanceKerem, podcastBelowFloor, podcastTurnCount, podcastWordCount, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import { PODCAST_TTS_CONCURRENCY } from "@/lib/learning/podcast-formats";
import {
  closerToBand,
  DURATION_ROUND_TIMEOUT_MS,
  durationRoundFor,
  durationRoundInstruction,
  withDeadline,
} from "@/lib/learning/podcast-duration";
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
  insertPodcastChapters,
  parsePodcastAddition,
  parsePodcastIssues,
  parseTeacherPodcast,
  podcastCompletionSystem,
  podcastCompletionUserPrompt,
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
 * "script" / "scriptfix": iki sesli podcast'in senarist taslağı ve düzeltmesi (23 Ekim 2026): taslak orta, düzeltme
 * düşük düşünmeyle. Bütün çağrılar içerik modeliyle (luna; ürün sahibinin kararı: başka model kullanılmaz).
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
  /** Tabanın altına inen düzeltme sayısı: bu düzeltmeler reddedildi, önceki sürüm kaldı (28 Ekim 2026). */
  floorRejected?: number;
  /** Hiçbir aday tabanı tutmadı; en uzun geçerli aday yayınlandı (`short_shipped`). */
  shortShipped?: boolean;
};

/** Taban sorunu düzeltme turu açmaz: tamamlama turu yalnız eksik bölümleri ekler (`ensurePodcastDuration`). */
const SHORT_PROBLEM = /^Metin kısa/;
/** Tabanın altındaki düzeltme en çok bu oranda kısalabilir. */
const FIX_SHRINK_LIMIT = 0.85;
const blocking = (problems: string[]) => problems.filter((problem) => !SHORT_PROBLEM.test(problem));

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
  let floorRejected = 0;
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
    for (let round = 0; round < fixRounds && blocking(reviewed.problems).length; round += 1) {
      if (Date.now() - started > FIX_DEADLINE_MS) break;
      if (round > 0) {
        const cheap = salvagePodcast(episode, reviewed.problems);
        if (cheap && !cheap.belowFloor && cheap.removed <= SALVAGE_INSTEAD_OF_FIX_LINES) break;
      }
      const fixed = parseTeacherPodcast(
        await ask(
          podcastFixSystem(mode, input.length),
          podcastFixUserPrompt(episode, blocking(reviewed.problems), input),
          usesScriptWriter(input.length) ? "scriptfix" : "fix",
        ),
        input,
      );
      if (!fixed) break;
      if (JSON.stringify(fixed) === JSON.stringify(episode)) break;
      // Taban (28 Ekim 2026, Paket A): V6'da düzeltici Diyalog'u yarıya indirip 0:50'ye düşürdü. Tabanın altına inen
      // ve metnin %15'inden fazlasını atan düzeltme reddedilir, önceki sürüm kalır; kalan sorun kurtarmaya gider.
      // Yalnız uydurma cümleyi değiştiren dar düzeltme kabul edilir; eksik uzunluğu tamamlama turu kapatır.
      if (podcastBelowFloor(fixed) && podcastWordCount(fixed) < podcastWordCount(episode) * FIX_SHRINK_LIMIT) {
        floorRejected += 1;
        break;
      }
      episode = fixed;
      drafts += 1;
      reviewed = await review(episode);
    }
    return { episode, ...reviewed };
  };

  /** Kurtarma tabanın altına indirdiyse ikinci taslak denenir; bu sonuç son çare adayı olarak saklanır. */
  const shortCandidates: PodcastLoopResult[] = [];

  // Düzeltme turu da payı tutturmadıysa konuşmacı kodla dengelenir; iki sesli tür tek sesle yayınlanmaz.
  const finish = (outcome: { episode: PodcastEpisode; problems: string[]; verified: boolean }): PodcastLoopResult | null => {
    if (!blocking(outcome.problems).length) {
      return {
        episode: balanceKerem(outcome.episode),
        problems: [],
        drafts,
        salvaged: 0,
        unverified: !outcome.verified,
        earIssues: ear,
        floorRejected,
      };
    }
    const salvaged = salvagePodcast(outcome.episode, outcome.problems);
    if (!salvaged) return null;
    const result: PodcastLoopResult = {
      episode: balanceKerem(salvaged.episode),
      problems: [],
      drafts,
      salvaged: salvaged.removed,
      unverified: !outcome.verified,
      earIssues: ear,
      floorRejected,
    };
    if (salvaged.belowFloor) {
      shortCandidates.push(result);
      return null;
    }
    return result;
  };

  /** "Üretilemedi demez": hiçbir aday tabanı tutmadıysa en uzun geçerli aday gider ve kayda geçer. */
  const longestShort = (): PodcastLoopResult | null => {
    const best = [...shortCandidates].sort(
      (a, b) => podcastWordCount(b.episode!) - podcastWordCount(a.episode!),
    )[0];
    return best ? { ...best, drafts, floorRejected, shortShipped: true } : null;
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
      const fallback = longestShort();
      if (fallback) return fallback;
      return { episode: second.episode, problems: second.problems, drafts, salvaged: 0, unverified: false, earIssues: ear, floorRejected };
    }
  }
  const fallback = longestShort();
  if (fallback) return fallback;
  return { episode: first.episode, problems: first.problems, drafts, salvaged: 0, unverified: false, earIssues: ear, floorRejected };
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
  input: Pick<TeacherPodcastInput, "topicLabel" | "prepTitle"> & { listeningCheck?: boolean; optionCount?: OptionCount },
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
        ...(input.optionCount ? { optionCount: input.optionCount } : {}),
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
    /** Ücretsiz hesabın sayacı (`reserveCredits`); verilmezse işin varsayılanı. */
    freeMeter?: FreeMeter | null;
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
    : await reserveCredits(service, input.userId, input.actionCode, input.idempotencyKey, 1, { freeMeter: input.freeMeter });
  if (!reservation.ok) {
    return {
      ok: false,
      status: reservation.reason === "insufficient_credits" ? 402 : 409,
      error: refusalCode(reservation),
      reasons: [],
    };
  }
  const started = input.startedAt ?? Date.now();
  const model = contentModel();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  // Öğrenci bekliyor (önceden hazır podcast yok): hızlı işlem.
  // Hızlı işlem yalnız Plus/Sigma ve kurucuya (19 Ekim 2026, `fast-access.ts`).
  const profileLoad = studentPedagogyBlock(service, input.userId, "podcast");
  const optionCountLoad = studentOptionCount(service, input.userId, input.prepTitle);
  const tier = fastTier(!free && (await fastAllowedFor(service, input.userId)));
  const profile = await profileLoad;
  const ask: AskJson = async (system, user, role) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...tier,
      // 19 Ekim 2026: özet podcast 126 sn sürdü. Testteki gibi yazar ve düzeltme düşük düşünmeyle;
      // her satırı kaynağa karşı okuyan denetçi varsayılanda kalır.
      // Senarist taslağı orta düşünmeyle (23 Ekim 2026, yirmi beşinci ölçüm: öğrenci gözü 63,5 → 65; yoğun sıralar azaldı).
      ...(role === "verify" ? {} : { reasoning_effort: role === "script" ? ("medium" as const) : ("low" as const) }),
      messages: [
        { role: "system", content: withStudentProfile(system, profile) },
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
      ttsConcurrency: PODCAST_TTS_CONCURRENCY,
      drafts: loop.drafts,
      problems: loop.problems.length,
      salvaged: loop.salvaged,
      unverified: loop.unverified,
      earIssues: loop.earIssues ?? null,
      floorRejected: loop.floorRejected ?? 0,
      words: loop.episode ? podcastWordCount(loop.episode) : 0,
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
    // Tabanın altındaysa tamamlama, tavanın üstündeyse kısaltma turu. Düşerse eldeki bölüm kalır. İkinci ücret yok.
    const episode = await ensurePodcastDuration(ask, loop.episode, input, started);
    if (podcastBelowFloor(episode)) {
      console.warn("podcast_short_shipped", {
        topic: input.topicLabel.slice(0, 80),
        length: input.length,
        words: podcastWordCount(episode),
        turns: podcastTurnCount(episode),
        salvageFloor: loop.shortShipped === true,
      });
    }
    // Kontrol, kredi kesinleşmeden önce aynı `ask` ile: kullanımı aynı ayrılışa yazılır. Şık sayısı öğrencinin sınavı.
    const check = await podcastListeningCheck(ask, episode, { ...input, optionCount: await optionCountLoad }, started);
    if (reservation.reservationId) await commitCredits(service, reservation.reservationId);
    return { ok: true, episode, check, calls, ms: Date.now() - started };
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

/** Tamamlama ve kısaltma turu bu süreden sonra başlamaz; rota tavanı 300 sn, ses ve kontrol de sığmalı. */
const DURATION_START_DEADLINE_MS = 170_000;
const DURATION_END_DEADLINE_MS = 240_000;
/** Tamamlama turunun ek bölümlerini denetleyen çağrının üst sınırı. */
const COMPLETION_REVIEW_TIMEOUT_MS = 40_000;

function roundBudget(started: number, cap: number): number {
  return Math.max(0, Math.min(cap, started + DURATION_END_DEADLINE_MS - Date.now()));
}

/**
 * Tabanın altındaki podcast tamamlanır (yalnız eksik bölümler yazılır, son tekrar bölümünden önce girer, aynı denetçiden
 * geçer), tavanı aşan kısaltılır. 28 Ekim 2026 (Paket A): eski tur bütün JSON'u yeniden yazdırıyor ve 22 sn'de zaman
 * aşımına düşüyordu; kısa podcast olduğu gibi gidiyordu.
 */
async function ensurePodcastDuration(
  ask: AskJson,
  episode: PodcastEpisode,
  input: TeacherPodcastInput,
  started: number,
): Promise<PodcastEpisode> {
  const words = podcastWordCount(episode);
  const short = podcastBelowFloor(episode);
  const round = short ? "expand" : durationRoundFor({ length: input.length, words }) === "shorten" ? "shorten" : null;
  const base = {
    topic: input.topicLabel.slice(0, 80),
    length: input.length,
    words,
    turns: podcastTurnCount(episode),
    round: round ?? "none",
  };
  if (!round) {
    console.info("podcast_duration", { ...base, accepted: false, verdict: "ok" });
    return episode;
  }
  if (Date.now() - started > DURATION_START_DEADLINE_MS) {
    console.info("podcast_duration", { ...base, accepted: false, verdict: "late" });
    return episode;
  }
  if (round === "expand") {
    const completed = await completePodcast(ask, episode, input, started);
    console.info("podcast_duration", {
      ...base,
      nextWords: podcastWordCount(completed.episode),
      accepted: completed.episode !== episode,
      verdict: completed.verdict,
    });
    return completed.episode;
  }
  try {
    const raw = await withDeadline(
      ask(
        "SÜRE TURU. Bu bir denetim değil. Konuşmayı istenen kelime aralığına getir ve aynı JSON biçiminde bütün bölümü döndür. Sayı, tarih, madde numarası ve sıralı adım yalnız kaynakta geçiyorsa kalır.",
        `${durationRoundInstruction(round, input.length)}\n\nBaşlık: ${input.topicLabel}\n\n${JSON.stringify(episode)}`,
        "fix",
      ),
      roundBudget(started, DURATION_ROUND_TIMEOUT_MS),
    );
    const next = raw ? parseTeacherPodcast(raw, { length: input.length, topicLabel: input.topicLabel }) : null;
    const nextWords = next ? podcastWordCount(next) : words;
    const accepted = Boolean(next && !podcastBelowFloor(next) && closerToBand(words, nextWords, input.length));
    console.info("podcast_duration", { ...base, nextWords, accepted, verdict: "long" });
    return accepted && next ? balanceKerem(next) : episode;
  } catch {
    console.info("podcast_duration", { ...base, accepted: false, verdict: "long" });
    return episode;
  }
}

/**
 * Tamamlama turu: model yalnız ek bölümleri yazar, kod onları son tekrar bölümünden önce yerleştirir; denetçi birleşik
 * podcast'i okur, yalnız yeni bölümlerdeki sorunlar sayılır (eskiler zaten denetimden geçti). Denetçiye ulaşılamazsa
 * ya da yeni bölümde yere bağlanamayan doğruluk sorunu varsa ek atılır: denetlenmemiş satır öğrenciye gitmez.
 */
export async function completePodcast(
  ask: AskJson,
  episode: PodcastEpisode,
  input: TeacherPodcastInput,
  started: number,
): Promise<{ episode: PodcastEpisode; verdict: string }> {
  const mode = input.mode ?? "document";
  const raw = await withDeadline(
    ask(podcastCompletionSystem(mode, input.length), podcastCompletionUserPrompt(episode, input), "fix"),
    roundBudget(started, DURATION_ROUND_TIMEOUT_MS),
  );
  const addition = raw ? parsePodcastAddition(raw, input) : null;
  if (!addition) return { episode, verdict: "no_addition" };
  const merged = insertPodcastChapters(episode, addition);
  const added = merged.chapters.length - episode.chapters.length;
  if (!added) return { episode, verdict: "no_addition" };
  const firstNew = Math.max(0, episode.chapters.length > 1 ? episode.chapters.length - 1 : episode.chapters.length);
  const isNew = (index: number) => index >= firstNew && index < firstNew + added;

  const verdict = await withDeadline(
    ask(podcastVerifySystem(mode), podcastVerifyUserPrompt(merged, input), "verify"),
    roundBudget(started, COMPLETION_REVIEW_TIMEOUT_MS),
  );
  if (verdict === null) return { episode, verdict: "unverified" };
  const high = parsePodcastIssues(verdict).filter((issue) => issue.severity === "high");
  const located = (where: string) => /chapters\[(\d+)\]/.exec(where);
  const unplaced = high.filter((issue) => !located(issue.where) && !["G", "H", "I", "J"].includes(issue.rule ?? ""));
  if (unplaced.length) return { episode, verdict: "rejected" };
  const problems = high
    .filter((issue) => {
      const match = located(issue.where);
      return match ? isNew(Number(match[1])) : false;
    })
    .map(podcastIssueLine);
  const salvaged = problems.length ? salvagePodcast(merged, problems) : { episode: merged, removed: 0 };
  if (!salvaged) return { episode, verdict: "rejected" };
  const next = balanceKerem(salvaged.episode);
  if (podcastWordCount(next) <= podcastWordCount(episode)) return { episode, verdict: "no_gain" };
  return { episode: next, verdict: podcastBelowFloor(next) ? "still_short" : "completed" };
}

/** Üretim yuvasıyla (19 Ekim 2026, Faz 3.2); bkz. `withGenerationSlot`. */
export async function runTeacherPodcast(...args: Parameters<typeof runTeacherPodcastInner>): Promise<TeacherPodcastOutcome> {
  return withGenerationSlot(
    args[1].charge === false ? "prefetch" : "student",
    () => runTeacherPodcastInner(...args),
    () => ({ ok: false, status: 503, error: "generation_busy", reasons: [] }),
  );
}
