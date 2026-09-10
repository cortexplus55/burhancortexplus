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
}: {
  initialDocumentId?: string | null;
  recentSubjects?: string[];
}) {
  const [mode, setMode] = useState<"wizard" | "chat">("wizard");

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
        <ExamCreateChat initialDocumentId={initialDocumentId} />
      </>
    );
  }

  return (
    <ExamCreateWizard
      initialDocumentId={initialDocumentId}
      recentSubjects={recentSubjects}
      onUseChat={() => setMode("chat")}
    />
  );
}
