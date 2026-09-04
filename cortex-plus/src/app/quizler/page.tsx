import { ListChecks } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { QuizGeneratePanel } from "@/components/learning/learning-generate-panels";
import { QuizRunner } from "@/components/learning/quiz-runner";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Quizler" };

export default async function QuizlerPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("QUIZ_GENERATE");

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select(
      "id, title, created_at, quiz_questions(id, question_text, options, correct_answer, sort_order)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell title="Quizler" creditHint={`Quiz üretimi: ${cost} kredi.`}>
      <div className="space-y-6">
        <SectionCard
          variant="astra"
          title="Yeni quiz üret"
          description="Konu gir, çoktan seçmeli sorular anında hazırlansın."
        >
          <QuizGeneratePanel creditCost={cost} />
        </SectionCard>

        {quizzes?.length ? (
          <div className="space-y-4">
            {quizzes.map((quiz) => (
              <QuizRunner
                key={quiz.id}
                title={quiz.title}
                questions={(quiz.quiz_questions ?? [])
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((question) => ({
                    id: question.id,
                    text: question.question_text,
                    options: Array.isArray(question.options)
                      ? (question.options as string[])
                      : [],
                    correct: question.correct_answer ?? "",
                  }))}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="astra"
            icon={ListChecks}
            title="Henüz quizin yok"
            description="Bir konu yazarak ilk quizini oluştur."
          />
        )}
      </div>
    </AppShell>
  );
}
