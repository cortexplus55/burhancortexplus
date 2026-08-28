import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { GeneratorForm } from "@/components/learning/generator-form";
import { ExamRunner } from "@/components/learning/exam-runner";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";
import { Search } from "lucide-react";

export const metadata = { title: "Sınavlar" };

export default async function DenemeSinavlariPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("PRACTICE_EXAM_GENERATE");
  const gradeCost = await getCreditCost("PRACTICE_EXAM_GRADE");

  const [{ data: exams }, { data: attempts }] = await Promise.all([
    supabase
      .from("practice_exams")
      .select(
        "id, title, duration_minutes, created_at, practice_exam_questions(id, question_text, options, sort_order)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("practice_exam_attempts")
      .select("id, score, analysis, completed_at, practice_exams(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <AppShell
      title="Sınavlar"
      creditHint={`Deneme üretimi ${cost} kredi; değerlendirme ${gradeCost} kredi.`}
    >
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--astra-muted)]" />
        <input
          type="search"
          placeholder="Ara"
          className="w-full rounded-full border border-[var(--astra-border)] bg-[var(--astra-surface)] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-[var(--astra-muted)] focus:border-[var(--astra-primary)]"
          aria-label="Ara"
        />
      </div>

      <div className="astra-pay-card p-5">
        <h1 className="text-lg font-semibold leading-snug">
          Sınavlarına AI ile hazırlan
        </h1>
        <p className="mt-2 text-sm text-[var(--astra-muted)]">
          Konu seç, deneme üret ve eksiklerini gör.
        </p>
        <Link
          href="#yeni-test"
          className="astra-btn-primary mt-4 inline-flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
        >
          + Yeni test oluştur
        </Link>
        <p className="mt-3 text-center text-xs text-[var(--astra-muted)]">
          <Link href="/yardim" className="underline underline-offset-2">
            Nasıl çalışır
          </Link>
        </p>
      </div>

      <div className="mt-4 flex rounded-full bg-[var(--astra-pill)] p-1 text-sm">
        <span className="flex-1 rounded-full py-2 text-center font-medium text-white">
          Okulum
        </span>
        <span className="flex-1 rounded-full py-2 text-center text-[var(--astra-muted)]">
          Cortex&apos;tan
        </span>
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-2xl border border-dashed border-[var(--astra-border)] py-4 text-sm text-[var(--astra-muted)]"
      >
        Hangi okula gidiyorsun?
      </button>

      <div id="yeni-test" className="mt-8 space-y-4">
        <h2 className="text-sm font-medium text-[var(--astra-muted)]">
          Yeni deneme
        </h2>
        <div className="astra-pay-card p-4 [&_label]:text-[var(--astra-text)] [&_input]:border-[var(--astra-border)] [&_input]:bg-[var(--astra-bg)]">
          <GeneratorForm
            endpoint="/api/learning/exam/generate"
            fieldLabel="Konu"
            placeholder="Örn. Fonksiyonlar"
            submitLabel="Deneme üret"
            creditCost={cost}
            returnPath="/deneme-sinavlari"
            extraFields={[
              {
                name: "questionCount",
                label: "Soru",
                type: "number",
                defaultValue: "10",
              },
            ]}
            buildBody={(topic, extras) => ({
              topic,
              questionCount: Number(extras.questionCount ?? 10),
              difficulty: "medium",
            })}
          />
        </div>
      </div>

      {exams?.length ? (
        <div className="mt-8 space-y-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="astra-pay-card p-4 [&_.rounded-lg]:border-[var(--astra-border)]"
            >
              <ExamRunner
                examId={exam.id}
                title={exam.title}
                durationMinutes={exam.duration_minutes}
                questions={(exam.practice_exam_questions ?? [])
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((question) => ({
                    id: question.id,
                    text: question.question_text,
                    options: Array.isArray(question.options)
                      ? (question.options as string[])
                      : [],
                  }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-[var(--astra-muted)]">
          Henüz denemen yok. Yukarıdan ilk testini oluştur.
        </p>
      )}

      {attempts?.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Geçmiş sonuçların</h2>
          <ul className="space-y-3">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="astra-pay-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {(attempt.practice_exams as { title?: string } | null)
                      ?.title ?? "Deneme"}
                  </span>
                  <span className="text-[var(--astra-muted)]">
                    {attempt.score ?? 0} puan · {formatDate(attempt.completed_at)}
                  </span>
                </div>
                {attempt.analysis ? (
                  <p className="mt-2 whitespace-pre-wrap text-[var(--astra-muted)]">
                    {attempt.analysis}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AppShell>
  );
}
