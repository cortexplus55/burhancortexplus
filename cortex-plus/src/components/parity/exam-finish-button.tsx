"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Sınavla bitir". Konusu verilirse dersin kendi testini açar (30 Ekim 2026: kart "Bu dersi hızlı bir bilgi
 * kontrolüyle tamamla" diyordu ama hep bütün hazırlığın yazılı deneme kurulumuna gidiyordu); konunun yolda testi
 * yoksa ya da sorulamazsa yazılı deneme kurulumu.
 */
export function ExamFinishButton({
  prepId,
  topicId,
  label = "Sınavla bitir",
  className = "cp-finish-exam-btn",
}: {
  prepId: string;
  topicId?: string | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const mockSetup = `/deneme-sinavlari/${prepId}/deneme/kurulum`;

  const open = async () => {
    if (!topicId) {
      router.push(mockSetup);
      return;
    }
    setBusy(true);
    try {
      const query = new URLSearchParams({ prepId, topicId });
      const response = await fetch(`/api/learning/exam-prep/topic-test?${query}`, { cache: "no-store" });
      const data = response.ok ? ((await response.json()) as { href?: string | null }) : null;
      router.push(typeof data?.href === "string" ? data.href : mockSetup);
    } catch {
      router.push(mockSetup);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} disabled={busy} aria-busy={busy} onClick={() => void open()}>
      {label}
    </button>
  );
}
