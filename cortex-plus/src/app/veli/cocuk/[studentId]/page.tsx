import Link from "next/link";
import { notFound } from "next/navigation";
import { ParentShell } from "@/components/layout/parent-shell";
import {
  StatGrid,
  StudyStrip,
  TopicBars,
} from "@/components/parent/child-progress-card";
import { requireParent } from "@/lib/auth/session";
import { getChildSummary } from "@/lib/parent/child-summary";
import {
  childAvatarLabel,
  childMetaLine,
  firstLinkedProfile,
} from "@/lib/parent/child-profile";
import { formatDateShort } from "@/lib/format";
import { UnlinkChildButton } from "@/components/parent/unlink-child-button";

export const metadata = { title: "Çocuk detayı" };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  if (!UUID.test(studentId)) notFound();

  const { supabase, user } = await requireParent();

  const { data: link } = await supabase
    .from("parent_student_links")
    .select(
      "id, status, profiles!parent_student_links_student_id_fkey(full_name, grade_level, school_name, avatar_url)",
    )
    .eq("parent_id", user.id)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!link || link.status !== "active") notFound();

  const child = firstLinkedProfile(link.profiles);
  const summary = await getChildSummary(user.id, studentId, {
    examLimit: 10,
    topicLimit: 8,
    activityDays: 30,
    includeOpenTasks: true,
    includeQuizzes: true,
  });

  if (!summary) notFound();

  const name = child?.full_name ?? "Öğrenci";
  const activeStudyDays = summary.studyDayFlags.filter(Boolean).length;

  return (
    <ParentShell title={name}>
      <Link
        href="/veli"
        className="text-xs font-medium text-[var(--astra-muted)]"
      >
        ← Çocuklarım
      </Link>

      <section className="mt-4 flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-800/90 text-xl">
          {childAvatarLabel(child)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{name}</h1>
          <p className="truncate text-sm text-[var(--astra-muted)]">
            {childMetaLine(child)}
          </p>
        </div>
        {summary.hasPlus ? (
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            {summary.planBadge ?? "Plus"}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-[var(--astra-border)] px-2.5 py-1 text-[11px] text-[var(--astra-muted)]">
            Ücretsiz
          </span>
        )}
      </section>

      <p className="mt-3 text-xs text-[var(--astra-muted)]">
        Sohbet içerikleri gizli. Burada yalnızca onaylı ilerleme özeti var.
      </p>

      <section className="mt-6 astra-pay-card space-y-5 p-4">
        <StatGrid summary={summary} />
        <StudyStrip
          flags={summary.studyDayFlags}
          activeDays={activeStudyDays}
          days={summary.studyDayFlags.length}
        />
      </section>

      <section className="mt-4 astra-pay-card p-4">
        <h2 className="text-sm font-semibold">Zayıf konular</h2>
        <div className="mt-3">
          <TopicBars topics={summary.topics} />
        </div>
      </section>

      <section className="mt-4 astra-pay-card p-4">
        <h2 className="text-sm font-semibold">Denemeler</h2>
        {summary.recentExams.length ? (
          <ul className="mt-3 space-y-2">
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
          <p className="mt-2 text-xs text-[var(--astra-muted)]">
            Son 30 günde tamamlanmış deneme yok.
          </p>
        )}
      </section>

      <section className="mt-4 astra-pay-card p-4">
        <h2 className="text-sm font-semibold">Quizler</h2>
        {summary.recentQuizzes.length ? (
          <ul className="mt-3 space-y-2">
            {summary.recentQuizzes.map((quiz, index) => (
              <li
                key={`${quiz.title}-${quiz.at ?? index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{quiz.title}</span>
                <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                  {quiz.score != null ? `${quiz.score}` : "—"} ·{" "}
                  {formatDateShort(quiz.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--astra-muted)]">
            Son 30 günde quiz yok.
          </p>
        )}
      </section>

      <section className="mt-4 astra-pay-card p-4">
        <h2 className="text-sm font-semibold">Açık görevler</h2>
        {summary.openTaskItems.length ? (
          <ul className="mt-3 space-y-2">
            {summary.openTaskItems.map((task, index) => (
              <li
                key={`${task.title}-${index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="shrink-0 text-xs text-[var(--astra-muted)]">
                  {task.dueDate ? formatDateShort(task.dueDate) : "Tarih yok"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--astra-muted)]">
            Açık çalışma görevi yok.
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-3">
        <Link
          href="/veli/sor"
          className="astra-btn-primary flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
        >
          Nasıl destek olurum?
        </Link>
        {summary.hasPlus ? (
          <Link
            href={`/veli/plus?ogrenci=${studentId}`}
            className="flex w-full items-center justify-center rounded-full border border-[var(--astra-border)] py-3 text-sm"
          >
            Aboneliği yönet
          </Link>
        ) : (
          <Link
            href={`/veli/plus?ogrenci=${studentId}`}
            className="flex w-full items-center justify-center rounded-full border border-[var(--astra-border)] py-3 text-sm"
          >
            Bu çocuk için Plus al
          </Link>
        )}
        <UnlinkChildButton
          linkId={link.id as string}
          childName={name}
        />
      </div>
    </ParentShell>
  );
}
