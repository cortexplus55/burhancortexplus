export type StructuredLesson = {
  title: string;
  overview: string;
  sections: { heading: string; body: string }[];
  example: { prompt: string; solution: string };
  summary: string[];
  nextFocus: string[];
};

export function formatStructuredLesson(lesson: StructuredLesson): string {
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

  return [
    lesson.overview.trim(),
    sections,
    example,
    summary ? `## Özet\n\n${summary}` : "",
    next ? `## Sonraki odak\n\n${next}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
