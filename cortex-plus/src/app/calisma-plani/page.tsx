import { Suspense } from "react";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { StudyPlanGeneratePanel } from "@/components/learning/learning-generate-panels";
import { StudyWorkspace } from "@/components/learning/study-workspace";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Çalışma planı" };

export default async function CalismaPlaniPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const cost = await getCreditCost("STUDY_PLAN_GENERATE");

  const [{ data: plans }, { data: examPrep }] = await Promise.all([
    supabase
      .from("study_plans")
      .select("id, title, status, study_plan_tasks(id, title, due_date, completed, sort_order)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("exam_preps")
      .select("target_score")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <AstraParitySorShell {...shell}>
      <Suspense fallback={<div className="ap-plan-page ap-plan-page--loading" />}>
        <StudyWorkspace
          targetScore={examPrep?.target_score ?? null}
          generateSlot={<StudyPlanGeneratePanel creditCost={cost} />}
          plans={(plans ?? []).map((plan) => ({
            id: plan.id,
            title: plan.title,
            status: plan.status,
            tasks: (plan.study_plan_tasks ?? [])
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((task) => ({
                id: task.id,
                title: task.title,
                dueDate: task.due_date,
                completed: task.completed,
              })),
          }))}
        />
      </Suspense>
    </AstraParitySorShell>
  );
}
