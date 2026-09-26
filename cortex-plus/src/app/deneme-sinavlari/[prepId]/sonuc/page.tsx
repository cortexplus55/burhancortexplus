import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, ListChecks, RotateCcw } from "lucide-react";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  buildNextSteps,
  multiMcqScoringNote,
  scoreBandLabel,
  type MockTopicReportRow,
} from "@/lib/learning/mock-exam";

export const metadata = { title: "Deneme sonucu · Cortex Plus" };

export default async function ExamPrepSonucPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ examId?: string; score?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, target_score")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prep) notFound();

  type AttemptRow = {
    id: string;
    score: number | null;
    analysis: string | null;
    topic_report: unknown;
    exam_id: string;
    completed_at?: string | null;
  };

  let attempt: AttemptRow | null = null;

  if (query.examId) {
    const { data } = await supabase
      .from("practice_exam_attempts")
      .select("id, score, analysis, topic_report, exam_id, completed_at")
      .eq("exam_id", query.examId)
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    attempt = (data as AttemptRow | null) ?? null;
  }

  if (!attempt) {
    const { data } = await supabase
      .from("practice_exam_attempts")
      .select("id, score, analysis, topic_report, exam_id, completed_at")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // prep'e bağlı son deneme
    if (data) {
      const { data: exam } = await supabase
        .from("practice_exams")
        .select("id")
        .eq("id", data.exam_id)
        .eq("exam_prep_id", prepId)
        .maybeSingle();
      if (exam) attempt = data as AttemptRow;
    }
  }

  // ?score= yok sayılır — yalnız DB
  const scoreNum = attempt?.score != null ? Number(attempt.score) : null;
  const target = prep.target_score != null ? Number(prep.target_score) : null;
  const band = scoreBandLabel(scoreNum ?? 0, target);

  let topicReport: MockTopicReportRow[] = [];
  if (Array.isArray(attempt?.topic_report)) {
    topicReport = attempt!.topic_report as MockTopicReportRow[];
  } else if (attempt?.analysis) {
    try {
      const parsed = JSON.parse(attempt.analysis) as { topicReport?: MockTopicReportRow[] };
      if (Array.isArray(parsed.topicReport)) topicReport = parsed.topicReport;
    } catch {
      /* ignore */
    }
  }

  const { data: examRow } = attempt?.exam_id
    ? await supabase
        .from("practice_exams")
        .select("id, duration_minutes, started_at, deadline_at")
        .eq("id", attempt.exam_id)
        .maybeSingle()
    : { data: null };

  const { count: reviewCount } = attempt
    ? await supabase
        .from("practice_exam_item_reviews")
        .select("id", { count: "exact", head: true })
        .eq("attempt_id", attempt.id)
    : { count: 0 };

  const { data: reviews } = attempt
    ? await supabase
        .from("practice_exam_item_reviews")
        .select("is_correct, verdict")
        .eq("attempt_id", attempt.id)
    : { data: [] };

  const correct = (reviews ?? []).filter((r) => r.verdict === "dogru" || r.is_correct).length;
  const blank = (reviews ?? []).filter((r) => r.verdict === "bos").length;
  const wrong = (reviews ?? []).length - correct - blank;

  const hasMulti = true;
  const nextSteps = buildNextSteps({
    prepId,
    report: topicReport,
    wrongCount: Math.max(0, wrong),
  });

  if (!attempt) {
    return (
      <ParitySorShell {...shell}>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-[color:var(--cp-muted)]">Bu deneme bulunamadı.</p>
          <Link href={`/deneme-sinavlari/${prepId}`} className="mt-4 inline-block text-sm text-action">
            ← Çalışma yoluna dön
          </Link>
        </div>
      </ParitySorShell>
    );
  }

  const ringColor =
    band.tone === "success"
      ? "var(--pm-success,#22c55e)"
      : band.tone === "warning"
        ? "#f59e0b"
        : band.tone === "danger"
          ? "var(--pm-danger,#ef4444)"
          : "var(--cp-muted)";

  return (
    <ParitySorShell {...shell}>
      <div className="mx-auto max-w-[640px] px-4 py-8">
        <Link
          href={`/deneme-sinavlari/${prepId}`}
          className="text-sm text-[color:var(--cp-muted)] hover:text-[color:var(--cp-text)]"
        >
          ← Çalışma yoluna dön
        </Link>

        <section className="pm-card mt-6 rounded-3xl p-8 text-center">
          <p className="text-xs font-semibold tracking-widest text-[color:var(--cp-gold,#f4ae0b)]">
            DENEME SONUCU
          </p>
          <h1
            className="mt-2 text-2xl text-[color:var(--cp-text)]"
            style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
          >
            {prep.title} · yazılı deneme
          </h1>

          <div className="relative mx-auto mt-8 flex h-40 w-40 items-center justify-center">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(100, scoreNum ?? 0) / 100)}`}
                style={{ transition: "stroke-dashoffset 600ms var(--pm-ease, ease)" }}
              />
            </svg>
            <div>
              <div className="text-5xl font-extrabold tabular-nums">{scoreNum ?? "—"}</div>
              <div className="text-sm text-[color:var(--cp-muted)]">/ 100 puan</div>
            </div>
          </div>

          <p className="mt-4 text-sm text-[color:var(--cp-muted)]">
            {target == null ? (
              <Link href={`/deneme-sinavlari/${prepId}/tanisma`} className="text-action">
                Hedef puan belirle
              </Link>
            ) : (
              band.text
            )}
          </p>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Doğru", correct],
            ["Yanlış", wrong],
            ["Boş", blank],
            [
              "Süre",
              examRow?.duration_minutes != null ? `${examRow.duration_minutes} dk` : "—",
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface)] p-4 text-center"
            >
              <div className="text-xs text-[color:var(--cp-muted)]">{label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {topicReport.length ? (
          <section className="mt-6 rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface)] p-5">
            <h2 className="text-base font-semibold">Konu konu karne</h2>
            <ul className="mt-4 space-y-3">
              {topicReport.map((row) => {
                const bar =
                  row.percent >= 80
                    ? "var(--pm-success,#22c55e)"
                    : row.percent >= 50
                      ? "#f59e0b"
                      : "var(--pm-danger,#ef4444)";
                return (
                  <li key={row.topicLabel}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="font-medium">{row.topicLabel}</span>
                      {row.examHeavy ? (
                        <span className="rounded-full bg-[color:color-mix(in_srgb,var(--cp-gold)_20%,transparent)] px-2 py-0.5 text-[10px] text-[color:var(--cp-gold)]">
                          Sınavda ağırlıklı
                        </span>
                      ) : null}
                      <span className="ml-auto tabular-nums text-[color:var(--cp-muted)]">
                        {row.correct}/{row.total} · %{row.percent}
                      </span>
                      <Link
                        href={`/deneme-sinavlari/${prepId}/deneme/${attempt!.exam_id}/incele?topic=${encodeURIComponent(row.topicLabel)}`}
                        className="text-[color:var(--cp-muted)]"
                        aria-label={`${row.topicLabel} incele`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${row.percent}%`, background: bar }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {nextSteps.length ? (
          <section className="mt-6 rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface)] p-5">
            <h2 className="text-base font-semibold">Önerilen sonraki adımlar</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {nextSteps.map((step) => (
                <li key={step.label}>
                  <Link href={step.href} className="text-action hover:underline">
                    {step.label}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/deneme-sinavlari/${prepId}/deneme/${attempt.exam_id}/incele`}
            className="cp-exam-continue cp-exam-continue--primary inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold"
          >
            <ListChecks className="h-4 w-4" />
            Soruları incele
          </Link>
          <Link
            href={`/deneme-sinavlari/${prepId}/deneme/kurulum`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] text-sm font-semibold"
          >
            <RotateCcw className="h-4 w-4" />
            Yeni deneme oluştur
          </Link>
          <Link
            href={`/deneme-sinavlari/${prepId}/degerlendirme`}
            className="inline-flex h-11 items-center justify-center gap-2 text-sm text-[color:var(--cp-muted)] hover:text-[color:var(--cp-text)]"
          >
            <BookOpen className="h-4 w-4" />
            Hazırlık durumunu gör
          </Link>
        </div>

        {hasMulti ? (
          <p className="mt-4 text-center text-xs text-[color:var(--cp-muted)]">
            {multiMcqScoringNote()}
          </p>
        ) : null}

        {reviewCount === 0 ? (
          <p className="mt-4 text-center text-sm text-[color:var(--cp-muted)]" aria-live="polite">
            Klasik soruların değerlendiriliyor…
          </p>
        ) : null}
      </div>
    </ParitySorShell>
  );
}
