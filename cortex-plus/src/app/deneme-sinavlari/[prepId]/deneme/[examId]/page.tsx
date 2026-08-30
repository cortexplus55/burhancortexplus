import Link from "next/link";
import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { AstraExamRunner } from "@/components/parity/astra-exam-runner";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Deneme" };

export default async function ExamPrepDenemePage({
  params,
}: {
  params: Promise<{ prepId: string; examId: string }>;
}) {
  const { prepId, examId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: exam } = await supabase
    .from("practice_exams")
    .select("id, title, exam_prep_id")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exam || exam.exam_prep_id !== prepId) notFound();

  const { data: rows } = await supabase
    .from("practice_exam_questions")
    .select("id, question_text, options, question_type")
    .eq("exam_id", examId)
    .order("sort_order");

  const questions = (rows ?? []).map((row) => ({
    id: row.id as string,
    text: row.question_text as string,
    options: (row.options as string[]) ?? [],
    question_type: (row.question_type as string) ?? "mcq",
  }));

  return (
    <AstraParitySorShell {...shell}>
      {questions.length ? (
        <AstraExamRunner
          examId={examId}
          prepId={prepId}
          title={exam.title ?? "Deneme"}
          questions={questions}
        />
      ) : (
        <div className="ap-exam-page">
          <p>Sorular henüz hazır değil.</p>
          <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
            ← Konu yoluna dön
          </Link>
        </div>
      )}
    </AstraParitySorShell>
  );
}
