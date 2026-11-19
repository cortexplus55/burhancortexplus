import Link from "next/link";
import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ParityExamRunner } from "@/components/parity/exam-runner";
import { PaperExamRunner } from "@/components/parity/paper-exam-runner";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { stripAnswerKeyForActiveExam } from "@/lib/security/answer-key-columns";

export const metadata = { title: "Deneme" };

export default async function ExamPrepDenemePage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string; examId: string }>;
  searchParams: Promise<{ kagit?: string; yukle?: string }>;
}) {
  const { prepId, examId } = await params;
  // Kâğıtta çöz (17 Ekim 2026): kurulumda "Kâğıtta" seçildiyse; telefondan QR ile yükleme adımı.
  const { kagit, yukle } = await searchParams;
  const { supabase, user } = await requireStudentArea();
  // Kabuk, kâğıt ve sorular tek round-trip'te (3 Kasım 2026: havuz denemesi açılışı < 3 sn hedefi).
  const [shell, { data: exam }, { data: rows }] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    supabase.from("practice_exams").select("id, title, exam_prep_id").eq("id", examId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("practice_exam_questions")
      .select("id, question_text, options, question_type, points")
      .eq("exam_id", examId)
      .order("sort_order"),
  ]);

  if (!exam || exam.exam_prep_id !== prepId) notFound();

  // Süren sınav: soru anahtarsız gider (doğru cevap, açıklama, rubrik hiçbir koşulda tarayıcıya çıkmaz).
  const questions = (rows ?? []).map((row) => stripAnswerKeyForActiveExam(row as Record<string, unknown>));

  return (
    <ParitySorShell {...shell} chrome="session">
      {questions.length && kagit === "1" ? (
        <PaperExamRunner
          examId={examId}
          prepId={prepId}
          title={exam.title ?? "Deneme"}
          questions={questions}
          startAtUpload={yukle === "1"}
        />
      ) : questions.length ? (
        <ParityExamRunner
          examId={examId}
          prepId={prepId}
          title={exam.title ?? "Deneme"}
          questions={questions}
        />
      ) : (
        <div className="cp-exam-page">
          <p>Sorular henüz hazır değil.</p>
          <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
            ← Konu yoluna dön
          </Link>
        </div>
      )}
    </ParitySorShell>
  );
}
