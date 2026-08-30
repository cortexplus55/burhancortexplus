"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function ExamFinishButton({
  prepId,
  label = "Sınavla bitir",
  className = "ap-finish-exam-btn",
}: {
  prepId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startExam() {
    setLoading(true);
    try {
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
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => void startExam()}
    >
      {loading ? "Hazırlanıyor…" : label}
    </button>
  );
}
