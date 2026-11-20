/**
 * Faz 2 (madde 7.3): etkin sınavda cevap anahtarı istemciye gitmez.
 *
 * Kök neden: konu testi, yol testi (son kontrol, zayıf nokta, tekrar) ve Doğru/Yanlış turu anında geri bildirim için
 * doğru şıkkı, açıklamayı ve şık gerekçelerini oturum açılır açılmaz bütün sorularla birlikte tarayıcıya gönderiyordu;
 * ağ sekmesinden bütün anahtar okunabiliyordu. Yazılı deneme ve ders içi kontroller zaten mühürlüydü.
 *
 * Şimdi: oturum paketi yalnız soru kökü ve şıkları taşır. Öğrenci "Kontrol et" deyince cevap sunucuda kilitlenir ve o
 * sorunun anahtarı yalnız o an döner (`action: "answer-check"`). Notlandırma değişmez: bitişte sunucu kayıtlı paketle
 * notlar (`scoreAttempt`).
 */

/** Etkin sınav sorusunda asla istemciye gitmeyen alanlar (adlar bütün üreticilerin kullandığı biçimlerle). */
export const ANSWER_KEY_FIELDS = [
  "correct",
  "correctIndex",
  "correctOption",
  "correctAnswer",
  "correctAnswers",
  "answerIndex",
  "answerKey",
  "explanation",
  "optionWhy",
  "optionReasons",
  "steps",
  "correctedStatement",
  "corrected",
  "misconceptionTag",
] as const;

function sealRow<T>(row: T): T {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const copy = { ...(row as Record<string, unknown>) };
  for (const field of ANSWER_KEY_FIELDS) delete copy[field];
  return copy as T;
}

/** Bu paket türü etkin oturumda anahtarsız mı gider (konu/yol testi ve D/Y). */
export function sealsActiveExam(payload: Record<string, unknown>): boolean {
  return payload.type === "quiz" || payload.type === "true_false";
}

/**
 * Etkin sınav paketinden cevap anahtarını çıkarır: test soruları (`questions`) ve D/Y önermeleri (`items`). Öbür
 * türler (ders, kart, podcast, sözlü) olduğu gibi döner; ders kontrolleri ayrıca mühürlüdür (`sealStoredLesson`).
 */
export function stripAnswerKeyForActiveExam<T extends Record<string, unknown>>(payload: T): T {
  if (!sealsActiveExam(payload)) return payload;
  const next: Record<string, unknown> = { ...payload };
  if (Array.isArray(payload.questions)) next.questions = payload.questions.map(sealRow);
  if (Array.isArray(payload.items)) next.items = payload.items.map(sealRow);
  // Paket kökünde anahtar listesi tutan eski kayıtlar (ör. `answerKey`) da gitmez.
  for (const field of ANSWER_KEY_FIELDS) delete next[field];
  next.answerCheck = "server";
  return next as T;
}

/** Tekrar/Yanlışlar Defteri gibi tek tek sorulan listelerde aynı mühür (soru başına). */
export function stripAnswerKeyFromQuestion<T>(question: T): T {
  return sealRow(question);
}
