import { AppShell } from "@/components/layout/app-shell";
import { GeneratorForm } from "@/components/learning/generator-form";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Öğretmen quizleri" };

export default async function OgretmenQuizlerPage() {
  const { supabase, user } = await requireTeacher();
  const cost = await getCreditCost("QUIZ_GENERATE");

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, created_at, quiz_questions(id)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <AppShell variant="admin" title="Quiz materyali">
      <div className="space-y-6">
        <SectionCard
          title="Sınıf için quiz üret"
          description="Ürettiğin quizleri ödev olarak paylaşabilirsin."
        >
          <GeneratorForm
            endpoint="/api/learning/quiz/generate"
            fieldLabel="Konu"
            placeholder="Örn. Newton yasaları"
            submitLabel="Quiz üret"
            creditCost={cost}
            returnPath="/ogretmen-paneli/quizler"
            buildBody={(topic) => ({ topic })}
          />
        </SectionCard>

        <AdminTable
          columns={["Quiz", "Soru", "Tarih"]}
          rows={(quizzes ?? []).map((quiz) => [
            quiz.title,
            quiz.quiz_questions?.length ?? 0,
            formatDate(quiz.created_at),
          ])}
          emptyMessage="Henüz quiz üretmedin."
        />
      </div>
    </AppShell>
  );
}
