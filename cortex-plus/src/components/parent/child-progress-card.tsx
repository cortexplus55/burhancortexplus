import Link from "next/link";
import type { ChildSummary } from "@/lib/parent/child-summary";
import { cn } from "@/lib/utils";

export function ChildProgressCard({
  name,
  meta,
  avatar,
  summary,
  href,
  plusHref = "/veli/plus",
}: {
  name: string;
  meta: string;
  avatar: string;
  summary: ChildSummary | null;
  href: string;
  plusHref?: string;
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
        <div className="mt-4 space-y-4">
          <StatGrid summary={summary} />
          <StudyStrip
            flags={summary.studyDayFlags}
            activeDays={activeStudyDays}
            days={summary.studyDayFlags.length}
          />
          {summary.topics.length ? (
            <div className="flex flex-wrap gap-1.5">
              {summary.topics.map((topic) => (
                <span
                  key={topic.label}
                  className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300"
                >
                  {topic.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--astra-muted)]">
          Özet yüklenemedi. Onaylı bağlantıyı kontrol et.
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--astra-muted)]">
        Sohbet içerikleri gizlidir.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={href}
          className="text-xs font-semibold text-[var(--astra-primary)]"
        >
          Detayı gör
        </Link>
        {summary && !summary.hasPlus ? (
          <Link
            href={plusHref}
            className="text-xs font-semibold text-[var(--astra-muted)]"
          >
            Plus al
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function StatGrid({ summary }: { summary: ChildSummary }) {
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
  );
}

export function StudyStrip({
  flags,
  activeDays,
  days,
}: {
  flags: boolean[];
  activeDays: number;
  days: number;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--astra-muted)]">
        Çalışma günleri · son {days} gün · {activeDays} aktif
      </p>
      <div
        className="mt-2 flex gap-0.5"
        role="img"
        aria-label={`Son ${days} günde ${activeDays} aktif çalışma günü`}
      >
        {flags.map((on, index) => (
          <span
            key={index}
            className={cn(
              "h-7 flex-1 rounded-[2px]",
              on ? "bg-amber-400" : "bg-white/10",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function TopicBars({
  topics,
}: {
  topics: ChildSummary["topics"];
}) {
  if (!topics.length) {
    return (
      <p className="text-xs text-[var(--astra-muted)]">
        Henüz zayıf konu analizi yok.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {topics.map((topic) => {
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
  );
}
