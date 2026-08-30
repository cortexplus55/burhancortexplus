import { Suspense } from "react";
import { AstraParityExamPrep } from "@/components/parity/astra-parity-exam-prep";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { mapPrepTopics, type PrepTopic } from "@/lib/learning/exam-prep-progress";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { daysUntilExam, nodeProgress } from "@/lib/learning/exam-prep-plan";
import type { ExamPrepCard } from "@/components/parity/astra-parity-exam-prep";

export const metadata = { title: "Sınav hazırlığı" };

function toCard(
  prep: {
    id: string;
    title: string | null;
    exam_type: string;
    target_score: number | null;
    exam_date?: string | null;
  },
  topics: PrepTopic[],
  nodes: { status: "locked" | "ready" | "done" }[],
): ExamPrepCard {
  const progress = nodes.length
    ? nodeProgress(nodes)
    : { done: 0, total: topics.length, pct: 0 };
  const next = nodes.find((node) => node.status === "ready");
  return {
    id: prep.id,
    title: prep.title ?? prep.exam_type,
    examType: prep.exam_type,
    progressPct: progress.pct,
    daysLabel: prep.exam_date
      ? `${daysUntilExam(prep.exam_date)} gün kaldı`
      : next
        ? "Devam et"
        : "Yola başla",
    topicsDone: progress.done,
    topicsTotal: progress.total,
    targetScore: prep.target_score,
    continueHref: `/deneme-sinavlari/${prep.id}`,
  };
}

export default async function DenemeSinavlariPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prepRows }, { data: profile }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title, exam_type, target_score, created_at, study_plan_id, exam_date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("profiles")
      .select("school_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const preps = prepRows ?? [];
  const prepIds = preps.map((prep) => prep.id);
  const { data: allTopics } = prepIds.length
    ? await supabase
        .from("exam_prep_topics")
        .select("id, label, sort_order, status, lesson_id, exam_prep_id")
        .in("exam_prep_id", prepIds)
        .order("sort_order")
    : { data: [] as { exam_prep_id: string }[] };

  const topicMap = new Map<string, ReturnType<typeof mapPrepTopics>>();
  for (const prep of preps) {
    topicMap.set(
      prep.id,
      mapPrepTopics(
        (allTopics ?? []).filter((row) => row.exam_prep_id === prep.id) as Parameters<
          typeof mapPrepTopics
        >[0],
      ),
    );
  }

  for (const prep of preps) {
    const existing = topicMap.get(prep.id) ?? [];
    if (existing.length) continue;
    topicMap.set(
      prep.id,
      await loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id),
    );
  }

  const { data: allNodes } = prepIds.length
    ? await supabase
        .from("exam_prep_nodes")
        .select("exam_prep_id, status")
        .in("exam_prep_id", prepIds)
    : { data: [] as { exam_prep_id: string; status: string }[] };

  const cards = preps.map((prep) =>
    toCard(
      prep,
      topicMap.get(prep.id) ?? [],
      (allNodes ?? [])
        .filter((row) => row.exam_prep_id === prep.id)
        .map((row) => ({
          status: (row.status as "locked" | "ready" | "done") ?? "locked",
        })),
    ),
  );
  const activePrep =
    cards.find((card) => card.topicsTotal > 0 && card.topicsDone < card.topicsTotal) ??
    cards.find((card) => card.topicsTotal > 0) ??
    cards[0] ??
    null;
  const otherPreps = cards.filter((card) => card.id !== activePrep?.id);

  return (
    <AstraParitySorShell {...shell}>
      <Suspense fallback={<div className="ap-exam-page ap-exam-page--loading" />}>
        <AstraParityExamPrep
          activePrep={activePrep}
          otherPreps={otherPreps}
          userInitial={shell.userInitial}
          initialSchoolName={profile?.school_name ?? ""}
        />
      </Suspense>
    </AstraParitySorShell>
  );
}
