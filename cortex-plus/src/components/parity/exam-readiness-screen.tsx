"use client";

import type { ReadinessScreen } from "@/lib/learning/readiness-screen";

const STATE_LABEL = {
  ready: "✅ Sağlam",
  needs_work: "Çalışılacak",
  unmeasured: "Ölçülmedi",
} as const;

const GROUP_TITLE = {
  ready: "✅ Sağlam konular",
  needs_work: "Çalışılacak / Tekrar edilecek",
  unmeasured: "Henüz ölçülmedi",
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
  const groups = (["ready", "needs_work", "unmeasured"] as const)
    .map((state) => ({ state, topics: screen.topics.filter((topic) => topic.state === state) }))
    .filter((group) => group.topics.length > 0);
  return (
    <section className={screen.ready ? "cp-readiness cp-readiness--ready" : "cp-readiness"}>
      <p className="cp-lesson-kicker">Sınav günü</p>
      <h1>{screen.headline}</h1>
      <p>{screen.lead}</p>
      <p>{screen.mockLine}</p>
      {groups.map((group) => (
        <div key={group.state}>
          <h2>{GROUP_TITLE[group.state]}</h2>
          <ul>
            {group.topics.map((topic) => (
              <li key={topic.topic}>
                <strong>
                  {topic.topic} · {STATE_LABEL[topic.state]}
                  {topic.state === "unmeasured" ? null : ` · %${topic.pct}`}
                </strong>
                <span>{topic.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
            {continuing ? "Kaydediliyor…" : "Adımı tamamla"}
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
