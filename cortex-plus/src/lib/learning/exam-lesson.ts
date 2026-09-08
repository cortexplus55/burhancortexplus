import type { LessonV2 } from "@/lib/learning/teaching-standards";

export type StructuredLesson = {
  title: string;
  overview: string;
  sections: { heading: string; body: string }[];
  example: { prompt: string; solution: string };
  summary: string[];
  nextFocus: string[];
  /** Stage 5 v2 fields (optional so legacy lessons still format). */
  objective?: string;
  commonMistake?: { claim: string; correction: string };
  infoCheck?: { prompt: string; answer: string };
};

export function formatStructuredLesson(lesson: StructuredLesson | LessonV2): string {
  const sections = lesson.sections
    .filter((s) => s.heading.trim() && s.body.trim())
    .map((s) => `## ${s.heading.trim()}\n\n${s.body.trim()}`)
    .join("\n\n");

  const summary = lesson.summary
    .map((item) => `- ${item.trim()}`)
    .filter((item) => item.length > 2)
    .join("\n");

  const next = lesson.nextFocus
    .map((item) => `- ${item.trim()}`)
    .filter((item) => item.length > 2)
    .join("\n");

  const example =
    lesson.example.prompt.trim() || lesson.example.solution.trim()
      ? `## Örnek\n\n${lesson.example.prompt.trim()}\n\n**Çözüm:** ${lesson.example.solution.trim()}`
      : "";

  const objective =
    "objective" in lesson && lesson.objective?.trim()
      ? `## Öğrenme hedefi\n\n${lesson.objective.trim()}`
      : "";

  const mistake =
    "commonMistake" in lesson && lesson.commonMistake
      ? `## Yaygın hata\n\n**Yanılgı:** ${lesson.commonMistake.claim.trim()}\n\n**Doğrusu:** ${lesson.commonMistake.correction.trim()}`
      : "";

  const infoCheck =
    "infoCheck" in lesson && lesson.infoCheck
      ? `## Bilgi kontrolü\n\n${lesson.infoCheck.prompt.trim()}\n\n**Yanıt:** ${lesson.infoCheck.answer.trim()}`
      : "";

  return [
    objective,
    lesson.overview.trim(),
    sections,
    example,
    mistake,
    infoCheck,
    summary ? `## Özet\n\n${summary}` : "",
    next ? `## Sonraki odak\n\n${next}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
