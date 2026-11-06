// KaTeX'in biçimi formülü çizen bileşenle gelir (6 Kasım 2026; önceden kök düzendeydi).
import "katex/dist/katex.min.css";
import { renderMath } from "@/lib/learning/math-text";
import { ExamLessonBodyView } from "@/components/parity/exam-lesson-body-view";

/**
 * Kalın metin ve LaTeX'i birlikte işler. Formüller KaTeX'e verilir
 * (`trust: false` — HTML enjekte eden komutlar kapalı); geri kalan her şey
 * React metin düğümü olarak kalır, yani escape'i React yapar.
 *
 * Sunucu sayfası (`ders/[lessonId]`) için eşzamanlı sürüm; istemci oturumu `ExamLessonBodyLazy` kullanır.
 */
export function ExamLessonBody({ content }: { content: string }) {
  return <ExamLessonBodyView content={content} renderMath={renderMath} />;
}
