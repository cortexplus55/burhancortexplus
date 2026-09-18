"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function ExamTopicPick({
  prepId,
  topics,
}: {
  prepId: string;
  topics: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(topicId: string) {
    setBusy(topicId);
    try {
      const res = await fetch("/api/learning/exam-prep/select-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, topicId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Konu seçilemedi.");
        return;
      }
      router.push(payload.nextHref ?? `/deneme-sinavlari/${prepId}`);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cp-exam-page">
      <div className="cp-exam-study-bar mb-2">
        <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
          ← Geri
        </Link>
      </div>
      <h1>Konu seç</h1>
      <p className="cp-wizard-lead">Bu sınavın konularından birini seç; önce 5 soruluk tanışma testi gelir.</p>
      <ol className="cp-topic-pick">
        {topics.map((topic, index) => (
          <li key={topic.id}>
            <button
              type="button"
              className="cp-topic-pick-item"
              disabled={Boolean(busy)}
              onClick={() => void pick(topic.id)}
            >
              <span className="cp-topic-num">{index + 1}</span>
              <strong>{topic.label}</strong>
              <span aria-hidden>→</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
