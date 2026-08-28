import { TeacherShell } from "@/components/layout/teacher-shell";
import { TeacherQuizGenerator } from "@/components/teacher/quiz-generator";
import { ShareQuizForm } from "@/components/teacher/share-quiz-form";
import { TeacherPlusGate } from "@/components/teacher/plus-gate";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireTeacher } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";
import { getTeacherEntitlements } from "@/lib/teacher/entitlements";

export const metadata = { title: "Öğretmen quizleri" };

export default async function OgretmenQuizlerPage() {
  const { supabase, user, roles } = await requireTeacher();
  const entitlements = await getTeacherEntitlements(supabase, user.id, roles);
  const cost = await getCreditCost("QUIZ_GENERATE");

  const [{ data: quizzes }, { data: classrooms }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, title, created_at, quiz_questions(id)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("classrooms").select("id, name").eq("teacher_id", user.id),
  ]);

  const lockedMessage =
    entitlements?.tier === "pending"
      ? "Deneme quiz hakkın doldu."
      : "AI quiz üretimi Cortex Plus ile açılır.";

  return (
    <TeacherShell title="Quiz materyali">
      <div className="space-y-6">
        <SectionCard
          title="Sınıf için quiz üret"
          description="Ürettiğin quizleri Plus ile ödev olarak paylaşabilirsin."
        >
          <TeacherQuizGenerator
            creditCost={cost}
            locked={!entitlements?.canGenerateQuiz()}
            lockedMessage={lockedMessage}
          />
          {entitlements?.tier === "pending" &&
          entitlements.remainingTrialQuizzes === 0 ? (
            <TeacherPlusGate
              title="Deneme quiz hakkın bitti"
              description="Doğrulama sonrası Plus ile sınırsız AI quiz."
            />
          ) : null}
        </SectionCard>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Quizlerin</h2>
          {(quizzes ?? []).length ? (
            <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
              {(quizzes ?? []).map((quiz) => (
                <li key={quiz.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{quiz.title}</p>
                  <p className="text-xs text-[var(--astra-muted)]">
                    {quiz.quiz_questions?.length ?? 0} soru ·{" "}
                    {formatDate(quiz.created_at)}
                  </p>
                  {entitlements?.canAttachQuizToAssignment() ? (
                    <ShareQuizForm
                      quizId={quiz.id}
                      quizTitle={quiz.title}
                      classrooms={classrooms ?? []}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--astra-muted)]">Henüz quiz üretmedin.</p>
          )}
        </section>
      </div>
    </TeacherShell>
  );
}
