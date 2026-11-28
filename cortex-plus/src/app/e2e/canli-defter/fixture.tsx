"use client";

import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import type { PublicLessonV3 } from "@/lib/learning/lesson-play-v3";

/**
 * Yalnız test fikstürü (E2E_FIXTURE=1): Canlı Defter Modu, gerçek ders ekranıyla (önsöz, anlatım, kapanış).
 * Ağ isteği yok; ders üründeki gibi üst çubuksuz (tek çıkış ×).
 */
export function CanliDefterFixture({ lesson, autoplay }: { lesson: PublicLessonV3; autoplay: boolean }) {
  return (
    <main className="cp-exam-page cp-exam-node">
      <ExamLessonSteps
        lesson={lesson}
        closeHref="/e2e/canli-defter"
        plannedMinutes={6}
        brief={{ autoOpen: autoplay, levelLabel: "Temel", cramHref: "/deneme-sinavlari/fikstur/sinav-sabahi", cramLocked: false }}
        live={{ autoplay }}
      />
    </main>
  );
}
