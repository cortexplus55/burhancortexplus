"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PrepTopic } from "@/lib/learning/exam-prep-progress";

export function ExamPrepPath({
  prepId,
  topics,
  activeId,
}: {
  prepId: string;
  topics: PrepTopic[];
  activeId?: string | null;
}) {
  const router = useRouter();

  if (!topics.length) {
    return (
      <p className="text-sm text-[var(--ap-muted)]">
        Bu hazırlıkta henüz konu yok. Yeni bir hazırlık oluştur.
      </p>
    );
  }

  return (
    <ol className="ap-topic-path">
      {topics.map((topic, index) => {
        const href = `/deneme-sinavlari/${prepId}/calis?topic=${topic.id}`;
        const state =
          topic.id === activeId
            ? "on"
            : topic.status === "done"
              ? "done"
              : topic.status === "in_progress"
                ? "now"
                : "ready";
        return (
          <li key={topic.id}>
            <button
              type="button"
              className={cn("ap-topic-path-item", `ap-topic-path-item--${state}`)}
              aria-current={topic.id === activeId ? "page" : undefined}
              onClick={() => router.push(href, { scroll: false })}
            >
              <span className="ap-topic-num" aria-hidden>
                {topic.status === "done" ? "✓" : index + 1}
              </span>
              <span className="ap-topic-path-copy">
                <strong>{topic.label}</strong>
                <em>
                  {topic.id === activeId
                    ? "Şu an"
                    : topic.status === "done"
                      ? "Tamamlandı"
                      : topic.lessonId
                        ? "Ders hazır · devam et"
                        : "Dersi aç"}
                </em>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
