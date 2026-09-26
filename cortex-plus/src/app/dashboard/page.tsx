import Link from "next/link";
import { Flame } from "lucide-react";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadLearningHub } from "@/lib/learning/learning-hub";
import { formatProgressLine } from "@/lib/learning/progress-line";

export const metadata = { title: "Ana Sayfa" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireStudentArea();
  const [shell, hub] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadLearningHub(supabase, user.id, user.email),
  ]);

  const countdownCta =
    hub.countdown.state === "missing" || hub.countdown.state === "past"
      ? hub.countdown.addHref
      : null;
  const progressLine = formatProgressLine(hub.progress);

  return (
    <ParitySorShell {...shell}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 pb-24">
        <header className="space-y-1">
          <p className="text-sm text-[var(--cs-muted)]">
            {hub.firstName ? `Merhaba ${hub.firstName}` : "Merhaba"}
          </p>
          {countdownCta ? (
            <Link
              href={countdownCta}
              className="block font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--cs-text)] underline-offset-4 hover:underline"
            >
              {hub.countdown.label}
            </Link>
          ) : (
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-[var(--cs-text)]">
              {hub.countdown.label}
            </h1>
          )}
          <p className="text-base text-[var(--cs-text)]">
            Hazırlık seviyesi %{hub.readiness.pct}
            <span className="ml-2 text-sm text-[var(--cs-muted)]">
              · Bugünkü çalışma: {hub.totalMinutes} dakika
            </span>
          </p>
          <details className="text-xs text-[var(--cs-muted)]">
            <summary className="cursor-pointer rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
              Bu yüzde nasıl hesaplandı?
            </summary>
            <p className="mt-1">{hub.readiness.explanation}</p>
          </details>
        </header>

        <div>
          <Link
            href={hub.nextBestAction.href}
            aria-describedby="nba-reason"
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-action px-6 py-3 text-base font-bold text-action-foreground transition-colors hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]"
          >
            {hub.nextBestAction.label}
          </Link>
          <p id="nba-reason" className="mt-2 text-center text-xs text-[var(--cs-muted)]">
            {hub.nextBestAction.reason}
          </p>
        </div>

        <section aria-labelledby="today-plan-heading" className="space-y-3">
          <h2
            id="today-plan-heading"
            className="text-sm font-semibold uppercase tracking-wide text-[var(--cs-muted)]"
          >
            Bugünün görevleri
          </h2>
          <ol className="space-y-2">
            {hub.todaysTasks.map((task, index) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06]"
                >
                  <span className="text-sm text-[var(--cs-text)]">
                    <span className="mr-2 text-[var(--cs-muted)]">{index + 1}.</span>
                    {task.title}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--cs-muted)]">
                    {task.minutes} dk
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {hub.weakTopics.length > 0 ? (
          <section aria-labelledby="weak-heading" className="space-y-3">
            <h2
              id="weak-heading"
              className="text-sm font-semibold text-[var(--cs-text)]"
            >
              En çok çalışman gereken konular
            </h2>
            <ul className="space-y-2">
              {hub.weakTopics.map((topic, i) => (
                <li
                  key={topic.topicLabel}
                  className="flex items-center justify-between gap-3 rounded-xl px-1 py-1"
                >
                  <span className="text-sm text-[var(--cs-text)]">
                    {i + 1}. {topic.topicLabel}
                    <span className="ml-2 text-xs text-[var(--cs-muted)]">
                      {topic.reason}
                    </span>
                  </span>
                  <Link
                    href={topic.studyHref}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-[var(--cs-text)] hover:border-amber-500/50"
                  >
                    Çalış
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {progressLine ? (
          <section aria-labelledby="progress-heading" className="space-y-1">
            <h2
              id="progress-heading"
              className="text-sm font-semibold text-[var(--cs-muted)]"
            >
              Son ilerleme
            </h2>
            <p className="text-sm text-[var(--cs-text)]">{progressLine}</p>
          </section>
        ) : null}

        {hub.streak > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--cs-muted)]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 text-orange-200">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {hub.streak} gündür çalışıyorsun
            </span>
          </div>
        ) : null}

        {hub.recentDocuments.length > 0 ? (
          <section aria-labelledby="docs-heading" className="space-y-2">
            <h2 id="docs-heading" className="text-sm font-semibold text-[var(--cs-muted)]">
              Son belgeler
            </h2>
            <ul className="space-y-1">
              {hub.recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/dokumanlar/${doc.id}`}
                    className="block truncate text-sm text-[var(--cs-text)] underline-offset-2 hover:underline"
                  >
                    {doc.fileName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav
          aria-label="Diğer bölümler"
          className="flex flex-wrap gap-2 border-t border-white/10 pt-4"
        >
          {hub.secondary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--cs-muted)] transition-colors hover:border-white/25 hover:text-[var(--cs-text)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </ParitySorShell>
  );
}
