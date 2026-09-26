/**
 * DailyPlanner — today's objectives from schedule + reviews + weak topics.
 * ensureCurrentDailyPlan: idempotent lazy evaluation (no cron).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleBuildResult } from "@/lib/learning/exam-schedule-v2";
import type { DailyPlan, DailyPlanItem, ReasonCode } from "@/lib/adaptive/types";
import { reasonCopy } from "@/lib/adaptive/reason-copy";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import {
  ADAPTIVE_LEARNING_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { loadStudentState } from "@/lib/adaptive/student-state";
import { shouldReplanMaster } from "@/lib/adaptive/replan-policy";

function istanbulToday(from = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
}

export type DailyPlannerInput = {
  userId: string;
  examPrepId: string;
  schedule: ScheduleBuildResult | null;
  reviewItems: { topicKey: string; title: string; minutes?: number }[];
  weakTopics: { topicKey: string; title: string }[];
  dailyMinutesCap: number | null;
  masterPlanVersion: number;
  planDate?: string;
  /** Student-facing banner when plan was rebalanced for missed days. */
  rebalanceNotice?: string | null;
};

export function buildDailyPlanItems(input: DailyPlannerInput): {
  objective: string;
  estimatedMinutes: number;
  items: Omit<DailyPlanItem, "id">[];
  rebalanceNotice: string | null;
} {
  const today = input.planDate ?? istanbulToday();
  const items: Omit<DailyPlanItem, "id">[] = [];
  const cap =
    input.dailyMinutesCap && input.dailyMinutesCap > 0
      ? input.dailyMinutesCap
      : 90;

  for (const review of input.reviewItems.slice(0, 2)) {
    items.push({
      kind: "review",
      title: `${review.title} — kısa tekrar`,
      minutes: review.minutes ?? 8,
      topicKey: normalizeTopicKey(review.topicKey),
      status: "pending",
      reasonCode: "REVIEW_DUE",
      href: `/deneme-sinavlari/${input.examPrepId}/oturum`,
    });
  }

  const sessions =
    input.schedule?.sessions.filter((s) => s.calendarDate === today) ?? [];
  for (const s of sessions) {
    if (items.length >= 6) break;
    items.push({
      kind: s.role,
      title: `${s.topicTitle} — ${roleLabel(s.role)}`,
      minutes: s.durationMinutes,
      topicId: s.topicId,
      topicKey: normalizeTopicKey(s.topicTitle),
      status: "pending",
      reasonCode: "PLAN_OBJECTIVE",
      href: `/deneme-sinavlari/${input.examPrepId}/oturum`,
    });
  }

  if (items.length < 3) {
    for (const w of input.weakTopics.slice(0, 2)) {
      if (items.length >= 5) break;
      items.push({
        kind: "practice",
        title: `${w.title} — zayıf nokta`,
        minutes: 12,
        topicKey: normalizeTopicKey(w.topicKey),
        status: "pending",
        reasonCode: "LOW_MASTERY",
        href: `/deneme-sinavlari/${input.examPrepId}/oturum`,
      });
    }
  }

  // Cap minutes from the end; keep at least one item. Prefer keeping reviews.
  let total = items.reduce((a, b) => a + b.minutes, 0);
  while (items.length > 1 && total > cap) {
    let removeIdx = items.length - 1;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i]!.kind !== "review") {
        removeIdx = i;
        break;
      }
    }
    const removed = items.splice(removeIdx, 1)[0];
    total -= removed?.minutes ?? 0;
  }

  const first = items[0];
  const objective = first
    ? `Bugün: ${first.title}${items.length > 1 ? ` ve ${items.length - 1} adım daha` : ""}`
    : "Bugün için kısa bir çalışma turu hazır.";

  return {
    objective,
    estimatedMinutes: total,
    items,
    rebalanceNotice: input.rebalanceNotice ?? null,
  };
}

function roleLabel(role: string): string {
  switch (role) {
    case "learn":
      return "öğrenme";
    case "practice":
      return "pratik";
    case "review":
      return "tekrar";
    case "mock":
      return "deneme";
    default:
      return "çalışma";
  }
}

export async function ensureDailyPlan(
  service: SupabaseClient,
  input: DailyPlannerInput,
): Promise<DailyPlan & { rebalanceNotice?: string | null }> {
  const planDate = input.planDate ?? istanbulToday();
  const built = buildDailyPlanItems({ ...input, planDate });

  const { data: existing } = await service
    .from("adaptive_daily_plans")
    .select("id, objective, estimated_minutes, status")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.examPrepId)
    .eq("plan_date", planDate)
    .maybeSingle();

  let planId = existing?.id as string | undefined;

  if (!planId) {
    const { data: inserted, error } = await service
      .from("adaptive_daily_plans")
      .insert({
        user_id: input.userId,
        exam_prep_id: input.examPrepId,
        plan_date: planDate,
        objective: built.objective,
        estimated_minutes: built.estimatedMinutes,
        master_plan_version: input.masterPlanVersion,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "daily_plan_insert_failed");
    }
    planId = inserted.id as string;

    if (built.items.length) {
      await service.from("adaptive_daily_plan_items").insert(
        built.items.map((item, i) => ({
          daily_plan_id: planId,
          user_id: input.userId,
          sort_order: i,
          kind: item.kind,
          title: item.title,
          minutes: item.minutes,
          topic_id: item.topicId ?? null,
          topic_key: item.topicKey ?? null,
          status: item.status,
          reason_code: item.reasonCode ?? null,
          href: item.href ?? null,
          meta: built.rebalanceNotice
            ? { rebalanceNotice: built.rebalanceNotice }
            : {},
        })),
      );
    }
  }

  const { data: itemRows } = await service
    .from("adaptive_daily_plan_items")
    .select(
      "id, kind, title, minutes, topic_id, topic_key, status, reason_code, href, meta",
    )
    .eq("daily_plan_id", planId)
    .order("sort_order", { ascending: true });

  const items: DailyPlanItem[] = (itemRows ?? []).map((row) => ({
    id: row.id as string,
    kind: String(row.kind),
    title: String(row.title),
    minutes: Number(row.minutes ?? 10),
    topicId: (row.topic_id as string) ?? null,
    topicKey: (row.topic_key as string) ?? null,
    status: (row.status as DailyPlanItem["status"]) ?? "pending",
    reasonCode: (row.reason_code as ReasonCode) ?? null,
    href: (row.href as string) ?? null,
  }));

  const noticeFromMeta =
    itemRows?.[0]?.meta &&
    typeof itemRows[0].meta === "object" &&
    (itemRows[0].meta as { rebalanceNotice?: string }).rebalanceNotice;

  return {
    id: planId,
    examPrepId: input.examPrepId,
    planDate,
    objective:
      (existing?.objective as string) ||
      built.objective ||
      items[0]?.title ||
      "Bugünkü program",
    estimatedMinutes:
      Number(existing?.estimated_minutes) ||
      items.reduce((a, b) => a + b.minutes, 0),
    items,
    rebalanceNotice: built.rebalanceNotice ?? noticeFromMeta ?? null,
  };
}

/**
 * Idempotent daily plan for today. Detects missed days, optionally triggers
 * master replan, loads due reviews, creates plan if missing or forceRefresh.
 */
export async function ensureCurrentDailyPlan(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    forceRefresh?: boolean;
    planDate?: string;
  },
): Promise<DailyPlan & { rebalanceNotice?: string | null; missedDayCount?: number }> {
  const planDate = input.planDate ?? istanbulToday();

  if (!input.forceRefresh) {
    const { data: existing } = await service
      .from("adaptive_daily_plans")
      .select("id")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.examPrepId)
      .eq("plan_date", planDate)
      .in("status", ["active"])
      .maybeSingle();

    if (existing) {
      const { data: prep } = await service
        .from("exam_preps")
        .select("schedule_v2, adaptive_plan_version, daily_minutes")
        .eq("id", input.examPrepId)
        .maybeSingle();
      return ensureDailyPlan(service, {
        userId: input.userId,
        examPrepId: input.examPrepId,
        schedule: (prep?.schedule_v2 as ScheduleBuildResult | null) ?? null,
        reviewItems: await loadDueReviews(
          service,
          input.userId,
          input.examPrepId,
        ),
        weakTopics: [],
        dailyMinutesCap:
          typeof prep?.daily_minutes === "number" ? prep.daily_minutes : null,
        masterPlanVersion: Number(prep?.adaptive_plan_version ?? 0),
        planDate,
      });
    }
  }

  const missedDayCount = await countMissedDays(
    service,
    input.userId,
    input.examPrepId,
    planDate,
  );

  let rebalanceNotice: string | null = null;
  if (
    missedDayCount >= 1 &&
    shouldReplanMaster({ trigger: "missed_days", missedDayCount })
  ) {
    const adaptiveOn = await isFeatureEnabled(
      service,
      ADAPTIVE_LEARNING_FLAG,
      input.userId,
    );
    if (adaptiveOn) {
      try {
        const { maybeRescheduleMissedDays } = await import(
          "@/lib/learning/missed-day-reschedule"
        );
        await maybeRescheduleMissedDays(service, input.userId, {
          force: true,
          reason: "missed_day",
        });
        const { commitMasterPlanVersion, getLatestMasterPlan } = await import(
          "@/lib/adaptive/master-plan-engine"
        );
        const { data: prepAfter } = await service
          .from("exam_preps")
          .select("schedule_v2, adaptive_plan_version")
          .eq("id", input.examPrepId)
          .maybeSingle();
        if (prepAfter?.schedule_v2) {
          const latest = await getLatestMasterPlan(service, input.examPrepId);
          await commitMasterPlanVersion(service, {
            userId: input.userId,
            examPrepId: input.examPrepId,
            trigger: "missed_days",
            schedule: prepAfter.schedule_v2 as ScheduleBuildResult,
            previousVersion:
              latest?.version ?? Number(prepAfter.adaptive_plan_version ?? 0),
          });
        }
        rebalanceNotice =
          missedDayCount >= 2
            ? "Programını son iki güne göre yeniden dengeledik."
            : "Programını kaçırılan güne göre yeniden dengeledik.";
      } catch {
        // keep going with whatever schedule we have
      }
    }
  }

  const bundle = await loadStudentState(
    service,
    input.userId,
    input.examPrepId,
  );
  const { data: prep } = await service
    .from("exam_preps")
    .select("schedule_v2, adaptive_plan_version, daily_minutes")
    .eq("id", input.examPrepId)
    .maybeSingle();

  const weak =
    bundle?.topics
      .filter((t) => t.mastery < 0.5)
      .slice(0, 3)
      .map((t) => ({
        topicKey: t.topicKey,
        title:
          bundle.graph.topics.find((g) => g.topicKey === t.topicKey)?.title ??
          t.topicKey,
      })) ?? [];

  const built = buildDailyPlanItems({
    userId: input.userId,
    examPrepId: input.examPrepId,
    schedule: (prep?.schedule_v2 as ScheduleBuildResult | null) ?? null,
    reviewItems: await loadDueReviews(service, input.userId, input.examPrepId),
    weakTopics: weak,
    dailyMinutesCap:
      typeof prep?.daily_minutes === "number" ? prep.daily_minutes : null,
    masterPlanVersion: Number(prep?.adaptive_plan_version ?? 0),
    planDate,
    rebalanceNotice,
  });

  const { data: existingRow } = await service
    .from("adaptive_daily_plans")
    .select("id")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.examPrepId)
    .eq("plan_date", planDate)
    .maybeSingle();

  const planId = existingRow?.id as string | undefined;

  if (planId && input.forceRefresh) {
    await service
      .from("adaptive_daily_plans")
      .update({
        objective: built.objective,
        estimated_minutes: built.estimatedMinutes,
        master_plan_version: Number(prep?.adaptive_plan_version ?? 0),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId);
    await service
      .from("adaptive_daily_plan_items")
      .delete()
      .eq("daily_plan_id", planId);
    if (built.items.length) {
      await service.from("adaptive_daily_plan_items").insert(
        built.items.map((item, i) => ({
          daily_plan_id: planId,
          user_id: input.userId,
          sort_order: i,
          kind: item.kind,
          title: item.title,
          minutes: item.minutes,
          topic_id: item.topicId ?? null,
          topic_key: item.topicKey ?? null,
          status: item.status,
          reason_code: item.reasonCode ?? null,
          href: item.href ?? null,
          meta: built.rebalanceNotice
            ? { rebalanceNotice: built.rebalanceNotice }
            : {},
        })),
      );
    }
  } else if (!planId) {
    return ensureDailyPlan(service, {
      userId: input.userId,
      examPrepId: input.examPrepId,
      schedule: (prep?.schedule_v2 as ScheduleBuildResult | null) ?? null,
      reviewItems: await loadDueReviews(service, input.userId, input.examPrepId),
      weakTopics: weak,
      dailyMinutesCap:
        typeof prep?.daily_minutes === "number" ? prep.daily_minutes : null,
      masterPlanVersion: Number(prep?.adaptive_plan_version ?? 0),
      planDate,
      rebalanceNotice,
    }).then((p) => ({ ...p, missedDayCount }));
  }

  return {
    ...(await ensureDailyPlan(service, {
      userId: input.userId,
      examPrepId: input.examPrepId,
      schedule: (prep?.schedule_v2 as ScheduleBuildResult | null) ?? null,
      reviewItems: [],
      weakTopics: [],
      dailyMinutesCap:
        typeof prep?.daily_minutes === "number" ? prep.daily_minutes : null,
      masterPlanVersion: Number(prep?.adaptive_plan_version ?? 0),
      planDate,
      rebalanceNotice,
    })),
    missedDayCount,
    rebalanceNotice,
  };
}

async function loadDueReviews(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
): Promise<{ topicKey: string; title: string; minutes?: number }[]> {
  const { data: reviews } = await service
    .from("adaptive_scheduled_reviews")
    .select("topic_key, due_at")
    .eq("user_id", userId)
    .eq("exam_prep_id", examPrepId)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .limit(5);

  const bundle = await loadStudentState(service, userId, examPrepId);
  return (reviews ?? []).map((r) => ({
    topicKey: String(r.topic_key),
    title:
      bundle?.graph.topics.find((g) => g.topicKey === String(r.topic_key))
        ?.title ?? String(r.topic_key),
    minutes: 8,
  }));
}

async function countMissedDays(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
  today: string,
): Promise<number> {
  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("status, session_meta")
    .eq("exam_prep_id", examPrepId);

  const pastDates = new Set<string>();
  for (const n of nodes ?? []) {
    if (n.status === "done") continue;
    const meta =
      n.session_meta && typeof n.session_meta === "object"
        ? (n.session_meta as { calendarDate?: string })
        : null;
    if (meta?.calendarDate && meta.calendarDate < today) {
      pastDates.add(meta.calendarDate);
    }
  }
  return pastDates.size;
}

export function dailyItemWhy(item: DailyPlanItem): string {
  return reasonCopy(item.reasonCode ?? "PLAN_OBJECTIVE");
}

export { istanbulToday };
