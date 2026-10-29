import { DUEL_SECONDS, questionPoints, scoreDuel, type DuelAnswer, type DuelQuestion } from "@/lib/learning/duel";

/**
 * Bot rakip (29 Ekim 2026). Düello yalnız eşzamansızdı: arkadaş gelene kadar öğrenci tek başına
 * oynuyordu. Bot aynı 7 soruyu aynı kurallarla "oynar": tur sunucuda, doğru cevaplar bilinerek
 * üretilir; istemciye yalnız soru başına süre ve doğru/yanlış gider (hangi şık olduğu değil).
 * Bot sıralama tablosuna yazılmaz — tablo insanların. Üç zorluk, her biri doğruluk ve hız dağılımı.
 */
export type BotLevel = "arkadas" | "derece" | "sampiyon";

export const BOT_LEVELS: Record<BotLevel, { label: string; name: string; accuracy: number; msMin: number; msMax: number }> = {
  arkadas: { label: "Sınıf arkadaşı", name: "🤖 Sınıf Arkadaşı", accuracy: 0.6, msMin: 6_000, msMax: 15_000 },
  derece: { label: "Derece öğrencisi", name: "🤖 Derece Öğrencisi", accuracy: 0.8, msMin: 4_000, msMax: 11_000 },
  sampiyon: { label: "Şampiyon", name: "🤖 Şampiyon", accuracy: 0.93, msMin: 2_500, msMax: 7_500 },
};

export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS) as BotLevel[];

export function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === "string" && value in BOT_LEVELS;
}

/** Tohumdan deterministik rastgele (mulberry32); aynı tohum aynı botu verir. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BotStep = { ms: number; correct: boolean; points: number };

export type BotRun = {
  level: BotLevel;
  name: string;
  answers: DuelAnswer[];
  steps: BotStep[];
  correct: number;
  score: number;
  total: number;
};

/** Botun turu. Doğruluk olasılıkla, süre düzeyin aralığından; yanlışta başka bir şık. */
export function botRun(questions: DuelQuestion[], level: BotLevel, seed: string): BotRun {
  const profile = BOT_LEVELS[level];
  const random = seededRandom(`${seed}:${level}`);
  const answers: DuelAnswer[] = questions.map((question) => {
    const right = random() < profile.accuracy;
    const ms = Math.min(DUEL_SECONDS * 1000 - 500, Math.round(profile.msMin + random() * (profile.msMax - profile.msMin)));
    if (right || question.options.length < 2) return { choice: question.answer, ms };
    const wrongPool = question.options.map((_, index) => index).filter((index) => index !== question.answer);
    return { choice: wrongPool[Math.floor(random() * wrongPool.length)] ?? question.answer, ms };
  });
  const scored = scoreDuel(questions, answers);
  const steps = answers.map((answer, index) => ({
    ms: answer.ms,
    correct: scored.perQuestion[index]!.points > 0,
    points: scored.perQuestion[index]!.points,
  }));
  return { level, name: profile.name, answers, steps, correct: scored.correct, score: scored.score, total: questions.length };
}

/** İstemciye giden kısım: cevap yok, yalnız süre ve doğru/yanlış. */
export function botTimeline(run: BotRun): { level: BotLevel; name: string; steps: BotStep[]; correct: number; score: number; total: number } {
  return { level: run.level, name: run.name, steps: run.steps, correct: run.correct, score: run.score, total: run.total };
}

/** Botun o ana kadarki puanı: öğrencinin bulunduğu soruya kadar bitenler + o soruda süresi geçtiyse o da. */
export function botScoreUntil(steps: readonly BotStep[], questionIndex: number, elapsedMs: number): number {
  let score = 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (i < questionIndex || (i === questionIndex && steps[i]!.ms <= elapsedMs)) score += steps[i]!.points;
  }
  return score;
}

/** Peş peşe doğru sayısı (kombo), aynı görünürlük kuralıyla. */
export function botComboUntil(steps: readonly BotStep[], questionIndex: number, elapsedMs: number): number {
  let combo = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const visible = i < questionIndex || (i === questionIndex && steps[i]!.ms <= elapsedMs);
    if (!visible) break;
    combo = steps[i]!.correct ? combo + 1 : 0;
  }
  return combo;
}

export type HeadToHead = {
  winner: "student" | "bot" | "tie";
  headline: string;
  rows: { question: number; student: "right" | "wrong" | "none"; bot: "right" | "wrong"; studentMs: number | null; botMs: number }[];
  studentAvgMs: number | null;
  botAvgMs: number;
};

/** Sonuç ekranındaki kafa kafaya tablo. Öğrencinin puanı sunucudan gelir; botunki tur kaydından. */
export function headToHead(input: {
  studentScore: number;
  studentAnswers: readonly DuelAnswer[];
  correctIndexes: readonly number[];
  bot: { score: number; steps: readonly BotStep[] };
}): HeadToHead {
  const rows = input.correctIndexes.map((answer, index) => {
    const mine = input.studentAnswers[index];
    const student: "right" | "wrong" | "none" = mine?.choice == null ? "none" : mine.choice === answer ? "right" : "wrong";
    const step = input.bot.steps[index];
    return { question: index + 1, student, bot: step?.correct ? ("right" as const) : ("wrong" as const), studentMs: mine?.choice == null ? null : mine.ms, botMs: step?.ms ?? 0 };
  });
  const studentTimes = rows.map((row) => row.studentMs).filter((ms): ms is number => ms != null);
  const studentAvgMs = studentTimes.length ? Math.round(studentTimes.reduce((sum, ms) => sum + ms, 0) / studentTimes.length) : null;
  const botAvgMs = input.bot.steps.length ? Math.round(input.bot.steps.reduce((sum, step) => sum + step.ms, 0) / input.bot.steps.length) : 0;
  const winner = input.studentScore > input.bot.score ? "student" : input.studentScore < input.bot.score ? "bot" : "tie";
  const headline = winner === "student" ? "Kazandın! 🏆" : winner === "bot" ? "Bu sefer bot önde" : "Berabere";
  return { winner, headline, rows, studentAvgMs, botAvgMs };
}

/** Puan kuralı oyunda da aynı: istemci botun adım puanını buradan doğrular (gizli bir şey yok). */
export function expectedStepPoints(correct: boolean, ms: number, isLast: boolean): number {
  return questionPoints(correct, ms, isLast);
}
