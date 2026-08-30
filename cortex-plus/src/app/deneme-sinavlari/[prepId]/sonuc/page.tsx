import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { parseExamAnalysis } from "@/lib/learning/exam-analysis";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sonuç" };

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

  const { data: latestLesson } = await supabase
    .from("exam_prep_lessons")
    .select("id, title")
    .eq("exam_prep_id", prepId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let analysisRaw = "";
  let attemptScore: number | null = null;
  if (query.examId) {
    const { data: attempt } = await supabase
      .from("practice_exam_attempts")
      .select("analysis, score")
      .eq("exam_id", query.examId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    analysisRaw = (attempt?.analysis as string) ?? "";
    attemptScore = attempt?.score ?? null;
  }

  const analysis = parseExamAnalysis(analysisRaw);
  const scoreLabel = query.score ?? (attemptScore != null ? String(attemptScore) : "—");

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page ap-exam-result">
        <div className="ap-exam-result-divider" aria-hidden />
        <h1>Sonuç</h1>
        <p className="text-3xl font-bold text-[var(--ap-gold)]">{scoreLabel} puan</p>

        <section className="ap-exam-result-body">
          <h2>Özet</h2>
          <p className="text-sm text-[var(--ap-muted)] whitespace-pre-wrap">
            {analysis.summary || "Analiz hazırlanıyor; kısa süre içinde burada görünecek."}
          </p>
        </section>

        {analysis.weakTopics.length ? (
          <section className="ap-exam-result-cards">
            <h2>Odaklanılacak alanlar</h2>
            <ul className="ap-exam-result-tags">
              {analysis.weakTopics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {analysis.nextSteps.length ? (
          <section className="ap-exam-result-body">
            <h2>Sonraki adımlar</h2>
            <ol className="ap-exam-result-steps">
              {analysis.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="ap-exam-result-actions">
          {query.examId ? (
            <Link
              href={`/deneme-sinavlari/${prepId}/deneme/${query.examId}/incele`}
              className="ap-exam-continue ap-exam-continue--primary"
            >
              Soruları incele
            </Link>
          ) : null}
          <Link href={`/deneme-sinavlari/${prepId}/calis`} className="ap-exam-continue">
            Derse devam et
          </Link>
          {latestLesson ? (
            <Link
              href={`/deneme-sinavlari/${prepId}/ders/${latestLesson.id}`}
              className="ap-exam-continue"
            >
              Dersi oku
            </Link>
          ) : null}
          {query.examId ? (
            <Link
              href={`/deneme-sinavlari/${prepId}/deneme/${query.examId}`}
              className="ap-exam-continue"
            >
              Denemeyi tekrar çöz
            </Link>
          ) : null}
        </div>
      </div>
    </AstraParitySorShell>
  );
}
