"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ExamTopicPick({
  prepId,
  topics,
}: {
  prepId: string;
  topics: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [hot, setHot] = useState(topics[0]?.id ?? null);

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

  const backHref = `/deneme-sinavlari/${prepId}`;

  return (
    <div className="cp-exam-page cp-topic-pick-page">
      <div className="cp-topic-pick-top">
        <Link href={backHref} className="cp-back-pill">
          ← Geri
        </Link>
        <Link href={backHref} className="cp-topic-pick-x" aria-label="Kapat">
          <X className="h-4 w-4" />
        </Link>
      </div>
      <h1>Konu seç</h1>
      <p className="cp-topic-pick-lead">
        Bu sınavın konularından birini seç; önce 5 soruluk tanışma testi gelir.
      </p>
      <ol className="cp-topic-pick">
        {topics.map((topic, index) => (
          <li key={topic.id}>
            <button
              type="button"
              className={cn(
                "cp-topic-pick-item",
                (hot === topic.id || busy === topic.id) && "is-hot",
              )}
              disabled={Boolean(busy)}
              onFocus={() => setHot(topic.id)}
              onClick={() => void pick(topic.id)}
            >
              <span className="cp-topic-num">{index + 1}</span>
              <strong>{topic.label}</strong>
              <span className="cp-topic-chevron" aria-hidden>
                →
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
