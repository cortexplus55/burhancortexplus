"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  describeGenerationFailure,
  generationFailureCode,
} from "@/lib/learning/generation-failure";

export type PrepTopicOption = { id: string; label: string };

/**
 * Yoldaki adımlar kilitli kalır. Öğrenci buradan istediği konu için
 * podcast veya ders açar; düğüm durumu değişmez.
 */
export function PrepStudioEntry({
  prepId,
  topics,
}: {
  prepId: string;
  topics: PrepTopicOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [kind, setKind] = useState<"podcast" | "lesson">("podcast");
  const [length, setLength] = useState<"ozet" | "standart" | "derin">("standart");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!topics.length) return null;

  async function createLesson() {
    const res = await fetch("/api/learning/exam-prep/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, topicId }),
    });
    const data = (await res.json().catch(() => ({}))) as { lessonId?: string; code?: string; error?: string };
    if (!res.ok || !data.lessonId) {
      const failure = describeGenerationFailure(generationFailureCode(data), undefined, "lesson");
      setError(failure.message);
      return;
    }
    router.push(`/deneme-sinavlari/${prepId}/ders/${data.lessonId}`);
  }

  async function create() {
    if (busy || !topicId) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "lesson") {
        await createLesson();
        return;
      }
      const params = new URLSearchParams({ topicId, length });
      router.push(`/deneme-sinavlari/${prepId}/podcast?${params.toString()}`);
    } catch {
      setError("Bağlantı kurulamadı. Yeniden deneyebilirsin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cp-studio" aria-label="Podcast veya ders oluştur">
      <button type="button" className="cp-exam-continue" onClick={() => setOpen((value) => !value)}>
        Podcast / Ders oluştur
      </button>
      {open ? (
        <div className="cp-studio-panel">
          <p className="text-sm text-[var(--cp-muted)]">
            Yoldaki kilitli adımlar durur. Buradan istediğin konu için podcast veya ders açabilirsin.
          </p>
          <label className="cp-field">
            <span>Konu</span>
            <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="cp-pod-lengths">
            <legend>Tür</legend>
            <label>
              <input
                type="radio"
                name="studio-kind"
                checked={kind === "podcast"}
                onChange={() => setKind("podcast")}
              />
              Podcast
            </label>
            <label>
              <input
                type="radio"
                name="studio-kind"
                checked={kind === "lesson"}
                onChange={() => setKind("lesson")}
              />
              Ders
            </label>
          </fieldset>
          {kind === "podcast" ? (
            <fieldset className="cp-pod-lengths">
              <legend>Süre</legend>
              {(
                [
                  ["ozet", "Özet · ~1 dk"],
                  ["standart", "Standart · ~5 dk"],
                  ["derin", "Derinlemesine · ~10 dk"],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="studio-length"
                    checked={length === value}
                    onChange={() => setLength(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            disabled={busy || !topicId}
            onClick={() => void create()}
          >
            {busy ? "Hazırlanıyor…" : "Oluştur"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
