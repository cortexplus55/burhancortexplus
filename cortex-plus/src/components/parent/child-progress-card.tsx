import Link from "next/link";
import type { ChildSummary } from "@/lib/parent/child-summary";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChildProgressCard({
  name,
  meta,
  avatar,
  summary,
}: {
  name: string;
  meta: string;
  avatar: string;
  summary: ChildSummary | null;
}) {
  const activeStudyDays = summary?.studyDayFlags.filter(Boolean).length ?? 0;

  return (
    <article className="astra-pay-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-800/90 text-lg">
          {avatar}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-[var(--astra-muted)]">{meta}</p>
        </div>
        {summary?.hasPlus ? (
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            {summary.planBadge ?? "Plus"}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-[var(--astra-border)] px-2.5 py-1 text-[11px] text-[var(--astra-muted)]">
            Ücretsiz
          </span>
        )}
      </div>

      {summary ? (
        <ChildSummaryBlock
          summary={summary}
          activeStudyDays={activeStudyDays}
        />
      ) : (
        <p className="mt-3 text-xs text-[var(--astra-muted)]">
          Özet yüklenemedi. Onaylı bağlantıyı kontrol et.
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--astra-muted)]">
        Sohbet içerikleri gizlidir; yalnızca ilerleme özeti paylaşılır.
      </p>

      {summary && !summary.hasPlus ? (
        <Link
          href="/veli/plus"
          className="mt-3 inline-flex text-xs font-semibold text-[var(--astra-primary)]"
        >
          Bu çocuk için Plus al
        </Link>
      ) : null}
    </article>
  );
}

function ChildSummaryBlock({
  summary,
  activeStudyDays,
}: {
  summary: ChildSummary;
  activeStudyDays: number;
}) {
  const stats = [
    { label: "Aktif gün", value: `${summary.activeDays}` },
    {
      label: "Deneme",
      value: summary.averageScore
        ? `${summary.examAttempts} · ort ${summary.averageScore}`
        : `${summary.examAttempts}`,
    },
    { label: "Quiz", value: `${summary.quizAttempts}` },
    { label: "Açık görev", value: `${summary.openTasks}` },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs text-[var(--astra-muted)]">Son 30 gün</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[var(--astra-border)] p-2 text-center"
            >
              <p className="text-sm font-semibold">{stat.value}</p>
              <p className="mt-0.5 text-[10px] text-[var(--astra-muted)]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-[var(--astra-muted)]">
          Çalışma günleri · son 14 gün · {activeStudyDays} aktif
        </p>
        <div
          className="mt-2 flex gap-1"
          role="img"
          aria-label={`Son 14 günde ${activeStudyDays} aktif çalışma günü`}
        >
          {summary.studyDayFlags.map((on, index) => (
            <span
              key={index}
              className={cn(
                "h-7 flex-1 rounded-[3px]",
                on ? "bg-amber-400" : "bg-white/10",
              )}
            />
          ))}
        </div>
      </div>

      {summary.topics.length ? (
        <div>
          <p className="text-xs text-[var(--astra-muted)]">
            Desteğe ihtiyaç duyduğu konular
          </p>
          <ul className="mt-2 space-y-2">
            {summary.topics.map((topic) => {
              const pct = Math.min(100, Math.round(topic.severity * 100));
              return (
                <li key={topic.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{topic.label}</span>
                    <span className="text-[var(--astra-muted)]">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="text-xs text-[var(--astra-muted)]">Son denemeler</p>
        {summary.recentExams.length ? (
          <ul className="mt-2 space-y-2">
            {summary.recentExams.map((exam, index) => (
              <li
                key={`${exam.title}-${exam.at ?? index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{exam.title}</span>
                <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                  {exam.score != null ? `${exam.score}` : "—"} ·{" "}
                  {formatDateShort(exam.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-[var(--astra-muted)]">
            Son 30 günde tamamlanmış deneme yok.
          </p>
        )}
      </div>
    </div>
  );
}
