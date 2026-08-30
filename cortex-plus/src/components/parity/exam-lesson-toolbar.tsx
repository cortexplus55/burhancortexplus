"use client";

import { ReviewTools } from "@/components/parity/review-tools";

export function ExamLessonToolbar({
  lessonId,
  text,
  initialLiked,
}: {
  lessonId: string;
  text: string;
  initialLiked: boolean;
}) {
  return (
    <ReviewTools
      text={text}
      initialLiked={initialLiked}
      likeHref="/api/learning/exam-prep/lesson"
      likeBody={{ lessonId }}
      copyLabel="Ders kopyalandı."
      ariaLabel="Ders araçları"
    />
  );
}
