import { speechNear } from "@/lib/learning/speech-tolerance";

/**
 * Sözlüde ilk cevaptaki yanlış (25 Ekim 2026, ürün sahibinin kararı; ders-bağımsız): takip sorusunda
 * düzeltse de o sorudan tam puan alınmaz ve eksikler listesinde yanlış adıyla yazılır.
 */

/** `wrong` öğrencinin cümlesinden birebir alıntı, `correct` doğrusu. */
export type OralAnswerError = { wrong: string; correct: string };

/** İlk cevabında temel bir yanlış söyleyen öğrencinin o sorudaki puan tavanı. */
export const ORAL_FIRST_ERROR_CAP = 0.5;

/** Takip sorusu açıldıysa ilk cevap bu anahtarla ayrıca saklanır; cevap anahtarı birleşik metni tutar. */
export function oralFirstAnswerKey(index: number): string {
  return `ilk:${index}`;
}

export function oralFirstAnswer(answers: Record<string, unknown>, index: number): string {
  const first = answers[oralFirstAnswerKey(index)];
  if (typeof first === "string" && first.trim()) return first.trim();
  return String(answers[String(index)] ?? "").trim();
}

/**
 * Soru ekranından çıkan cevap: takip sorusu açıksa ilk cevap ayrıca, cevap anahtarı birleşik metin. "Cevabı
 * gönder", süre bitimi ve "Sınavı bitir" aynı yoldan geçer; süre bitince ilk cevap kaybolmasın (P1-7).
 */
export function oralDeskAnswer(input: {
  probeOpen: boolean;
  firstAnswer: string;
  follow: string;
  value: string;
}): { answer: string; firstAnswer?: string } {
  if (!input.probeOpen) return { answer: input.value };
  const first = input.firstAnswer.trim();
  const answer = [first, input.follow.trim()].filter(Boolean).join("\n");
  return first ? { answer, firstAnswer: first } : { answer };
}

export function firstAnswerErrorLine(error: OralAnswerError): string {
  return `İlk yanıtta «${error.wrong.trim()}» yanlış ifade edildi; doğrusu «${error.correct.trim()}» olmalıdır.`;
}

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

// question-verifier.isScoreLabel'ın eşi: o dosya oral-review'u içe aktarıyor, buradan alınırsa döngü kurulur.
function scoreLabel(text: string): boolean {
  const folded = fold(text).replace(/[:\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!folded || folded.length > 24) return false;
  return (
    /^(tam|kismen|yok|dogru|yanlis|full|partial|zero)(\s+\d{1,2})?$/.test(folded) ||
    /^\d{1,2}\s*\/\s*\d{1,2}$/.test(folded) ||
    /^\d{1,2}\s+puan$/.test(folded) ||
    folded === "tam puan"
  );
}

function quoted(answer: string, quote: string): boolean {
  const q = quote.trim();
  if (q.length < 3) return false;
  return fold(answer).includes(fold(q)) || speechNear(answer, q);
}

/**
 * Modelin bildirdiği ilk cevap yanlışlarını doğrular: alıntı ilk cevapta geçmiyorsa ya da doğrusu
 * boşsa / alıntıyla aynıysa yok sayılır (model öğrenciye söylemediği bir yanlışı yükleyemez).
 */
export function validFirstAnswerErrors(
  firstAnswer: string,
  errors: OralAnswerError[] | null | undefined,
): OralAnswerError[] {
  const out: OralAnswerError[] = [];
  for (const row of errors ?? []) {
    const wrong = typeof row?.wrong === "string" ? row.wrong.trim() : "";
    const correct = typeof row?.correct === "string" ? row.correct.trim() : "";
    if (!wrong || !correct || scoreLabel(correct)) continue;
    if (fold(wrong) === fold(correct)) continue;
    if (!quoted(firstAnswer, wrong)) continue;
    if (out.some((have) => fold(have.wrong) === fold(wrong))) continue;
    out.push({ wrong: wrong.slice(0, 160), correct: correct.slice(0, 200) });
    if (out.length >= 2) break;
  }
  return out;
}
