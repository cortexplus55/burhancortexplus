import { hasOwnSolution, looksLikeQuestion } from "@/lib/learning/tutor-answer";
import { looksLikeProblem } from "@/lib/learning/tutor-turn";
import { TEACH_MODE_SUMMARY, type TeachModeV2 } from "@/lib/learning/tutor-style";

/*
  Bağlamsal düşünme durumu (Faz 11, teacher.v2, 21 Kasım 2026): öğretmen yazarken görünen tek kısa cümle. Saf, modelsiz ve
  deterministik: yalnız mesajın biçimine ve ekine bakar (aynı girdi aynı cümle). Ders ya da konu sözcüğü yok.
*/

export const THINKING_STATUS = {
  image: "Fotoğrafını okuyorum…",
  document: "Notlarına bakıyorum…",
  example: "Senin için örnek hazırlıyorum…",
  answer: "Cevabını inceliyorum…",
  stepTutor: "Çözüm basamağını inceliyorum…",
  stepSummary: "Çözümü baştan sona hazırlıyorum…",
  concept: "Konuyu senin için toparlıyorum…",
  summary: "Kısa özeti hazırlıyorum…",
  idle: "Düşünüyorum…",
} as const;

const fold = (text: string) =>
  String(text ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

/** Örnek, benzetme ya da günlük hayattan anlatım isteği. */
const EXAMPLE_ASK = /\b(?:ornek\w*|benzetme\w*|benzet\w*|analoji\w*|gunluk hayat\w*|somutla\w*)/u;

export function thinkingStatus(input: {
  hasImage?: boolean;
  hasDocument?: boolean;
  message?: string | null;
  mode?: TeachModeV2 | null;
}): string {
  if (input.hasImage) return THINKING_STATUS.image;
  if (input.hasDocument) return THINKING_STATUS.document;
  const message = String(input.message ?? "").trim();
  if (!message) return THINKING_STATUS.idle;
  const summary = input.mode === TEACH_MODE_SUMMARY;
  if (EXAMPLE_ASK.test(fold(message))) return THINKING_STATUS.example;
  if (hasOwnSolution(message)) return THINKING_STATUS.answer;
  if (looksLikeProblem(message)) return summary ? THINKING_STATUS.stepSummary : THINKING_STATUS.stepTutor;
  if (looksLikeQuestion(message)) return summary ? THINKING_STATUS.summary : THINKING_STATUS.concept;
  return THINKING_STATUS.idle;
}
