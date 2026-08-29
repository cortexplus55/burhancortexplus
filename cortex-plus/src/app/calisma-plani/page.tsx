import { AppShell } from "@/components/layout/app-shell";
import { StudyPlanGeneratePanel } from "@/components/learning/learning-generate-panels";
import { PlanTasks } from "@/components/learning/plan-tasks";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Çalışma planı" };

export default async function CalismaPlaniPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("STUDY_PLAN_GENERATE");

  const { data: plans } = await supabase
    .from("study_plans")
    .select("id, title, status, study_plan_tasks(id, title, due_date, completed, sort_order)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <AppShell title="Çalışma planı" creditHint={`Plan üretimi: ${cost} kredi.`}>
      <div className="space-y-6">
        <SectionCard
          variant="astra"
          title="Yeni plan oluştur"
          description="Hedefini yaz; haftalara bölünmüş görevler oluşturulsun."
        >
          <StudyPlanGeneratePanel creditCost={cost} />
        </SectionCard>

        {plans?.length ? (
          plans.map((plan) => (
            <PlanTasks
              key={plan.id}
              title={plan.title}
              tasks={(plan.study_plan_tasks ?? [])
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((task) => ({
                  id: task.id,
                  title: task.title,
                  dueDate: task.due_date,
                  completed: task.completed,
                }))}
            />
          ))
        ) : (
          <EmptyState
            title="Henüz planın yok"
            description="Hedefini yazarak ilk çalışma planını oluştur."
          />
        )}
      </div>
    </AppShell>
  );
}
