import type { Mood } from "@/lib/learning/session-signals";

/**
 * Sözlü deneme kabuğu — Astra sözlü sınav akışının konu, öğretmen,
 * ön kontrol, canlı küre, bitirme ve sonuç metinleri.
 *
 * Ses ve hava seçimi yeni bir ücretli ürün değil. Tek ses (Ada) ve üç
 * hava, mevcut düğüm başlangıcındaki mood/zorluk ile sesli turdaki
 * isteğe bağlı stile bağlanır.
 */

export const ORAL_VOICE_NAME = "Ada";
export const ORAL_EXPECTED_QUESTIONS = 3;
export const ORAL_LIMIT_MINUTES = 7;

export const EMPTY_ORAL_ANSWER_NOTE =
  "Hatanız şuradaydı: Herhangi bir cevap verilmediği için konu içeriği değerlendirilememiştir.";

export type OralTeacherMoodId = "strict" | "helpful" | "harsh";
export type OralDifficulty = "kolay" | "orta" | "ileri";

export const ORAL_TEACHER_MOODS: {
  id: OralTeacherMoodId;
  badge: "ÖNERİLEN" | "ÖNERİLMEZ" | null;
  title: string;
  blurb: string;
  mood: Mood;
  difficulty: OralDifficulty;
}[] = [
  {
    id: "strict",
    badge: "ÖNERİLEN",
    title: "Sıkı sınav görevlisi",
    blurb: "Yardım yok, tıpkı gerçek sınavdaki gibi",
    mood: "ready",
    difficulty: "ileri",
  },
  {
    id: "helpful",
    badge: null,
    title: "Yardımcı öğretmen",
    blurb: "Takıldığında öğretmen yardım eder",
    mood: "calm",
    difficulty: "orta",
  },
  {
    id: "harsh",
    badge: "ÖNERİLMEZ",
    title: "Acımasız öğretmen",
    blurb: "Filtresiz, acımasız",
    mood: "stressed",
    difficulty: "ileri",
  },
];

export const DEFAULT_ORAL_TEACHER_MOOD: OralTeacherMoodId = "helpful";

export const ORAL_PREFLIGHT = {
  title: "Başlamadan önce",
  body: "Bu sesli bir sözlü deneme sınavı. Öğretmenin sesli olarak sorular soracak, sen de cevaplarını sesli söyleyeceksin.",
  items: [
    "Rahatça konuşabileceğin sessiz bir yer bul",
    `${ORAL_EXPECTED_QUESTIONS} soru bekle`,
    "İstediğin zaman bitir, yine de geri bildirim alacaksın",
    `${ORAL_LIMIT_MINUTES} dakika ile sınırlı`,
  ],
  confirm: "Hazırım",
} as const;

export type OralMessage = { role: "user" | "assistant"; content: string };

export type OralReviewItem = {
  question: string;
  answer: string;
  solution: string;
};

export function topicStatusPct(status: string | null | undefined): number {
  if (status === "done") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

export function formatTopicPct(pct: number): string {
  const safe = Number.isFinite(pct) ? pct : 0;
  return `%${Math.max(0, Math.min(100, Math.round(safe)))}`;
}

export function oralTeacherById(id: OralTeacherMoodId) {
  return ORAL_TEACHER_MOODS.find((item) => item.id === id) ?? ORAL_TEACHER_MOODS[1];
}

/** Sesli tur promptuna eklenen tek cümle. Hakaret yok; sert hava yalnızca netlik. */
export function oralTeacherStyleLine(id: OralTeacherMoodId): string {
  switch (id) {
    case "strict":
      return "Sıkı sınav görevlisi gibi sor: ipucu verme, cevabı söyleme, kısa ve resmi kal.";
    case "harsh":
      return "Sert ve net ol; yanlışta düzelt. Aşağılama veya hakaret etme.";
    default:
      return "Yardımcı öğretmen gibi sor: takıldığında kısa ipucu ver, cevabı doğrudan söyleme.";
  }
}

export function letterGrade(pct: number): "A" | "B" | "C" | "D" | "F" {
  if (pct >= 85) return "A";
  if (pct >= 70) return "B";
  if (pct >= 55) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export function oralHeadline(pct: number): string {
  if (pct >= 70) return "Güzel gidiyorsun";
  if (pct >= 40) return "Biraz daha çalışmalısın";
  return "Daha fazla pratik yapmalısın";
}

export function oralSummary(pct: number): string {
  if (pct >= 70) return "Öğrenme sürecin dengeli görünüyor";
  return "Bu konuda biraz daha pratik iyi gelir";
}

export function oralVoicePercent(
  messages: OralMessage[],
  expected = ORAL_EXPECTED_QUESTIONS,
): number {
  const answered = reviewItemsFromTranscript(messages).filter((item) => item.answer.length > 0)
    .length;
  if (expected <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((answered / expected) * 100)));
}

export function oralWrittenPercent(score: number, total: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
}

export function reviewItemsFromTranscript(messages: OralMessage[]): OralReviewItem[] {
  const items: OralReviewItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const question = message.content.trim();
    if (!question) continue;
    const next = messages[i + 1];
    const answer = next?.role === "user" ? next.content.trim() : "";
    items.push({
      question,
      answer,
      solution: answer
        ? "Öğretmen soruyu sesli sordu. Yanıtın kayda geçti; soru bazında ayrı bir puan üretilmedi, genel not üstteki yüzdedir."
        : `Sesli yanıt kaydedilmedi. ${EMPTY_ORAL_ANSWER_NOTE}`,
    });
    if (next?.role === "user") i += 1;
  }
  return items;
}

export function reviewItemsFromQuestions(
  questions: { prompt?: string; hint?: string; expectedPoints?: string[] }[],
  answers: Record<string, unknown>,
): OralReviewItem[] {
  return questions.map((question, index) => {
    const answer = String(answers[String(index)] ?? "").trim();
    const expected = (question.expectedPoints ?? []).map((point) => point.trim()).filter(Boolean);
    const solution = answer
      ? expected.length
        ? expected.join(" ")
        : question.hint?.trim() ||
          "Yanıtın kayda geçti. Ayrıntılı çözüm bu soruda üretilmediyse genel nota bak."
      : `Yanıt yok. ${EMPTY_ORAL_ANSWER_NOTE}`;
    return {
      question: question.prompt?.trim() || `Soru ${index + 1}`,
      answer,
      solution,
    };
  });
}

export function oralLiveStatus(
  phase: "thinking" | "speaking" | "listening" | "idle",
  caption = "",
): string {
  if (phase === "listening") return "Öğretmen dinliyor";
  if (phase === "thinking") return "Öğretmen düşünüyor…";
  if (phase === "speaking") return "Öğretmen konuşuyor…";
  // Dinlerken caption öğrencinin sözü olabilir; onu durum satırına yazma.
  if (/mikrofon|oturum|sesini|çözemedim|tarayıcı/i.test(caption)) return caption.trim();
  return "Sınav duraklatıldı";
}
