"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PREP_HOME_COPY } from "@/lib/learning/exam-wizard-copy";
import type { PrepProgressView } from "@/lib/learning/prep-progress-view";

const TICKS = 40;

/**
 * Hazırlığın İlerleme sekmesi — Astra düzeni (29 Eylül 2026).
 * Hesap `buildPrepProgressView` içinde; bu bileşen yalnızca çiziyor.
 */
export function ExamPrepProgress({
  view,
  daysLabel,
  warnings,
  reviewsHref,
  mockHref,
  onCreate,
}: {
  view: PrepProgressView;
  daysLabel: string;
  warnings: Record<string, string>;
  /** Yanlışlar ekranı; yoksa bağlantı çizilmez. */
  reviewsHref: string | null;
  /** Deneme başlatılacak yer (yazılı deneme düğümü). */
  mockHref: string | null;
  onCreate: (label: string) => void;
}) {
  const [pane, setPane] = useState<"duzey" | "denemeler" | "tempo">("duzey");
  const lit = Math.round((view.scorePct / 100) * TICKS);
  const maxWeek = Math.max(1, ...view.tempo.weeks.map((week) => week.activities));

  return (
    <section className="cp-prog" aria-label="İlerleme">
      <div className="cp-prog-card">
        <div className="cp-prog-head">
          <div>
            <p className="cp-prog-kicker">Hazırlık puanı</p>
            <p className="cp-prog-score">
              <strong>{view.scorePct}</strong>
              <span>%</span>
            </p>
          </div>
          <div className="cp-prog-chips">
            <span className="cp-prog-chip">
              {view.weekActivities > 0
                ? `bu hafta ${view.weekActivities} etkinlik`
                : "bu hafta değişiklik yok"}
            </span>
            <span className="cp-prog-chip cp-prog-chip--muted">hedef %{view.targetPct}</span>
            {daysLabel ? <span className="cp-prog-chip cp-prog-chip--muted">{daysLabel}</span> : null}
          </div>
        </div>
        <div
          className="cp-prog-ticks"
          role="img"
          aria-label={`Hazırlık puanı yüzde ${view.scorePct}, hedef yüzde ${view.targetPct}`}
        >
          {Array.from({ length: TICKS }, (_, index) => (
            <span key={index} className={cn(index < lit && "is-on")} />
          ))}
          <span className="cp-prog-target" style={{ left: `${view.targetPct}%` }} aria-hidden />
        </div>
        <p className="cp-prog-basis">{view.scoreBasis}</p>
        <div className="cp-prog-stats">
          <div>
            <strong>
              {view.topicsAtTarget} / {view.topicCount}
            </strong>
            <span>hedefe ulaşan konu</span>
          </div>
          <div>
            <strong>{view.lessonsDone}</strong>
            <span>ders</span>
          </div>
        </div>
      </div>

      <div className="cp-exam-tabs" role="tablist" aria-label="İlerleme görünümü">
        {(
          [
            ["duzey", "Hazırlık düzeyi"],
            ["denemeler", "Denemeler"],
            ["tempo", "Tempo"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pane === id}
            className={cn("cp-exam-tab", pane === id && "is-active")}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "duzey" ? (
        <>
          <div className="cp-prog-block">
            <p className="cp-prog-kicker">Sınav günü için tahmin</p>
            {view.forecast.kind === "ready" ? (
              <>
                <h3>%{view.forecast.pct}</h3>
                <p>{view.forecast.text}</p>
              </>
            ) : (
              <>
                <h3>Tahmin, ilk derslerinden sonra görünür</h3>
                <p>{view.forecast.reason}</p>
              </>
            )}
          </div>

          <div className="cp-prog-block">
            <p className="cp-prog-kicker">Bilgi eksikleri</p>
            {view.gaps.length ? (
              <>
                <h3>{view.gaps.length} eksik belirlendi</h3>
                <ul className="cp-prog-gaps">
                  {view.gaps.map((gap, index) => (
                    <li key={`${gap.claim}-${index}`}>
                      {gap.topicLabel ? <span>{gap.topicLabel}</span> : null}
                      {gap.claim}
                    </li>
                  ))}
                </ul>
                {reviewsHref ? (
                  <Link href={reviewsHref} className="cp-back-pill">
                    Yanlışlarını çalış
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <h3>Henüz eksik belirlenmedi</h3>
                <p>Bu sınav hazırlığındaki ilk derslerini tamamlayınca eksiklerin görünür.</p>
              </>
            )}
          </div>

          <div className="cp-prog-block">
            <p className="cp-prog-kicker">Konular ve dersler</p>
            <h3>
              {view.topicCount} konudan {view.topicsAtTarget} tanesi hedefte
            </h3>
            {view.topics.length ? (
              <ul className="cp-prog-topics" aria-label={PREP_HOME_COPY.skillTree}>
                {view.topics.map((topic) => (
                  <li key={topic.label}>
                    <div className="cp-prog-topic-row">
                      <strong>{topic.label}</strong>
                      <span>%{topic.pct}</span>
                    </div>
                    <div className="cp-prog-topic-bar" aria-hidden>
                      <span style={{ width: `${topic.pct}%` }} />
                      <i style={{ left: `${view.targetPct}%` }} />
                    </div>
                    <p className="cp-prog-topic-meta">
                      {topic.lessons > 0
                        ? `${topic.solved} çözüldü · ${topic.lessons} ders`
                        : "henüz ders yok"}
                    </p>
                    {warnings[topic.label] ? (
                      <p className="cp-topic-warning">{warnings[topic.label]}</p>
                    ) : null}
                    <button
                      type="button"
                      className="cp-prog-topic-create"
                      onClick={() => onCreate(topic.label)}
                    >
                      {topic.label} için ders oluştur
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{PREP_HOME_COPY.noTopics}</p>
            )}
          </div>

          {view.weeks.rows.length ? (
            <div className="cp-prog-block">
              <p className="cp-prog-kicker">Haftalara göre konular</p>
              <h3>Hangi konulara tekrar tekrar döndüğünü gör</h3>
              <p>Son 5 haftada konu başına biten etkinlik</p>
              <div className="cp-prog-table-wrap">
                <table className="cp-prog-table">
                  <thead>
                    <tr>
                      <th scope="col">Konu</th>
                      {view.weeks.labels.map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                      <th scope="col">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.weeks.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {row.counts.map((count, index) => (
                          <td key={index} className={cn(count > 0 && "is-on", count >= 3 && "is-hot")}>
                            {count}
                          </td>
                        ))}
                        <td>{row.pct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {pane === "denemeler" ? (
        <div className="cp-prog-block">
          <p className="cp-prog-kicker">Denemeler</p>
          {view.mocks.length ? (
            <ul className="cp-prog-mocks">
              {view.mocks.map((mock) => (
                <li key={`${mock.title}-${mock.date}`}>
                  <span>
                    <strong>{mock.title}</strong>
                    <em>
                      {new Date(mock.date).toLocaleDateString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                        day: "numeric",
                        month: "long",
                      })}
                    </em>
                  </span>
                  <b>%{mock.pct}</b>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <h3>Henüz deneme çözmedin</h3>
              <p>Yazılı deneme bitirdiğinde sonuçların burada sıralanır.</p>
            </>
          )}
          {mockHref ? (
            <Link href={mockHref} className="cp-back-pill">
              Deneme çöz
            </Link>
          ) : null}
        </div>
      ) : null}

      {pane === "tempo" ? (
        <div className="cp-prog-block">
          <p className="cp-prog-kicker">Tempo</p>
          <h3>
            {view.tempo.thisWeekMinutes > 0
              ? `Bu hafta yaklaşık ${view.tempo.thisWeekMinutes} dk`
              : "Bu hafta henüz çalışma yok"}
          </h3>
          <p>
            {view.tempo.dailyGoalMinutes
              ? `Günlük hedefin ${view.tempo.dailyGoalMinutes} dk.`
              : "Günlük hedefini hazırlık ayarlarından belirleyebilirsin."}
          </p>
          <ul className="cp-prog-tempo" aria-label="Son 5 haftada biten etkinlik">
            {view.tempo.weeks.map((week) => (
              <li key={week.label}>
                <span className="cp-prog-tempo-bar" aria-hidden>
                  <span style={{ height: `${Math.round((week.activities / maxWeek) * 100)}%` }} />
                </span>
                <strong>{week.activities}</strong>
                <em>{week.label}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
