"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
} from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { ReadinessScreen, ReadinessTopicRow } from "@/lib/learning/readiness-screen";
import { cn } from "@/lib/utils";

const STATE_ICON = {
  ready: CheckCircle2,
  needs_work: AlertCircle,
  unmeasured: CircleDashed,
} as const;

function TopicRow({
  topic,
  homeHref,
}: {
  topic: ReadinessTopicRow;
  homeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = STATE_ICON[topic.state];
  const color =
    topic.state === "ready"
      ? "var(--pm-success)"
      : topic.state === "needs_work"
        ? "var(--c-warning, #f59e0b)"
        : "var(--cp-muted)";

  return (
    <li className="cp-readiness-topic">
      <button
        type="button"
        className="cp-readiness-topic-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="cp-readiness-topic-icon" style={{ color }} aria-hidden />
        <span className="cp-readiness-topic-main">
          <strong>{topic.topic}</strong>
          <span className="cp-readiness-weight">
            %{topic.weightPercent}
            {topic.weightPercent >= 20 ? " · Sınavda ağırlıklı" : ""}
          </span>
          <em>{topic.detail}</em>
        </span>
        <span className="cp-readiness-topic-score">
          <span>%{topic.topicScore}</span>
          <span
            className="cp-readiness-mini-bar"
            aria-hidden
          >
            <span style={{ width: `${topic.topicScore}%`, background: color }} />
          </span>
        </span>
      </button>
      {open ? (
        <div className="cp-readiness-topic-actions">
          <a href={homeHref ?? "#"}>Dersi tekrarla</a>
          <a href={homeHref ?? "#"}>Odaklı pratik</a>
          <a href={homeHref ?? "#"}>Kartları çalış</a>
        </div>
      ) : null}
    </li>
  );
}

export function ExamReadinessScreen({
  screen,
  onContinue,
  continuing = false,
  nextHref,
  continueLabel,
}: {
  screen: ReadinessScreen;
  onContinue?: () => void;
  continuing?: boolean;
  nextHref?: string;
  /** Düğüm modunda "Sıradaki adıma geç". */
  continueLabel?: string;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

  const ringColor = screen.ready
    ? "var(--pm-success)"
    : screen.headline === "Henüz ölçüm yok"
      ? "var(--cp-muted)"
      : "var(--c-action, #3d5afe)";

  const primaryLabel = continueLabel ?? "Devam et";
  const homeAction = screen.actions.find((a) => a.href.includes("/deneme-sinavlari"));

  return (
    <section
      className={cn("cp-readiness", screen.ready && !reducedMotion && "cp-readiness--ready")}
      aria-busy={continuing || undefined}
    >
      <div className="cp-readiness-top">
        <p className="cp-lesson-kicker">Sınav günü</p>
        {screen.examDateLabel ? (
          <span className="cp-readiness-date-chip">
            <CalendarClock size={16} aria-hidden />
            {screen.examDateLabel}
          </span>
        ) : (
          <a className="cp-readiness-ghost" href={homeAction?.href ?? "#"}>
            Sınav tarihini ekle
          </a>
        )}
      </div>

      <div className={cn("pm-card cp-readiness-hero", screen.ready && "cp-readiness-hero--ready")}>
        <ProgressRing
          value={screen.headline === "Henüz ölçüm yok" ? 0 : screen.readinessPct}
          size={168}
          strokeWidth={10}
          color={ringColor}
        >
          <span className="cp-readiness-pct">%{screen.readinessPct}</span>
          <span className="cp-readiness-pct-label">hazırlık</span>
        </ProgressRing>
        <div className="cp-readiness-hero-copy">
          <h1>
            {screen.ready ? "Hazırsın 😎" : screen.headline}
          </h1>
          <p className="cp-readiness-lead">{screen.lead}</p>
          <p className="cp-readiness-mock">{screen.mockLine}</p>
        </div>
      </div>

      <div className="pm-card cp-readiness-topics-card">
        <h2>Konu konu durum</h2>
        <ul className="cp-readiness-topic-list">
          {screen.topics.map((topic) => (
            <TopicRow key={topic.topic} topic={topic} homeHref={homeAction?.href} />
          ))}
        </ul>
      </div>

      <div className="pm-card cp-readiness-next-card">
        <h2>Şimdi ne yapmalısın?</h2>
        <ol className="cp-readiness-actions-list">
          {screen.actions.map((action, index) => (
            <li key={action.href + action.label}>
              <a
                href={action.href}
                className={cn(
                  "cp-readiness-action-row",
                  (action.primary || index === 0) && "cp-readiness-action-row--primary",
                )}
              >
                <span className="cp-readiness-action-num" aria-hidden>
                  {index + 1}
                </span>
                <span>{action.label}</span>
                <ChevronRight size={18} aria-hidden />
              </a>
            </li>
          ))}
        </ol>
      </div>

      <details className="cp-readiness-formula">
        <summary>Bu yüzde nasıl hesaplanıyor?</summary>
        <ul>
          {screen.formulaExplained.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <div className="cp-readiness-footer">
        {onContinue ? (
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            disabled={continuing}
            aria-busy={continuing}
            onClick={onContinue}
          >
            {continuing ? "Kaydediliyor…" : primaryLabel}
          </button>
        ) : nextHref ? (
          <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            {primaryLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
