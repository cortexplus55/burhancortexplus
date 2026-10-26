import { notFound } from "next/navigation";
import { ParityExamRunner } from "@/components/parity/exam-runner";

export const dynamic = "force-dynamic";

const QUESTIONS = Array.from({ length: 20 }, (_, index) => {
  const n = index + 1;
  return {
    id: `e2e-q-${n}`,
    text: `Madde ${n}. Bu ifade için doğru seçenek hangisidir?`,
    options: [`Seçenek ${n} A`, `Seçenek ${n} B`, `Seçenek ${n} C`, `Seçenek ${n} D`],
    question_type: "mcq",
  };
});

export default function E2eDenemePage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <ParityExamRunner examId="e2e-exam" prepId="e2e-prep" title="Deneme" questions={QUESTIONS} />;
}
