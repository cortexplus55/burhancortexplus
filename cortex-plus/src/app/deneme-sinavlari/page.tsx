import { cookies } from "next/headers";
import { ParityExamPrep } from "@/components/parity/exam-prep";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { mapPrepTopics, topicProgress, type PrepTopic } from "@/lib/learning/exam-prep-progress";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { daysUntilExam, nodeProgress } from "@/lib/learning/exam-prep-plan";
import type { ExamPrepCard } from "@/components/parity/exam-prep";
import { toFeedRows, toSummary } from "@/lib/parity/school-feed";
import {
  FOCUS_PREP_COOKIE,
  selectFocusPrep,
  type FocusPrepCandidate,
} from "@/lib/learning/focus-prep";

export const metadata = { title: "Sınav hazırlığı" };

/*
  Sayfa tümüyle dinamik çiziliyor. Aynı sebep `/calisma-plani`'ndaki gibi:
  sarmalanan istemci bileşeni `useSearchParams()` kullanıyor, Suspense sınırı
  da yayında açılmıyordu. Sayfa zaten oturum gerektiriyor.
*/
export const dynamic = "force-dynamic";

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
  // Çubuk ve "X / Y konu" aynı birimi kullanır: konu. Düğüm sayısı
  // etkinliktir; kartta konu diye yazılmaz.
  const progress = topics.length ? topicProgress(topics) : nodeProgress(nodes);
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

  const cookieStore = await cookies();
  const cookiePrepId = cookieStore.get(FOCUS_PREP_COOKIE)?.value ?? null;

  const [{ data: prepRows }, { data: profile }, { data: activeAttempt }] =
    await Promise.all([
      supabase
        .from("exam_preps")
        .select("id, title, exam_type, target_score, created_at, study_plan_id, exam_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("profiles")
        .select("school_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("exam_prep_node_attempts")
        .select("exam_prep_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const preps = prepRows ?? [];

  // Okul agi RPC'leri migration ile geliyor; fonksiyon yoksa sayfa cokmesin
  // diye bos akisla devam ediyoruz (sekme "okulunu sec" halini gosterir).
  const [summaryRes, feedRes] = await Promise.all([
    supabase.rpc("school_summary"),
    supabase.rpc("school_feed", { p_limit: 30 }),
  ]);
  const schoolSummary = toSummary(summaryRes.data);
  const schoolRows = toFeedRows(feedRes.data);
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

  const prepIdsForActivity = preps.map((prep) => prep.id);
  const [{ data: attemptActivity }, { data: masteryActivity }] = prepIdsForActivity.length
    ? await Promise.all([
        supabase
          .from("exam_prep_node_attempts")
          .select("exam_prep_id, updated_at")
          .eq("user_id", user.id)
          .in("exam_prep_id", prepIdsForActivity),
        supabase
          .from("exam_prep_topic_mastery")
          .select("exam_prep_id, last_practiced_at")
          .eq("user_id", user.id)
          .in("exam_prep_id", prepIdsForActivity),
      ])
    : [{ data: [] as { exam_prep_id: string; updated_at: string }[] }, { data: [] }];

  const attemptMax = new Map<string, string>();
  for (const row of attemptActivity ?? []) {
    const id = row.exam_prep_id as string;
    const ts = row.updated_at as string;
    const prev = attemptMax.get(id);
    if (!prev || Date.parse(ts) > Date.parse(prev)) attemptMax.set(id, ts);
  }
  const masteryMax = new Map<string, string>();
  for (const row of masteryActivity ?? []) {
    const id = row.exam_prep_id as string;
    const ts = row.last_practiced_at as string | null;
    if (!ts) continue;
    const prev = masteryMax.get(id);
    if (!prev || Date.parse(ts) > Date.parse(prev)) masteryMax.set(id, ts);
  }

  const focusCandidates: FocusPrepCandidate[] = preps.map((prep) => {
    const attemptAt = attemptMax.get(prep.id) ?? null;
    const masteryAt = masteryMax.get(prep.id) ?? null;
    let lastActivityAt: string | null = null;
    if (attemptAt && masteryAt) {
      lastActivityAt =
        Date.parse(attemptAt) >= Date.parse(masteryAt) ? attemptAt : masteryAt;
    } else {
      lastActivityAt = attemptAt ?? masteryAt;
    }
    const topics = topicMap.get(prep.id) ?? [];
    const progress = topics.length ? topicProgress(topics) : null;
    const unfinished =
      progress && progress.total > 0 ? progress.done < progress.total : undefined;
    return {
      id: prep.id,
      title: prep.title ?? prep.exam_type,
      examDate: prep.exam_date ?? null,
      createdAt: prep.created_at ?? new Date(0).toISOString(),
      lastActivityAt,
      unfinished,
    };
  });

  const { focusPrepId } = selectFocusPrep({
    preps: focusCandidates,
    activeAttemptPrepId: (activeAttempt?.exam_prep_id as string | null) ?? null,
    cookiePrepId,
  });

  const activePrep =
    (focusPrepId ? cards.find((card) => card.id === focusPrepId) : null) ??
    cards[0] ??
    null;
  const otherPreps = cards.filter((card) => card.id !== activePrep?.id);

  return (
    <ParitySorShell {...shell}>
      <ParityExamPrep
        activePrep={activePrep}
        otherPreps={otherPreps}
        userInitial={shell.userInitial}
        initialSchoolName={profile?.school_name ?? ""}
        schoolSummary={schoolSummary}
        schoolRows={schoolRows}
      />
    </ParitySorShell>
  );
}
