"use client";

import { useMemo, useState, type ReactNode } from "react";
import { TeacherV3FollowUps, TeacherV3Reply } from "@/components/chat/teacher-v3/teacher-v3-reply";
import { TeacherV3Status } from "@/components/chat/teacher-v3/teacher-v3-thinking";
import { cleanV3Reply } from "@/lib/teacher/v3-reply";
import type { QuickCheckOption } from "@/lib/teacher/quick-check";

/**
 * Öğretmenin bir sırası (öğretmen v3): üstte durum satırı (beklerken parıltılı aşama, bitince "💡 N sn düşündü"),
 * çerçevesiz yanıt, yanıt tamamen açılınca dört soluk simge ve (son yanıtta) sağa yaslı takip soruları.
 */
export function TeacherV3Turn({
  content,
  streaming,
  animate,
  waitStartedAt,
  thoughtMs,
  isLast,
  disabled,
  answeredWith,
  onCheckAnswer,
  onFollowUp,
  actions,
}: {
  content: string;
  /** Bu yanıt şu an akıyor mu. */
  streaming: boolean;
  /** Bu oturumda akan yanıt: kelime kelime açılır, durum satırı görünür. */
  animate: boolean;
  waitStartedAt: number | null;
  thoughtMs?: number;
  isLast: boolean;
  disabled: boolean;
  answeredWith?: string | null;
  onCheckAnswer: (option: QuickCheckOption) => void;
  onFollowUp: (question: string) => void;
  /** Yanıtın altındaki dört simge (beğen, beğenme, sesli dinle, kopyala). */
  actions: ReactNode;
}) {
  const [revealed, setRevealed] = useState(!animate);
  const questions = useMemo(() => cleanV3Reply(content).questions, [content]);
  const waiting = streaming && !content.trim();
  const settled = revealed && !streaming;
  const showStatus = animate && (streaming || !revealed || thoughtMs != null);
  if (!streaming && !content.trim()) return null;
  return (
    <article className="cx-v3-turn cx-v3-turn--teacher">
      {showStatus ? (
        <TeacherV3Status
          startedAt={waitStartedAt}
          writing={!waiting}
          finishedMs={settled && thoughtMs != null ? thoughtMs : null}
        />
      ) : null}
      {content.trim() ? (
        <TeacherV3Reply
          content={content}
          streaming={streaming}
          animate={animate}
          disabled={disabled}
          interactiveCheck={isLast && settled}
          answeredWith={answeredWith}
          onCheckAnswer={onCheckAnswer}
          onRevealed={() => setRevealed(true)}
        />
      ) : null}
      {settled ? actions : null}
      {settled && isLast ? <TeacherV3FollowUps questions={questions} onPick={onFollowUp} disabled={disabled} /> : null}
    </article>
  );
}
