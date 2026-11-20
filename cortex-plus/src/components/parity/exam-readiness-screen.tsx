"use client";

import { NetCard } from "@/components/level-check/mastery-map";
import { REPORT_CARD_COPY, type ReadinessScreen, type ReadinessTopicRow } from "@/lib/learning/readiness-screen";
import { BADGE_LABEL, ILLUSION_OF_COMPETENCE_LINE, type MasteryBadge } from "@/lib/learning/mastery-policy";
import "@/styles/level-check.css";
import "@/styles/report-card.css";

/** Konu haritasının grup sırası: önce çalışılacaklar, en sonda öğrenilenler. */
const GROUP_ORDER: MasteryBadge[] = ["weak", "developing", "unmeasured", "learned"];

const GROUP_TITLE: Record<MasteryBadge, string> = {
  weak: "Zayıf konular",
  developing: "Gelişen konular",
  unmeasured: "Henüz ölçülmedi",
  learned: "Öğrendiğin konular",
};

/**
 * Yol sonu "Akıllı Kavrama Karnesi" (Faz 4, 19 Kasım 2026). Üstte "X / Y Konuyu Öğrendin" + renk kodlu konu haritası
 * + tahmini net (hazırlık sayfasıyla aynı kart; veri yoksa uydurma yok). Tuzak konu varsa kehribar şerit. Kutlama
 * yalnız bütün planlı konular "Öğrendin" iken. Alt çubuk 390 px'te alt alta, masaüstünde yan yana.
 */
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
  const groups = GROUP_ORDER.map((badge) => ({ badge, topics: screen.topics.filter((topic) => topic.badge === badge) })).filter(
    (group) => group.topics.length > 0,
  );
  const hero = screen.hero ?? { learned: 0, total: screen.topics.length, line: REPORT_CARD_COPY.heroLine(0, screen.topics.length) };
  const pct = hero.total > 0 ? Math.round((hero.learned / hero.total) * 100) : 0;
  return (
    <section className={screen.ready ? "cp-readiness cp-report cp-report--ready" : "cp-readiness cp-report"} aria-labelledby="cp-report-title">
      <header className="cp-report-hero">
        <p className="cp-report-kicker">{REPORT_CARD_COPY.kicker}</p>
        <h1 id="cp-report-title" className="cp-report-count">
          {hero.line}
        </h1>
        <div
          className="cp-report-meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={hero.total}
          aria-valuenow={hero.learned}
          aria-label={hero.line}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        {screen.ready ? <p className="cp-report-celebrate">{screen.headline}</p> : <p className="cp-report-status">{screen.headline}</p>}
        <p className="cp-report-lead">{screen.lead}</p>
        <ul className="cp-report-map" aria-label="Konu haritası">
          {screen.topics.map((topic) => (
            <li key={topic.topic} className={`cp-report-chip cp-report-chip--${topic.tone}`}>
              <span className="cp-report-chip-name">{topic.topic}</span>
              <span className="cp-report-chip-badge">
                {topic.badgeLabel}
                {topic.badge === "unmeasured" ? null : ` · %${topic.pct}`}
              </span>
            </li>
          ))}
        </ul>
        {screen.net ? (
          <div className="cp-report-net lc-box mm">
            <NetCard net={screen.net} />
          </div>
        ) : null}
      </header>

      {screen.trap ? (
        <div className="cp-report-trap" role="alert">
          <p className="cp-report-trap-title">{screen.trap.line}</p>
          <p className="cp-report-trap-body">{ILLUSION_OF_COMPETENCE_LINE}</p>
          <a href={screen.trap.action.href} className="cp-report-btn cp-report-btn--trap">
            {screen.trap.action.label}
          </a>
        </div>
      ) : null}

      <p className="cp-report-mock">{screen.mockLine}</p>

      {groups.map((group) => (
        <div key={group.badge} className="cp-report-group">
          <h2>{GROUP_TITLE[group.badge]}</h2>
          <ul>
            {group.topics.map((topic) => (
              <TopicRow key={topic.topic} topic={topic} />
            ))}
          </ul>
        </div>
      ))}

      {screen.actions.length ? (
        <div className="cp-readiness-actions cp-report-suggest">
          {screen.actions.map((action) => (
            <a key={action.href + action.label} href={action.href} className="cp-exam-continue">
              {action.label}
            </a>
          ))}
        </div>
      ) : null}

      <nav className="cp-report-bar" aria-label="Sonraki adımlar">
        {(screen.bar ?? []).map((action, index) => (
          <a
            key={action.href + action.label}
            href={action.href}
            className={index === (screen.bar?.length ?? 0) - 1 ? "cp-report-btn cp-report-btn--primary" : "cp-report-btn"}
          >
            {action.label}
          </a>
        ))}
        {onContinue ? (
          <button type="button" className="cp-report-btn cp-report-btn--quiet" disabled={continuing} onClick={onContinue}>
            {continuing ? "Kaydediliyor…" : "Adımı tamamla"}
          </button>
        ) : nextHref ? (
          <a href={nextHref} className="cp-report-btn cp-report-btn--quiet">
            Devam et
          </a>
        ) : null}
      </nav>
    </section>
  );
}

function TopicRow({ topic }: { topic: ReadinessTopicRow }) {
  return (
    <li className="cp-report-row">
      <div className="cp-report-row-head">
        <strong>{topic.topic}</strong>
        <span className={`cp-badge cp-badge--${topic.tone}`}>
          {BADGE_LABEL[topic.badge]}
          {topic.badge === "unmeasured" ? null : ` · %${topic.pct}`}
        </span>
      </div>
      <span>{topic.detail}</span>
    </li>
  );
}
