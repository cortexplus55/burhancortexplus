"use client";

import "katex/dist/katex.min.css";
import { hasMath, plainMath } from "@/lib/learning/math-split";
import { useMathRenderer } from "@/components/learning/use-math-renderer";
import { ExamLessonBodyView } from "@/components/parity/exam-lesson-body-view";

const plainRender = (tex: string) => plainMath(tex);

/** İstemci oturumundaki eski biçimli ders: KaTeX yalnız gövdede formül varsa yüklenir (6 Kasım 2026). */
export function ExamLessonBodyLazy({ content }: { content: string }) {
  const renderer = useMathRenderer(hasMath(content));
  return <ExamLessonBodyView content={content} renderMath={renderer?.renderMath ?? plainRender} />;
}
