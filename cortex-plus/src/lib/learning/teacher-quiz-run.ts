import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { studentPedagogyBlock, withStudentProfile } from "@/lib/learning/student-pedagogy";
import { commitCredits, recordUsage, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import type { FreeMeter } from "@/lib/billing/free-meters";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel, fastTier } from "@/lib/learning/teacher-tier";
import { dropNearDuplicates } from "@/lib/learning/item-dedup";
import { runTopicTestShards } from "@/lib/learning/quiz-shards";
import { playableQuestions, type QuizStageMs } from "@/lib/learning/quiz-delivery";
import { repairBudget } from "@/lib/learning/repair-budget";
import {
  FORCE_FIX_CODES,
  parseTeacherQuiz,
  quizSetIssues,
  quizStructureIssues,
  quizSystem,
  quizUserPrompt,
  shuffleOptions,
  SOFT_CODES,
  tableLookupLike,
  topicTestPoints,
  type QuizIssue,
  type TeacherQuizInput,
} from "@/lib/learning/teacher-quiz";

/** `role`: taslak ve düzeltme düşük düşünmeyle, denetim varsayılanla (19 Ekim 2026). */
export type AskJson = (system: string, user: string, role?: "draft" | "verify" | "fix") => Promise<unknown | null>;

/** Taslakta öğrenciye gidecek sayının üstüne yedek soru: elenen yerine geçer. */
const SPARE = 2;
/** Konu testinde pedagojik kurallar da eler (20 Ekim 2026): bir yedek fazla, düzeltme turu daha seyrek. */
const SPARE_TOPIC_TEST = 3;

/**
 * Yedek sayısı istenen sayıyla orantılı (24 Ekim 2026 lansman testi): Araçlar'da belgeden 10 soru istendi,
 * 11 taslaktan 2'si elendi, öğrenciye 9 soru gitti (en az sayı 8 olduğu için ikinci geçiş açılmadı). Elenme payı
 * ~%20; dörtte bir yedekle istenen sayı çoğu zaman ilk geçişte dolar.
 */
export function quizSpareCount(count: number, topicTest: boolean): number {
  const proportional = Math.ceil(count / 4);
  return topicTest ? Math.max(SPARE_TOPIC_TEST, proportional + 1) : Math.max(SPARE, proportional);
}
/** Dinleme kontrolü saatini buna göre kurar. Soru düzeltme turu yok. */
export const QUIZ_FIX_DEADLINE_MS = 200_000;

export function minimumQuestions(count: number): number {
  return Math.max(3, count - 2);
}

/** İkinci taslak ancak bu süreden önce başlar (rota tavanı 300 sn). */
const SECOND_PASS_DEADLINE_MS = 150_000;
/** Eski kısa yayın eşiği. Yayımlama bunu kullanmaz; söz verilen sayı tutulur. */
export const MIN_DELIVERABLE_QUESTIONS = 2;

type Reviewed = { question: QuizQuestion; problems: string[] };

/** soft: pedagojik (konu testinde H-K ve kodun kapsam denetimi); forceFix: kapsam eksiği, düzeltme turu açar. */
type Problem = { text: string; soft: boolean; forceFix: boolean };
/** index: taslaktaki yeri. Düzeltilen soru aynı yere döner (20 Ekim 2026'ya kadar sona ekleniyordu, kesilebiliyordu). */
type Slot = { index: number; question: QuizQuestion };
type Pending = Slot & { problems: Problem[] };

export type TeacherQuizLoopResult = {
  questions: QuizQuestion[];
  rejected: Reviewed[];
  rounds: number;
  /** Konu testi: düzelmeyen ama yalnız pedagojik sorunu olan, sayıyı tamamlamak için geri konan soru. */
  softKept: number;
  /** Bu soruların ilk sorunu (yönetim "Ders hataları"). */
  salvaged: string[];
  /** Kapsam eksiği (J) yüzünden düzeltme turu açıldı mı. */
  forced: boolean;
  /** Denetçi ve kod sorunlarının harf sayımı (yalnız konu testi). */
  codes: Record<string, number>;
  /** Taslak, ilk denetim ve onarım süreleri. Yönetim günlüğüne yazılır. */
  stages: QuizStageMs;
};

export type TeacherQuizLoopHooks = {
  /** Denetimden geçmiş sorular. Çağıran pencereyi keser; turlar sürer. */
  onPlayable?: (questions: QuizQuestion[]) => void;
};

const byIndex = (left: Slot, right: Slot) => left.index - right.index;
const allSoft = (row: Pending) => row.problems.every((problem) => problem.soft);

/**
 * Taslak → yapı + bağımsız çözüm denetimi → sorunlu sorular modelin
 * düzeltmesine. Krediye dokunmaz; `runTeacherQuiz` krediyi sarar, yerel
 * ölçüm betiği doğrudan çağırır.
 *
 * Konu testinde (`scope: "topic_test"`, 20 Ekim 2026) denetim bütün teste de bakar: kök kalıbı,
 * madde kapsamı, dersle tekrar (kod + denetçinin H-K'si). Bu sorunlar yumuşak: soru düzeltilir ya
 * da yedekle değişir; pedagojik sorun için en çok bir tur; düzelmeyen soru sayıyı tamamlamak için geri
 * konur ("İçerik üretilemedi demez": öğrenciye giden soru sayısı bugünkünden düşmez). Doğruluk ve
 * yapı sorunu olan soru hiçbir zaman geri konmaz.
 */
export async function teacherQuizLoop(
  ask: AskJson,
  input: TeacherQuizInput,
  started = Date.now(),
  hooks?: TeacherQuizLoopHooks,
): Promise<TeacherQuizLoopResult> {
  const mode = input.mode ?? "document";
  const scope = input.scope;
  const scoped = scope === "topic_test";
  const count = input.count;
  const multi = Boolean(input.multi);
  // İkinci geçişte birinci geçişin soruları testin başı sayılır.
  const prior = scoped ? (input.avoid ?? []) : [];
  const pointsAvailable = scoped ? topicTestPoints(input).length : 0;
  const codes: Record<string, number> = {};
  const slots: (QuizQuestion | null)[] = [];
  const accepted = (): Slot[] => slots.flatMap((question, index) => (question ? [{ index, question }] : []));

  const fromIssue = (issue: QuizIssue): Problem => {
    const soft = scoped && Boolean(issue.code && SOFT_CODES.has(issue.code));
    if (scoped && issue.code) codes[issue.code] = (codes[issue.code] ?? 0) + 1;
    return {
      text: `${scoped && issue.code ? `[${issue.code}] ` : ""}${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`,
      soft,
      forceFix: soft && FORCE_FIX_CODES.has(issue.code!),
    };
  };

  const review = async (candidates: Slot[]): Promise<Pending[]> => {
    const kept = accepted();
    const structural = candidates.map((slot) => quizStructureIssues(slot.question, { multi: input.multi }));
    // Tek geçiş (26 Ekim 2026): ikinci denetçi ve kör çözücü yok. Kapı deterministik.
    const factual: QuizIssue[] = [];
    const rows: Pending[] = candidates.map((slot, position) => ({
      ...slot,
      problems: [
        ...structural[position].map((text) => ({ text, soft: false, forceFix: false })),
        ...factual.filter((issue) => issue.question === position && issue.severity === "high").map(fromIssue),
      ],
    }));
    if (scoped) {
      // Bütün test: önceki geçiş + kabul edilenler + engellenmeyen adaylar, testteki sırayla.
      const merged: { question: QuizQuestion; row: Pending | null }[] = [
        ...prior.map((question) => ({ question, row: null })),
        ...[
          ...kept.map((slot) => ({ ...slot, row: null })),
          ...rows.filter(allSoft).map((row) => ({ index: row.index, question: row.question, row })),
        ]
          .sort(byIndex)
          .map(({ question, row }) => ({ question, row })),
      ];
      for (const issue of quizSetIssues(
        merged.map((item) => item.question),
        { pointsAvailable, lessonChecks: input.lesson?.checks },
      )) {
        const row = merged[issue.index]?.row;
        if (!row) continue;
        codes[`set_${issue.code}`] = (codes[`set_${issue.code}`] ?? 0) + 1;
        row.problems.push({ text: `[${issue.code}] ${issue.problem}`, soft: true, forceFix: issue.forceFix });
      }
    }
    return rows;
  };

  const emitPlayable = () => {
    const kept = accepted().map((slot) => slot.question);
    if (kept.length) hooks?.onPlayable?.(kept);
  };

  const draftCount = count + quizSpareCount(count, scoped);
  const draftStarted = Date.now();
  let draft = parseTeacherQuiz(
    await ask(quizSystem(mode, input.focus, multi, scope, input.rephrase), quizUserPrompt(input, draftCount), "draft"),
  );
  if (!draft) {
    draft = parseTeacherQuiz(
      await ask(quizSystem(mode, input.focus, multi, scope, input.rephrase), quizUserPrompt(input, draftCount), "draft"),
    );
  }
  const draftMs = Date.now() - draftStarted;
  if (!draft) {
    return { questions: [], rejected: [], rounds: 0, softKept: 0, salvaged: [], forced: false, codes, stages: { draftMs, reviewMs: 0, repairMs: 0 } };
  }

  slots.push(...draft.map(() => null));
  let bad: Pending[] = [];
  const settle = (rows: Pending[]) => {
    for (const row of rows) {
      if (row.problems.length) bad.push(row);
      else slots[row.index] = row.question;
    }
    bad.sort(byIndex);
  };
  const reviewStarted = Date.now();
  settle(await review(draft.map((question, index) => ({ index, question }))));
  const reviewMs = Date.now() - reviewStarted;
  emitPlayable();

  // Konu testinde "yeterli" öğrenciye gidecek sayıdır (tek çok cevaplı soru sayılır); öbür yüzeylerde bugünkü gibi.
  const have = () => {
    const kept = slots.filter((question): question is QuizQuestion => question !== null);
    return scoped ? withOneMultiLast(kept, count).length : kept.length;
  };
  const rounds = 0;
  const forced = false;
  const repairStarted = Date.now();
  // Tek geçiş: yapı kapısı bozuk satırı tutmaz. Eksik sayı dışarıda tek tamamlama çağrısıyla dolar.

  // Yumuşak kurtarma: sayı eksikse yalnız pedagojik sorunu kalan sorular, testteki sırayla geri konur.
  let softKept = 0;
  const salvaged: string[] = [];
  if (scoped) {
    for (const row of [...bad]) {
      if (have() >= count) break;
      if (!allSoft(row)) continue;
      const before = have();
      slots[row.index] = row.question;
      // İkinci çok cevaplı soru sayıyı artırmaz, öbürünün yerine geçmesin.
      if (have() <= before) {
        slots[row.index] = null;
        continue;
      }
      softKept += 1;
      salvaged.push(row.problems[0]?.text.slice(0, 200) ?? "sorun");
      bad = bad.filter((item) => item !== row);
    }
  }
  const repairMs = Date.now() - repairStarted;
  emitPlayable();
  const questions = withOneMultiLast(
    slots.filter((question): question is QuizQuestion => question !== null),
    count,
  ).map(shuffleOptions);
  return {
    questions,
    rejected: bad.map((row) => ({ question: row.question, problems: row.problems.map((problem) => problem.text) })),
    rounds,
    softKept,
    salvaged,
    forced,
    codes,
    stages: { draftMs, reviewMs, repairMs },
  };
}

/**
 * Testte en çok bir çok cevaplı soru ve o sonda (Astra'da 7 sorudan sonuncusu). Yedekler
 * kesilirken çok cevaplı soru düşmesin; fazlası atılır.
 */
export function withOneMultiLast(questions: QuizQuestion[], count: number): QuizQuestion[] {
  const multi = questions.find((question) => question.multi);
  const single = questions.filter((question) => !question.multi);
  if (!multi) return single.slice(0, count);
  return [...single.slice(0, Math.max(0, count - 1)), multi];
}

function shardBrief(brief: string | undefined, index: number, shards: number): string {
  const line = `Bu üretim ${index + 1}/${shards}. Aynı konunun ayrı bir noktasını sor.`;
  return brief ? `${brief}\n${line}` : line;
}

/** Öğrenci beklerken konu testi parçaları aynı anda yazılır. Duvar saati bir parçanın süresi. */
async function runShardedTopicQuiz(
  ask: AskJson,
  input: TeacherQuizInput,
  started: number,
  hooks?: TeacherQuizLoopHooks,
): Promise<TeacherQuizLoopResult> {
  const parts: TeacherQuizLoopResult[] = [];
  const sharded = await runTopicTestShards({
    count: input.count,
    runShard: async (count, index, shards) => {
      const loop = await teacherQuizLoop(
        ask,
        {
          ...input,
          count,
          multi: Boolean(input.multi) && index === shards - 1,
          brief: shardBrief(input.brief, index, shards),
        },
        started,
        hooks,
      );
      parts[index] = loop;
      return loop.questions;
    },
  });
  const codes: Record<string, number> = {};
  let softKept = 0;
  let forced = false;
  let rounds = 0;
  const rejected: Reviewed[] = [];
  const salvaged: string[] = [];
  const stages = { draftMs: 0, reviewMs: 0, repairMs: 0 };
  for (const part of parts) {
    if (!part) continue;
    softKept += part.softKept;
    forced = forced || part.forced;
    rounds = Math.max(rounds, part.rounds);
    rejected.push(...part.rejected);
    salvaged.push(...part.salvaged);
    stages.draftMs = Math.max(stages.draftMs, part.stages.draftMs);
    stages.reviewMs = Math.max(stages.reviewMs, part.stages.reviewMs);
    stages.repairMs = Math.max(stages.repairMs, part.stages.repairMs);
    for (const [code, count] of Object.entries(part.codes)) codes[code] = (codes[code] ?? 0) + count;
  }
  return {
    questions: withOneMultiLast(sharded.questions, input.count),
    rejected,
    rounds,
    softKept,
    salvaged,
    forced,
    codes,
    stages,
  };
}

export type TeacherQuizOutcome =
  | {
      ok: true;
      questions: QuizQuestion[];
      calls: number;
      ms: number;
      reservationId?: string;
      /** Konu testi: pedagojik sorunu düzelmeden geri konan soru sayısı ve sorunları (20 Ekim 2026). */
      softKept?: number;
      salvaged?: string[];
      stages: QuizStageMs;
    }
  | { ok: false; status: number; error: string; reasons: string[] };

/** Kredi bir kez ayrılır; yeterli soru çıkarsa kesinleşir, çıkmazsa iade. */
async function runTeacherQuizInner(
  service: SupabaseClient,
  input: TeacherQuizInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    /** Ücretsiz hesabın sayacı (`reserveCredits`); verilmezse işin varsayılanı. */
    freeMeter?: FreeMeter | null;
    startedAt?: number;
    /**
     * Ücreti çağıran kessin (düello: soru kümesi kullanılamazsa iade).
     * true iken dönen reservationId bekleyen durumdadır.
     */
    deferCommit?: boolean;
    /**
     * Krediyi çağıran zaten ayırdı (yazılı deneme: konu başına bir üretim, deneme
     * başına tek ücret). Verilirse burada ayırma, kesinleştirme ve iade yok; kullanım
     * bu ayrılışa yazılır. Aynı anahtarla her konu kendi ayırsaydı yalnız ilki geçerdi.
     */
    heldReservationId?: string;
    /** Eski çağıranlar geçirir. Yayın eşiği söz verilen `count`'tur. */
    minimum?: number;
    /** Sessiz yedek. Yoksa içerik modeli. */
    model?: string;
    /** false: önceden yazım (18 Ekim 2026); kredi ayrılmaz, öğrenci açınca düşer. */
    charge?: boolean;
    /** Denetimden geçmiş ilk pencere. Turlar sürer; çağıran keser. */
    onPlayable?: (questions: QuizQuestion[]) => void;
  },
): Promise<TeacherQuizOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length && !input.sourceBlock?.trim() && input.mode !== "topic") {
    return { ok: false, status: 503, error: "source_unavailable", reasons: ["no_pages"] };
  }
  const held = input.heldReservationId;
  const free = input.charge === false;
  const reservation = held
    ? ({ ok: true, reservationId: held } as const)
    : free
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
  const refund = () =>
    held || !reservation.reservationId ? Promise.resolve() : refundCredits(service, reservation.reservationId).catch(() => undefined);
  const started = input.startedAt ?? Date.now();
  const model = input.model ?? contentModel();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  // Öğrenci bekliyor: hızlı işlem. Önceden yazım ve tek ücretli çok parçalı iş (yazılı deneme) normal.
  // Hızlı işlem yalnız Plus/Sigma ve kurucuya (19 Ekim 2026, `fast-access.ts`).
  const profileLoad = studentPedagogyBlock(service, input.userId, "quiz");
  const tier = fastTier(!free && !held && (await fastAllowedFor(service, input.userId)));
  const profile = await profileLoad;
  const ask: AskJson = async (system, user, role) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...tier,
      // 19 Ekim 2026: soğuk test 30 sn sürüyordu (Astra ~15). Ders yazarındaki gibi taslak ve
      // düzeltme düşük düşünmeyle; her soruyu kendisi çözen denetçi varsayılanda kalır.
      ...(role === "verify" ? {} : { reasoning_effort: "low" as const }),
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
    const previousStems = input.previousStems ?? [];
    const shown = new Map<string, QuizQuestion>();
    let opened = false;
    const publish = input.onPlayable
      ? (raw: QuizQuestion[]) => {
          for (const question of raw) {
            const key = question.text.trim();
            if (!key || shown.has(key)) continue;
            shown.set(key, shuffleOptions(question));
          }
          const all = dropNearDuplicates([...shown.values()], (question) => question.text, previousStems);
          const preview = playableQuestions(all, previousStems);
          if (!preview.length && !all.length) return;
          const window = all.slice(0, opened ? input.count : 1);
          if (!window.length) return;
          opened = true;
          input.onPlayable!(window);
        }
      : undefined;
    const hooks = publish ? { onPlayable: publish } : undefined;
    const loop =
      input.urgent && input.scope === "topic_test" && input.count > 1
        ? await runShardedTopicQuiz(ask, input, started, hooks)
        : await teacherQuizLoop(ask, input, started, hooks);
    let stages: QuizStageMs = { ...loop.stages };
    let questions = dropNearDuplicates(loop.questions, (question) => question.text, previousStems);
    const repeated = loop.questions.length - questions.length;
    let passes = 1;
    let softKept = loop.softKept;
    const salvaged = [...loop.salvaged];
    const secondPassDeadline = input.urgent ? repairBudget(true).secondPassDeadlineMs : SECOND_PASS_DEADLINE_MS;
    // Söz verilen sayı dolana kadar yeni taslak eklenir. Kısa liste yayımlanmaz.
    while (questions.length < input.count && passes < 2 && Date.now() - started < secondPassDeadline) {
      passes += 1;
      const again = await teacherQuizLoop(
        ask,
        {
          ...input,
          count: Math.max(1, input.count - questions.length),
          // Konu testi: sonraki taslak ilk geçişin sorularını görür, kalıplarını ve maddelerini tekrar etmez (20 Ekim 2026).
          ...(input.scope === "topic_test" ? { avoid: questions } : {}),
          previousStems: [...previousStems, ...questions.map((question) => question.text)],
        },
        started,
        hooks,
      );
      stages = {
        draftMs: stages.draftMs + again.stages.draftMs,
        reviewMs: stages.reviewMs + again.stages.reviewMs,
        repairMs: stages.repairMs + again.stages.repairMs,
      };
      const fresh = dropNearDuplicates(again.questions, (question) => question.text, [
        ...previousStems,
        ...questions.map((question) => question.text),
      ]);
      questions = withOneMultiLast([...questions, ...fresh], input.count);
      softKept += again.softKept;
      salvaged.push(...again.salvaged);
      for (const [code, n] of Object.entries(again.codes)) loop.codes[code] = (loop.codes[code] ?? 0) + n;
    }
    console.info("teacher_quiz", {
      topic: input.topicLabel.slice(0, 80),
      mode: input.mode ?? "document",
      kept: questions.length,
      rejected: loop.rejected.length,
      rounds: loop.rounds,
      passes,
      repeated,
      urgent: Boolean(input.urgent),
      calls,
      ms: Date.now() - started,
      draftMs: stages.draftMs,
      reviewMs: stages.reviewMs,
      repairMs: stages.repairMs,
      // Konu testi kuralları (20 Ekim 2026): etkisi ölçülmeden kural değişmesin.
      ...(input.scope === "topic_test"
        ? {
            scope: input.scope,
            softKept,
            forced: loop.forced,
            codes: loop.codes,
            lessonAware: Boolean(input.lesson),
            lookupLike: tableLookupLike(questions, input.pages),
          }
        : {}),
    });
    if (questions.length < input.count) {
      await refund();
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: loop.rejected.slice(0, 4).map((item) => item.problems[0]?.slice(0, 200) ?? "sorun"),
      };
    }
    const kept = softKept ? { softKept, salvaged: salvaged.slice(0, 6) } : {};
    if (input.deferCommit || held || !reservation.reservationId) {
      return { ok: true, questions, calls, ms: Date.now() - started, reservationId: reservation.reservationId ?? undefined, stages, ...kept };
    }
    await commitCredits(service, reservation.reservationId);
    return { ok: true, questions, calls, ms: Date.now() - started, reservationId: reservation.reservationId, stages, ...kept };
  } catch (error) {
    await refund();
    console.error("teacher_quiz_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}

/** Üretim yuvasıyla (19 Ekim 2026, Faz 3.2); bkz. `withGenerationSlot`. */
export async function runTeacherQuiz(...args: Parameters<typeof runTeacherQuizInner>): Promise<TeacherQuizOutcome> {
  return withGenerationSlot(
    args[1].charge === false ? "prefetch" : "student",
    () => runTeacherQuizInner(...args),
    () => ({ ok: false, status: 503, error: "generation_busy", reasons: [] }),
  );
}
