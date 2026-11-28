"use client";

import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import type { PublicLessonV3 } from "@/lib/learning/lesson-play-v3";

/**
 * Yalnız test fikstürü (E2E_FIXTURE=1): ders ekranının önsözü ve kapanışı, gerçek bileşenle. Ders oturumu üründe de
 * üst çubuksuz (tek çıkış ×), bu yüzden kabuk çizilmez. Ağ isteği yok.
 */
export function DersOnsozFixture({
  lesson,
  autoOpen,
  cramLocked,
}: {
  lesson: PublicLessonV3;
  autoOpen: boolean;
  cramLocked: boolean;
}) {
  return (
    <main className="cp-exam-page cp-exam-node">
      <ExamLessonSteps
        lesson={lesson}
        closeHref="/e2e/ders-onsoz"
        plannedMinutes={7}
        brief={{ autoOpen, levelLabel: "Temel", cramHref: "/deneme-sinavlari/fikstur/sinav-sabahi", cramLocked }}
      />
    </main>
  );
}
