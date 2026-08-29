"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MoreHorizontal } from "lucide-react";

export function ExamPrepStudySession({
  prepId,
  prepTitle,
  sessionId,
  conversationId,
  isPremium,
}: {
  prepId: string;
  prepTitle: string;
  sessionId?: string;
  conversationId?: string;
  isPremium: boolean;
}) {
  const router = useRouter();
  const [lessonReady, setLessonReady] = useState(false);
  const [creatingExam, setCreatingExam] = useState(false);

  async function finishWithExam() {
    setCreatingExam(true);
    try {
      const lessonRes = await fetch("/api/learning/exam-prep/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          sessionId,
          conversationId,
        }),
      });
      if (lessonRes.ok) setLessonReady(true);

      const res = await fetch("/api/learning/exam-prep/mock-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Deneme oluşturulamadı.");
        return;
      }
      router.push(`/deneme-sinavlari/${prepId}/deneme/${payload.examId}`);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setCreatingExam(false);
    }
  }

  return (
    <div className="ap-exam-study flex min-h-[70dvh] flex-col">
      <div className="ap-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
          ← Geri
        </Link>
        <span className="text-sm text-[var(--ap-muted)]">{prepTitle}</span>
      </div>

      {lessonReady ? (
        <div className="ap-lesson-created-toast" role="status">
          <span className="ap-lesson-dot" aria-hidden />
          Ders oluşturuldu
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        <ChatPanel
          variant="astra"
          composerMode="parity"
          showEmptyStarter={false}
          showSubjectPicker
          initialConversationId={conversationId}
          hasDocuments={false}
          isPremium={isPremium}
          returnPath={`/deneme-sinavlari/${prepId}/calis`}
        />
      </div>

      <div className="ap-exam-study-footer">
        <button type="button" className="ap-chip" aria-label="Daha fazla">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
          Daha fazla
        </button>
        <button
          type="button"
          className="ap-finish-exam-btn"
          disabled={creatingExam}
          onClick={() => void finishWithExam()}
        >
          {creatingExam ? "Hazırlanıyor…" : "Sınavla bitir"}
        </button>
      </div>
    </div>
  );
}
