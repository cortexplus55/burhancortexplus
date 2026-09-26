"use client";

import { useRouter } from "next/navigation";

export function ExamFinishButton({
  prepId,
  label = "Sınavla bitir",
  className = "cp-finish-exam-btn",
}: {
  prepId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => router.push(`/deneme-sinavlari/${prepId}/deneme/kurulum`)}
    >
      {label}
    </button>
  );
}
