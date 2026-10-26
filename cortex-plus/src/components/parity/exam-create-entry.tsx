"use client";

import { useState } from "react";
import { ExamCreateChat } from "@/components/parity/exam-create-chat";
import { ExamCreateWizard } from "@/components/parity/exam-create-wizard";

/**
 * Kurulumun iki yolu var: materyali olan öğrenci sihirbazdan geçer, olmayan
 * sohbetle kurar. Varsayılan sihirbaz — öğrencinin çoğu elinde bir ders notuyla
 * geliyor ve boş bir sohbet kutusu "ne yazacağım" duraksamasına yol açıyordu.
 */
export function ExamCreateEntry({
  initialDocumentId = null,
  recentSubjects = [],
  initialSubject = null,
  initialPrompt = null,
  prepLimitReached = false,
  gradeLevel = null,
}: {
  initialDocumentId?: string | null;
  gradeLevel?: string | null;
  recentSubjects?: string[];
  /** Katalog kartından gelen ders (Müfredatım / Resmî sınavlar). */
  initialSubject?: string | null;
  /** Katalog kartından gelen ilk mesaj; sohbetle kurulum açılır. */
  initialPrompt?: string | null;
  /** Ücretsiz hesabın tek hazırlık hakkı dolu (3 Ekim 2026). */
  prepLimitReached?: boolean;
}) {
  const [mode, setMode] = useState<"wizard" | "chat">(
    initialPrompt && !initialDocumentId ? "chat" : "wizard",
  );
  // 19 Ekim 2026: sihirbazdan "Belgem yok" ile gelince ders, tarih ve hedef taşınır; sohbet bunları
  // yeniden sormuyordu ama sorduğunu sanıyordu ("sonra tarihi seçip"), eski belgeleri de listeliyordu.
  const [picked, setPicked] = useState<{ subject: string; examDate: string; target: number } | null>(null);

  if (mode === "chat") {
    return (
      <>
        <button
          type="button"
          className="apw-back"
          onClick={() => setMode("wizard")}
        >
          ← Adım adım kuruluma dön
        </button>
        <ExamCreateChat
          initialDocumentId={initialDocumentId}
          recentSubjects={recentSubjects}
          initialSubject={picked?.subject || initialSubject}
          initialPrompt={initialPrompt}
          initialExamDate={picked?.examDate || undefined}
          initialTarget={picked?.target}
          topicOnly={Boolean(picked)}
          prepLimitReached={prepLimitReached}
        />
      </>
    );
  }

  return (
    <ExamCreateWizard
      initialDocumentId={initialDocumentId}
      recentSubjects={recentSubjects}
      onUseChat={(choice) => {
        setPicked(choice);
        setMode("chat");
      }}
      prepLimitReached={prepLimitReached}
      gradeLevel={gradeLevel}
    />
  );
}
