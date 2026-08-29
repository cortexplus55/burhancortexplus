import { Suspense } from "react";
import { AstraParityExamPrep } from "@/components/parity/astra-parity-exam-prep";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { ExamPrepCard } from "@/components/parity/astra-parity-exam-prep";

export const metadata = { title: "Sınav hazırlığı" };

function daysUntilLabel(due: Date | null): string {
  if (!due) return "Tarih yok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(due);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "Süre geçti";
  if (diff === 0) return "Bugün";
  if (diff === 1) return "1 gün sonra";
  return `${diff} gün sonra`;
}

function buildActivePrep(
  plan: {
    id: string;
    title: string;
    study_plan_tasks: { completed: boolean; due_date: string | null }[] | null;
  } | null,
  targetScore: number | null,
): ExamPrepCard | null {
  if (!plan) return null;
  const tasks = plan.study_plan_tasks ?? [];
  const total = tasks.length || 3;
  const done = tasks.filter((t) => t.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dueDates = tasks
    .map((t) => (t.due_date ? new Date(t.due_date) : null))
    .filter(Boolean) as Date[];
  const nearest =
    dueDates.length > 0
      ? dueDates.sort((a, b) => a.getTime() - b.getTime())[0]
      : null;

  return {
    id: plan.id,
    title: plan.title,
    progressPct: pct,
    daysLabel: daysUntilLabel(nearest),
    topicsDone: done,
    topicsTotal: total,
    targetScore,
    continueHref: "/calisma-plani",
  };
}

export default async function DenemeSinavlariPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: plan }, { data: examPrep }] = await Promise.all([
    supabase
      .from("study_plans")
      .select("id, title, study_plan_tasks(completed, due_date)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("exam_preps")
      .select("target_score")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activePrep = buildActivePrep(plan, examPrep?.target_score ?? null);

  return (
    <AstraParitySorShell {...shell}>
      <Suspense fallback={<div className="ap-exam-page ap-exam-page--loading" />}>
        <AstraParityExamPrep
          activePrep={activePrep}
          userInitial={shell.userInitial}
        />
      </Suspense>
    </AstraParitySorShell>
  );
}
