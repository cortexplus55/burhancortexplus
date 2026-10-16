/**
 * LessonV3'ün bağımlılıksız bölüm görünümü: başlık, metin, soru.
 *
 * `teaching-standards.ts` LessonV3'ü okuyabilsin diye ayrı ve içe aktarmasız
 * (lesson-v3.ts şemalarını teaching-standards'tan alıyor; tersini içe aktarmak
 * döngü kurar). Tam çeviri için `v3ToV2` (lesson-v3.ts) kullanılır.
 */
export type LessonSectionView = { heading: string; body: string; check?: unknown };

export function lessonV3SectionsView(value: unknown): LessonSectionView[] | null {
  if (!value || typeof value !== "object") return null;
  const lesson = value as { format?: unknown; screens?: unknown };
  if (lesson.format !== 3 || !Array.isArray(lesson.screens)) return null;
  return lesson.screens.map((screen) => {
    const row = (screen ?? {}) as { heading?: unknown; blocks?: unknown };
    const blocks = Array.isArray(row.blocks) ? (row.blocks as { type?: unknown; text?: unknown; check?: unknown }[]) : [];
    return {
      heading: typeof row.heading === "string" ? row.heading : "",
      body: blocks
        .flatMap((block) => (block?.type === "text" && typeof block.text === "string" ? [block.text.trim()] : []))
        .join("\n\n"),
      check: blocks.find((block) => block?.type === "check")?.check,
    };
  });
}
