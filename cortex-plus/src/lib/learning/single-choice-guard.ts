/**
 * Tek doğru şık garantisi ve cevap sızıntısı bekçisi (19 Kasım 2026, Faz 1-A §3.1–3.2) — modelsiz, ders bağımsız.
 *
 * Konu testi ve dinleme kontrolü soruları kaydedilmeden önce buradan geçer:
 * - `singleChoiceVerdict`: şıklar arasında TAM BİR geçerli doğru şık (`correctOptionIndex`) var mı. Doğru şık metni
 *   şıklardan birine birebir (boşluk/büyük-küçük harf farkı hariç) denk gelmeli; iki şık aynı metni taşımamalı; birden
 *   fazla doğru işaretli soru tek seçimli olamaz.
 * - `repairSingleChoice`: kodun güvenle yapabileceği onarım (yinelenen anahtar, gereksiz çok cevaplı bayrağı, şık
 *   metninin yazım farkı). Birden fazla FARKLI doğru şık işaretliyse kod hangisinin doğru olduğunu bilemez: soru
 *   onarılamaz, yeniden üretilir (üretim döngüsü sınırlı geçişle).
 * - `answerLeakIssue` (AnswerLeakGuard): kök doğru şıkkın metnini parantez içinde ya da doğrudan veriyorsa ("…(X)…",
 *   "cevap: X") soru reddedilir. Kök bir çeldiriciyi de aynı biçimde anıyorsa ("X mi, Y mi?") sızıntı sayılmaz.
 *
 * Kayıtlı eski çok cevaplı sorular okuma tarafında bozulmaz: bu modül yalnız yeni üretimin kayıt öncesi kapısıdır.
 */
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

type Choice = Pick<QuizQuestion, "text" | "options" | "correct"> & { multi?: boolean };

/** Karşılaştırma biçimi: Türkçe küçük harf, noktalama ve fazla boşluk atılır. */
export function choiceKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[*_`"'“”‘’«»]/gu, "")
    .replace(/[^\p{L}\p{N}%°+\-−×·/=<>.,]+/gu, " ")
    .replace(/[.,]+(?=\s|$)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export type SingleChoiceReason = "no_options" | "no_correct" | "multiple_correct" | "correct_not_in_options" | "duplicate_options";

export type SingleChoiceVerdict =
  | { ok: true; correctOptionIndex: number }
  | { ok: false; reason: SingleChoiceReason; issue: string };

export const SINGLE_CHOICE_ISSUE_PREFIX = "Tek doğru şık kuralı";

/** Doğru şıkkın şıklardaki yeri; tam bir geçerli doğru yoksa -1. */
export function correctOptionIndexOf(question: Choice): number {
  const verdict = singleChoiceVerdict(question);
  return verdict.ok ? verdict.correctOptionIndex : -1;
}

export function singleChoiceVerdict(question: Choice): SingleChoiceVerdict {
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length < 2) {
    return { ok: false, reason: "no_options", issue: `${SINGLE_CHOICE_ISSUE_PREFIX}: soruda en az iki şık olmalı.` };
  }
  const keys = options.map(choiceKey);
  if (keys.some((key, index) => !key || keys.indexOf(key) !== index)) {
    return { ok: false, reason: "duplicate_options", issue: `${SINGLE_CHOICE_ISSUE_PREFIX}: iki şık aynı metni taşıyor ya da bir şık boş.` };
  }
  const marked = [...new Set((Array.isArray(question.correct) ? question.correct : []).map(choiceKey).filter(Boolean))];
  if (!marked.length) {
    return { ok: false, reason: "no_correct", issue: `${SINGLE_CHOICE_ISSUE_PREFIX}: doğru şık işaretlenmemiş.` };
  }
  if (marked.length > 1) {
    return {
      ok: false,
      reason: "multiple_correct",
      issue: `${SINGLE_CHOICE_ISSUE_PREFIX}: ${marked.length} şık doğru işaretli; soruda tam bir doğru şık olmalı (multi false).`,
    };
  }
  const index = keys.indexOf(marked[0]!);
  if (index < 0) {
    return {
      ok: false,
      reason: "correct_not_in_options",
      issue: `${SINGLE_CHOICE_ISSUE_PREFIX}: işaretli doğru cevap şıkların hiçbirinde yok.`,
    };
  }
  return { ok: true, correctOptionIndex: index };
}

/**
 * Kodun güvenle onarabildiği tek seçim hataları: yinelenen anahtar, çok cevaplı bayrağı (tek doğru varken), doğru
 * cevabın şıktan yazım farkı. Onarım şık metnini ve sırasını değiştirmez; anahtar şık metnine eşitlenir.
 * Onarılamıyorsa (birden fazla farklı doğru, doğru şık yok, yinelenen şık) null.
 */
export function repairSingleChoice<T extends Choice>(question: T): T | null {
  const verdict = singleChoiceVerdict(question);
  if (!verdict.ok) return null;
  const correct = question.options[verdict.correctOptionIndex]!;
  const already =
    question.multi !== true && question.correct.length === 1 && question.correct[0] === correct;
  return already ? question : { ...question, correct: [correct], multi: false };
}

/* ───────────── AnswerLeakGuard ───────────── */

export const ANSWER_LEAK_PREFIX = "Cevap sızıntısı";

const ANSWER_LABEL = /(?:doğru\s+(?:cevap|yanıt|şık)|cevap|yanıt|answer)\s*[:=]\s*\S/iu;

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/** Doğrudan sızıntı ölçülecek kadar ayırt edici mi (kısa sayı/tek harf kökte doğal olarak geçer). */
function distinctive(key: string): boolean {
  const letters = key.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 || (key.split(" ").length >= 2 && key.length >= 6);
}

function bracketed(stem: string): string[] {
  return [...stem.matchAll(/[(\[]([^()\[\]]{1,160})[)\]]/gu)].map((match) => choiceKey(match[1]!)).filter(Boolean);
}

/**
 * Kök doğru şıkkı ele veriyor mu? Sorun metni ya da null. Ölçü:
 * 1) kökte "cevap: …" / "doğru şık: …" etiketi;
 * 2) parantez/köşeli parantez içindeki ifade doğru şıkkın kendisi ya da doğru şıkkın ayırt edici bir parçası
 *    (çeldiricilerde geçmeyen);
 * 3) doğru şıkkın ayırt edici metni kökte birebir geçiyor ve hiçbir çeldirici kökte geçmiyor.
 */
export function answerLeakIssue(question: Choice): string | null {
  const stem = String(question.text ?? "");
  if (!stem.trim()) return null;
  if (ANSWER_LABEL.test(stem)) return `${ANSWER_LEAK_PREFIX}: kök doğru cevabı etiketle veriyor ("cevap: …"); kökten çıkar.`;
  const verdict = singleChoiceVerdict(question);
  if (!verdict.ok) return null;
  const options = question.options.map(choiceKey);
  const answer = options[verdict.correctOptionIndex]!;
  const distractors = options.filter((_, index) => index !== verdict.correctOptionIndex);
  const stemKey = choiceKey(stem.replace(/[(\[\])]/gu, " "));
  for (const inner of bracketed(stem)) {
    const exact = inner === answer;
    const partOfAnswer =
      distinctive(inner) && containsPhrase(answer, inner) && !distractors.some((other) => containsPhrase(other, inner));
    const answerInside = distinctive(answer) && containsPhrase(inner, answer);
    if (exact || partOfAnswer || answerInside) {
      return `${ANSWER_LEAK_PREFIX}: kökteki parantez doğru şıkkı veriyor ('${inner.slice(0, 60)}'); parantezi kaldır ya da soruyu yeniden kur.`;
    }
  }
  if (distinctive(answer) && containsPhrase(stemKey, answer) && !distractors.some((other) => other && containsPhrase(stemKey, other))) {
    return `${ANSWER_LEAK_PREFIX}: doğru şıkkın metni kökte açıkça geçiyor ('${answer.slice(0, 60)}'); kökü yeniden kur.`;
  }
  return null;
}

/** Kayıt öncesi doğrulama: tek doğru şık + sızıntı. Boş dizi: soru kaydedilebilir. */
export function preSaveQuestionIssues(question: Choice): string[] {
  const issues: string[] = [];
  const verdict = singleChoiceVerdict(question);
  if (!verdict.ok) issues.push(verdict.issue);
  const leak = answerLeakIssue(question);
  if (leak) issues.push(leak);
  return issues;
}

export type SingleChoiceGate<T> = {
  kept: T[];
  /** Kodla onarılan (anahtar / bayrak) soru sayısı. */
  repaired: number;
  rejected: { question: T; issues: string[] }[];
};

/**
 * Kayıttan hemen önce son kapı: her soru tek doğru şıklı ve sızıntısız çıkar; onarılabilen onarılır, kalan reddedilir.
 * Üretim döngüsü reddedilen yerine yenisini (sınırlı denemeyle) yazar; bu kapı yalnız eler, yazmaz.
 */
export function enforceSingleChoice<T extends Choice>(questions: readonly T[]): SingleChoiceGate<T> {
  const kept: T[] = [];
  const rejected: { question: T; issues: string[] }[] = [];
  let repaired = 0;
  for (const question of questions) {
    const fixed = repairSingleChoice(question);
    if (!fixed) {
      rejected.push({ question, issues: preSaveQuestionIssues(question) });
      continue;
    }
    const issues = preSaveQuestionIssues(fixed);
    if (issues.length) {
      rejected.push({ question, issues });
      continue;
    }
    if (fixed !== question) repaired += 1;
    kept.push(fixed);
  }
  return { kept, repaired, rejected };
}

/** Yazara giden tek satır: bütün sorular tek doğru şıklı (yapı kapısı çok cevaplı soruyu zaten eler). */
export const SINGLE_CHOICE_PROMPT_LINE =
  "Her soru tek doğru şıklıdır: multi false, correct dizisinde yalnız bir şık ve o şık options içinde birebir geçer; " +
  "kök doğru şıkkın metnini (parantez içinde de) vermez.";
