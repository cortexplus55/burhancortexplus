/**
 * Tanıtım turunun (`/ornek`, 4. adım "Kendini dene") soru biçimi ve yardımcıları (Faz 5 §3.1, 19 Kasım 2026).
 * Veri `lesson.json`da bir kez yazıldı; ziyaretçi kaç kez oynarsa oynasın model çağrısı yok. İstemci ve sunucu okur.
 */
export type DemoQuizQuestion = {
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type DemoQuiz = DemoQuizQuestion & {
  /** "🤔 İki Şık Arasında Kaldım" için Sokratik ipucu: cevabı söylemez, düşündürür. */
  pairHint?: string;
  /** "🔥 Yanlışın İkiziyle Anında Telafi Et": aynı kazanımdan kardeş soru. */
  twin?: DemoQuizQuestion;
};

/** Tanıtım turu bildirimlerinin `question_reports.target_id` değeri (tek örnek ders). */
export const DEMO_REPORT_TARGET_ID = "00000000-0000-4000-8000-0000000de305";

/** "q:<sıra>" ana soru, "twin:<sıra>" ikiz soru. */
export function demoQuestionByRef(quiz: readonly DemoQuiz[], ref: string): DemoQuizQuestion | null {
  const match = /^(q|twin):(\d{1,2})$/.exec(ref);
  if (!match) return null;
  const row = quiz[Number(match[2])];
  if (!row) return null;
  return match[1] === "twin" ? (row.twin ?? null) : row;
}
