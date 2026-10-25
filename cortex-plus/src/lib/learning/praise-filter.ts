/**
 * Boş övgü ve sınav talimatı. Sözlük dakikadan bağımsızdır; ders adı içermez.
 * Cümle ortasındaki övgü de düşer: "…, muazzam bir özet oldu".
 */

const PRAISE =
  "muazzam|harika|mükemmel|muhteşem|şahane|efsanevi|efsane|tebrikler|bravo|süper|olağanüstü|fevkalade|kusursuz|müthiş";

const PRAISE_WORD = new RegExp(`^(?:${PRAISE})$`, "iu");
const PRAISE_CLAUSE = new RegExp(`(?:^|[,:;])\\s*(?:${PRAISE})\\b[^.!?]{0,80}`, "giu");

/** Övgüyle birlikte durunca bilgi sayılmayan kısa sözler. */
const FILLER =
  /^(?:bir|bu|şu|o|çok|gerçekten|oldu|olmuş|özet|anlatım|ve|de|da|ki|ne|kadar|ya|ile|için|gibi|diye|işte|evet|aynen|süper)$/iu;

const EXAM_INSTRUCTION =
  /(?:şık(?:lar)?ı\s+işaretle|optik\s+forma|kalemi\s+(?:bırak|kaldır)|süreniz\s+(?:doldu|bitti)|sınav\s+talimatı|cevap\s+kâğıdına\s+kodla)/iu;

/** Konuşmacı etiketi. Düz cümledeki "öğretmen" sözü etiket değildir. */
const TEACHER_LABEL = /(?:^|\s)(?:ÖĞRETMEN|OGRETMEN|Öğretmen|Ogretmen)\s*[:：]/;

export function hasPraise(text: string): boolean {
  return new RegExp(`(?:^|[^\\p{L}])(?:${PRAISE})(?!\\p{L})`, "iu").test(text);
}

export function hasExamInstruction(text: string): boolean {
  return EXAM_INSTRUCTION.test(text);
}

export function hasTeacherLabel(text: string): boolean {
  return TEACHER_LABEL.test(text);
}

function contentWords(sentence: string): string[] {
  return sentence
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLER.test(word) && !PRAISE_WORD.test(word) && word.length > 2);
}

/** Övgü cümlesini ya da övgü yan cümlesini siler. Kalan bilgi durur. */
export function stripPraise(text: string): string {
  const stripped = text.replace(PRAISE_CLAUSE, (clause) => (/^[,:;]/.test(clause) ? "" : clause.startsWith(" ") ? " " : ""));
  const sentences = stripped.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const kept = sentences.filter((sentence) => {
    if (!/[\p{L}\p{N}]/u.test(sentence)) return false;
    if (!hasPraise(sentence)) return true;
    return contentWords(sentence).length >= 4;
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function stripTeacherLabel(text: string): string {
  return text.replace(TEACHER_LABEL, " ").replace(/\s+/g, " ").trim();
}

export type SpeechLine = { speaker?: string; text: string; beat?: string; spoken?: string };

export type SpeechChapter = { title: string; lines: SpeechLine[]; durationMs?: number };

/** Satırdaki övgüyü, sınav talimatını ve konuşmacı etiketini çıkarır. Boş satır düşer. */
export function cleanSpeechChapters<T extends SpeechChapter>(chapters: readonly T[]): T[] {
  const next: T[] = [];
  for (const chapter of chapters) {
    const lines = chapter.lines.flatMap((line) => {
      if (hasExamInstruction(line.text)) return [];
      const text = stripTeacherLabel(stripPraise(line.text));
      if (!text) return [];
      const spoken = line.spoken ? stripTeacherLabel(stripPraise(line.spoken)) : line.spoken;
      return [{ ...line, text, ...(spoken ? { spoken } : {}) }];
    });
    if (!lines.length) continue;
    next.push({ ...chapter, lines });
  }
  return next.length ? next : chapters.map((chapter) => ({ ...chapter }));
}
