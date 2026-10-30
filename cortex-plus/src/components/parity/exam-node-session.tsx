"use client";
import "@/styles/node-generation-progress.css";
import { useNodeLifecycle, type ExamNodeSessionProps } from "@/components/parity/exam-node/use-node-lifecycle";
import { ExitDialog, SaveStatus, SessionCoach, SessionCreditGate, StudyBar, WaitScreens } from "@/components/parity/exam-node/chrome";
import { OpenSignals, SetupScreens } from "@/components/parity/exam-node/open-screens";
import { OralPlay, OralResultScreens, OralSetup } from "@/components/parity/exam-node/oral";
import { VoicePlay } from "@/components/parity/exam-node/voice";
import { LessonPlay } from "@/components/parity/exam-node/lesson";
import { PodcastPlay } from "@/components/parity/exam-node/podcast";
import { QuizPlay } from "@/components/parity/exam-node/quiz";
import { LocalSessionPlay, LocalSessionResult } from "@/components/parity/exam-node/local-session";
import { TrueFalsePlay } from "@/components/parity/exam-node/true-false";
import { CardsPlay } from "@/components/parity/exam-node/cards";
import { ResultScreen, StarsEarned, WrittenExamResult } from "@/components/parity/exam-node/result";

/**
 * Yol etkinliği oturumu. Yaşam döngüsü tek kancada (`useNodeLifecycle`), her tür kendi çizim bileşeninde
 * (`./exam-node/`). Bileşenler eski tek dosyadaki sırayla ve yerlerinde çizilir (kardeş sırası değişmez).
 */
export function ExamNodeSession(props: ExamNodeSessionProps) {
  const life = useNodeLifecycle(props);
  return (
    <div className="cp-exam-page cp-exam-node">
      <SaveStatus life={life} />
      <StudyBar life={life} />
      <ExitDialog life={life} />
      <WaitScreens life={life} />
      <OpenSignals life={life} />
      <OralSetup life={life} />
      <SetupScreens life={life} />
      <VoicePlay life={life} />
      <LessonPlay life={life} />
      <PodcastPlay life={life} />
      <QuizPlay life={life} />
      <LocalSessionPlay life={life} />
      <TrueFalsePlay life={life} />
      <CardsPlay life={life} />
      <OralPlay life={life} />
      <StarsEarned life={life} />
      <OralResultScreens life={life} />
      <WrittenExamResult life={life} />
      <LocalSessionResult life={life} />
      <ResultScreen life={life} />
      <SessionCoach life={life} />
      <SessionCreditGate life={life} />
    </div>
  );
}

// Çağıranlar ve testler eski adresten alır.
export { resultPollDelay, SAVE_TYPING_DEBOUNCE_MS, type ExamNodeSessionProps } from "./exam-node/use-node-lifecycle";
export { LESSON_PODCAST_GATE, nodeGateForCode, VOICE_MODE_GATE, type NodeGate } from "./exam-node/gates";
