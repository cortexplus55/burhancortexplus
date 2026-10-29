/**
 * Sözlü ilk cevabın saklanması (26 Ekim 2026) ve hakem notunun biçimi (29 Ekim 2026).
 *
 * 29 Ekim 2026, ürün sahibinin kararı: kod hakemin puanını hiçbir koşulda düşürmez ve
 * "İlk yanıtta «X» yanlış ifade edildi" satırını kendisi üretmez. Eski çelişki sezgisi
 * (sayı kümesi farkı, olumsuzluk, yön) doğru cümleyle alakasız kaynak cümlesini de
 * "çelişki" sayıyordu. Bu dosya artık yalnız ilk cevabı / takip sorusunu anahtarlar ve
 * hakemin verdiği {wrong, correct} notunu tek biçimde yazar.
 */

/** Hakemin ilk cevap notu: `wrong` ilk cevaptan birebir alıntı, `correct` bu sorunun beklenen cevabından. */
export type OralAnswerError = { wrong: string; correct: string };

/** Takip sorusu açıldıysa ilk cevap bu anahtarla ayrıca saklanır; cevap anahtarı birleşik metni tutar. */
export function oralFirstAnswerKey(index: number): string {
  return `ilk:${index}`;
}

/** Takip sorusunun metni (hakem takibin neye cevap olduğunu görsün). */
export function oralFollowQuestionKey(index: number): string {
  return `takip:${index}`;
}

export function oralFirstAnswer(answers: Record<string, unknown>, index: number): string {
  const first = answers[oralFirstAnswerKey(index)];
  if (typeof first === "string" && first.trim()) return first.trim();
  return String(answers[String(index)] ?? "").trim();
}

export function oralFollowQuestion(answers: Record<string, unknown>, index: number): string {
  const question = answers[oralFollowQuestionKey(index)];
  return typeof question === "string" ? question.trim() : "";
}

/** Birleşik cevabın ilk cevaptan sonraki kısmı; takip açılmadıysa boş. */
export function oralFollowAnswer(answers: Record<string, unknown>, index: number): string {
  const combined = String(answers[String(index)] ?? "").trim();
  const first = oralFirstAnswer(answers, index);
  if (!first || first === combined) return "";
  return combined.startsWith(first) ? combined.slice(first.length).trim() : "";
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

/** Hakemin notunu biçimler; içerik üretmez. Boş alanlı not satır vermez. */
export function firstAnswerErrorLine(error: OralAnswerError | null | undefined): string {
  const wrong = typeof error?.wrong === "string" ? error.wrong.trim() : "";
  const correct = typeof error?.correct === "string" ? error.correct.trim() : "";
  if (!wrong || !correct) return "";
  return `İlk yanıtta «${wrong}» yanlış ifade edildi; doğrusu «${correct}» olmalıdır.`;
}
