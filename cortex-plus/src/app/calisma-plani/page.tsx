import { CalendarDays } from "lucide-react";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { StudyPlanGeneratePanel } from "@/components/learning/learning-generate-panels";
import { PlanTasks } from "@/components/learning/plan-tasks";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Çalışma planı" };

export default async function CalismaPlaniPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const cost = await getCreditCost("STUDY_PLAN_GENERATE");

  const { data: plans } = await supabase
    .from("study_plans")
    .select("id, title, status, study_plan_tasks(id, title, due_date, completed, sort_order)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-6">
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
            variant="astra"
            icon={CalendarDays}
            title="Henüz planın yok"
            description="Hedefini yazarak ilk çalışma planını oluştur."
          />
        )}
      </div>
    </AstraParitySorShell>
  );
}
