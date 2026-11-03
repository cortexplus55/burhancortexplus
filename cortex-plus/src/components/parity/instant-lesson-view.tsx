import type { LessonPreview } from "@/lib/learning/instant-lesson";

/**
 * Havuz dersinin ilk ekranı (3 Kasım 2026): loading sınırı ve doğrudan açılış aynı biçimi çizer; öğrenci önizlemeden
 * gerçek derse geçerken metin değişmez (ikisi de aynı havuz dersinin ilk bölümü).
 */
export function InstantLessonView({ lesson }: { lesson: LessonPreview }) {
  return (
    <article data-testid="instant-lesson" className="space-y-3" aria-busy="true">
      <h1 className="text-xl font-semibold leading-snug break-words">{lesson.title}</h1>
      <h2 className="text-base font-semibold text-[var(--c-action)] break-words">{lesson.heading}</h2>
      {lesson.paragraphs.map((p, i) => (
        <p key={i} className="text-[15px] leading-relaxed break-words">
          {p}
        </p>
      ))}
    </article>
  );
}
