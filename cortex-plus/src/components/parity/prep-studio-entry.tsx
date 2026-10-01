"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { examPrepPodcastHref } from "@/lib/learning/exam-prep-hrefs";
import { PodcastFormatPicker } from "@/components/parity/podcast-format-picker";
import { DEFAULT_PODCAST_LENGTH, type PodcastLength } from "@/lib/learning/podcast-formats";

export type PrepTopicOption = { id: string; label: string };

/**
 * Podcast sayfasının konu seçicisi. Ders oluşturma merkezi buraya link verir;
 * yoldaki kilitli adımlara dokunmaz.
 */
export function PrepPodcastPicker({
  prepId,
  topics,
}: {
  prepId: string;
  topics: PrepTopicOption[];
}) {
  const router = useRouter();
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [length, setLength] = useState<PodcastLength>(DEFAULT_PODCAST_LENGTH);

  if (!topics.length) {
    return (
      <section className="cp-studio" aria-label="Podcast oluştur">
        <p>Podcast için önce bir konu gerekli.</p>
      </section>
    );
  }

  return (
    <section className="cp-exam-page cp-studio" aria-label="Podcast oluştur">
      <h1>Podcast oluştur</h1>
      <div className="cp-studio-panel">
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
        <PodcastFormatPicker value={length} onChange={setLength} />
        <button
          type="button"
          className="cp-exam-continue cp-exam-continue--primary"
          disabled={!topicId}
          onClick={() => router.push(examPrepPodcastHref(prepId, topicId, length))}
        >
          Podcast oluştur
        </button>
      </div>
    </section>
  );
}
