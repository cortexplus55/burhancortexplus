import { speechNear } from "@/lib/learning/speech-tolerance";

/**
 * Sözlü yanlış kaydı (26 Ekim 2026): kesinti yalnız beklenen cevapla doğrudan çelişen
 * bilgi içindir. Rubriği karşılayan ya da doğru bilgiyi içeren cevap düşürülmez.
 */

/** `wrong` öğrencinin cümlesinden birebir alıntı, `correct` doğrusu. */
export type OralAnswerError = { wrong: string; correct: string; turn?: "first" | "follow" };

/** Eski tavan. Tek geçişte bütün soruyu buna yapıştırma; yalnız gerçek çelişkide ölçüt düşer. */
export const ORAL_FIRST_ERROR_CAP = 0.5;

const PROTECTED_END =
  /^(?:I{1,3}|IV|VI{0,3}|IX|X{1,3}|\d+|yy|vb|Dr|Prof|Bkz|vs|No|Mad)\.$/i;

/** "II. Mehmed" ve "Dr." gibi kısaltma noktalarında cümle bölünmez. */
export function splitAnswerSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const pattern = /([.!?])(\s+)|\n+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match[1]) {
      const token = text.slice(start, match.index + 1).trim().match(/(\S+)$/)?.[1] ?? "";
      if (PROTECTED_END.test(token)) continue;
    }
    const chunk = text.slice(start, match.index + (match[1]?.length ?? 0)).trim();
    if (chunk) out.push(chunk);
    start = match.index + match[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

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
  const label = error.turn === "follow" ? "Takip yanıtında" : "İlk yanıtta";
  return `${label} «${error.wrong.trim()}» yanlış ifade edildi; doğrusu «${error.correct.trim()}» olmalıdır.`;
}

function numbersIn(text: string): string[] {
  return [...fold(text).matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", "."));
}

function negated(text: string): boolean {
  return /\b(degil|yoktur|olmaz|yanlis|hayir)\b/.test(fold(text));
}

/** Alıntı, doğrusuyla aynı bilgiyi söylüyorsa çelişki değildir. */
export function contradictsExpected(wrong: string, correct: string): boolean {
  const w = fold(wrong);
  const c = fold(correct);
  if (!w || !c || w === c) return false;
  if (c.includes(w) || w.includes(c)) return false;
  const wn = numbersIn(wrong);
  const cn = numbersIn(correct);
  if (wn.length && cn.length && (wn.some((n) => !cn.includes(n)) || cn.some((n) => !wn.includes(n)))) return true;
  if (negated(wrong) !== negated(correct)) return true;
  const up = /\b(artar|arttirir|cogalir|yukselir|doubles)\b/;
  const down = /\b(azalir|azaltir|degismez|sabit|dusmez|degistirmez)\b/;
  if ((up.test(w) && down.test(c)) || (down.test(w) && up.test(c))) return true;
  return false;
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
  followAnswer = "",
): OralAnswerError[] {
  const out: OralAnswerError[] = [];
  for (const row of errors ?? []) {
    const wrong = typeof row?.wrong === "string" ? row.wrong.trim() : "";
    const correct = typeof row?.correct === "string" ? row.correct.trim() : "";
    if (!wrong || !correct || scoreLabel(correct)) continue;
    if (fold(wrong) === fold(correct)) continue;
    if (!contradictsExpected(wrong, correct)) continue;
    // Takip cevabı doğrusunu söylüyorsa ilk cümledeki çelişki puanı düşürmez.
    if (followAnswer.trim() && (fold(followAnswer).includes(fold(correct)) || speechNear(followAnswer, correct))) continue;
    const inFirst = quoted(firstAnswer, wrong);
    const inFollow = Boolean(followAnswer.trim()) && quoted(followAnswer, wrong);
    if (!inFirst && !inFollow) continue;
    if (out.some((have) => fold(have.wrong) === fold(wrong))) continue;
    out.push({
      wrong: wrong.slice(0, 160),
      correct: correct.slice(0, 200),
      turn: inFirst ? "first" : "follow",
    });
    if (out.length >= 2) break;
  }
  return out;
}
