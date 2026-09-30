/**
 * Düello — Astra'daki "sınıf arkadaşlarınla düello yap" (30 Eylül 2026).
 *
 * Kurallar Astra'nın kendi ekranından: herkes aynı 7 soruyu 20'şer saniyede
 * yanıtlar; doğru cevap 10 puan, hıza göre en fazla 5 ek puan; son turda
 * puanlar ikiye katlanır. Puanı sunucu hesaplar — istemci yalnızca seçimi ve
 * süreyi yollar, doğru cevabı hiç görmez.
 */

export const DUEL_QUESTIONS = 7;
export const DUEL_SECONDS = 20;
const BASE_POINTS = 10;
const MAX_SPEED_BONUS = 5;

export type DuelQuestion = { text: string; options: string[]; answer: number };
export type DuelPublicQuestion = { text: string; options: string[] };
export type DuelAnswer = { choice: number | null; ms: number };

/** Kurallar gerçek soru sayısıyla yazılır; doğrulamadan 7'den az soru geçebilir. */
export function duelRules(count: number = DUEL_QUESTIONS): string[] {
  return [
    `Her biri için ${DUEL_SECONDS} saniyede ${count} soru yanıtla.`,
    `Her doğru cevap ${BASE_POINTS} puan, hızına göre en fazla ${MAX_SPEED_BONUS} ek puan. Son turda puanlar ikiye katlanır.`,
    "Bağlantıyı bir arkadaşına gönder; oynamak için hesap gerekmiyor.",
  ];
}

export const DUEL_RULES = duelRules();

/** Tek doğrulu, dört şıklı sorulara çevirir; uymayanı atar. */
export function toDuelQuestions(
  questions: { text: string; options: string[]; correct: string[]; multi: boolean }[],
): DuelQuestion[] {
  const out: DuelQuestion[] = [];
  for (const question of questions) {
    if (question.multi || question.correct.length !== 1) continue;
    if (question.options.length < 2 || question.options.length > 5) continue;
    const answer = question.options.indexOf(question.correct[0]);
    if (answer < 0) continue;
    out.push({ text: question.text, options: question.options, answer });
    if (out.length === DUEL_QUESTIONS) break;
  }
  return out;
}

export function publicQuestions(questions: DuelQuestion[]): DuelPublicQuestion[] {
  return questions.map(({ text, options }) => ({ text, options }));
}

/** Doğru cevap için 10 + hıza göre 0–5; son soru ×2. Süre aşımı 0. */
export function questionPoints(correct: boolean, ms: number, isLast: boolean): number {
  if (!correct) return 0;
  const limit = DUEL_SECONDS * 1000;
  const clamped = Math.max(0, Math.min(limit, Math.round(ms)));
  if (clamped >= limit) return 0;
  const bonus = Math.round(MAX_SPEED_BONUS * (1 - clamped / limit));
  const points = BASE_POINTS + bonus;
  return isLast ? points * 2 : points;
}

export function scoreDuel(
  questions: DuelQuestion[],
  answers: DuelAnswer[],
): { correct: number; score: number; perQuestion: { answer: number; points: number }[] } {
  let correct = 0;
  let score = 0;
  const perQuestion = questions.map((question, index) => {
    const given = answers[index];
    const right = given?.choice === question.answer;
    const points = questionPoints(right, given?.ms ?? Number.POSITIVE_INFINITY, index === questions.length - 1);
    if (right && points > 0) correct += 1;
    score += points;
    return { answer: question.answer, points };
  });
  return { correct, score, perQuestion };
}

/** 8 karakterlik, karıştırılması zor harflerden paylaşım kodu. */
export function duelCode(random: () => number = Math.random): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(random() * alphabet.length)];
  return code;
}

/** Misafir adı: kısa, tek satır, kontrol karakteri yok. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return name.length >= 2 ? name : null;
}
