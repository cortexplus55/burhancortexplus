"use client";

import type { ReadinessScreen } from "@/lib/learning/readiness-screen";

const STATE_LABEL = {
  ready: "Hazır",
  needs_work: "Çalışılacak",
  unmeasured: "Ölçülmedi",
} as const;

export function ExamReadinessScreen({
  screen,
  onContinue,
  continuing = false,
  nextHref,
}: {
  screen: ReadinessScreen;
  onContinue?: () => void;
  continuing?: boolean;
  nextHref?: string;
}) {
  const readyTopics = screen.topics.filter((topic) => topic.state === "ready");
  const leftTopics = screen.topics.filter((topic) => topic.state !== "ready");
  return (
    <section className="cp-readiness">
      <p className="cp-lesson-kicker">Sınav günü</p>
      <h1>{screen.headline}</h1>
      <p>{screen.lead}</p>
      <p>{screen.mockLine}</p>
      {readyTopics.length ? (
        <div>
          <h2>Hazır konular</h2>
          <ul>
            {readyTopics.map((topic) => (
              <li key={topic.topic}>
                <strong>
                  {topic.topic} · {STATE_LABEL[topic.state]}
                </strong>
                <span>{topic.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {leftTopics.length ? (
        <div>
          <h2>Kalanlar</h2>
          <ul>
            {leftTopics.map((topic) => (
              <li key={topic.topic}>
                <strong>
                  {topic.topic} · {STATE_LABEL[topic.state]}
                </strong>
                <span>{topic.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="cp-readiness-actions">
        {screen.actions.map((action) => (
          <a key={action.href + action.label} href={action.href} className="cp-exam-continue">
            {action.label}
          </a>
        ))}
        {onContinue ? (
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            disabled={continuing}
            onClick={onContinue}
          >
            {continuing ? "Kaydediliyor…" : "Bu ekranı kaydet"}
          </button>
        ) : nextHref ? (
          <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            Devam et
          </a>
        ) : null}
      </div>
    </section>
  );
}
