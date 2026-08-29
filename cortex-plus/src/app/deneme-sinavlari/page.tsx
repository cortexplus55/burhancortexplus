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
  examPrep: {
    id: string;
    title: string | null;
    target_score: number | null;
  } | null,
): ExamPrepCard | null {
  if (!plan && !examPrep) return null;
  const tasks = plan?.study_plan_tasks ?? [];
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
    id: examPrep?.id ?? plan!.id,
    title: examPrep?.title ?? plan?.title ?? "Sınav hazırlığı",
    progressPct: pct,
    daysLabel: daysUntilLabel(nearest),
    topicsDone: done,
    topicsTotal: total,
    targetScore: examPrep?.target_score ?? null,
    continueHref: examPrep
      ? `/deneme-sinavlari/${examPrep.id}/calis`
      : "/deneme-sinavlari/olustur",
  };
}

export default async function DenemeSinavlariPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: plan }, { data: examPrepRow }] = await Promise.all([
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
      .select("id, title, target_score, study_plan_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const planForPrep =
    plan && examPrepRow?.study_plan_id && plan.id !== examPrepRow.study_plan_id
      ? null
      : plan;

  const activePrep = buildActivePrep(planForPrep, examPrepRow);

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
