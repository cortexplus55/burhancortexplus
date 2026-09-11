import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { rebuildPrepSchedule } from "@/lib/learning/exam-prep-reschedule-apply";
import type { ScheduleBuildResult, ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";

const prefsSchema = z.object({
  style: z.enum(["examples", "theory", "mixed"]).optional(),
  pace: z.enum(["slow", "normal", "fast"]).optional(),
  notes: z.string().max(400).optional(),
});

const bodySchema = z.object({
  prepId: z.string().uuid(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  hardTopics: z.array(z.string().min(1).max(120)).max(24).optional(),
  learningPreferences: prefsSchema.optional(),
  /** When true and schedule fields changed, redistribute remaining nodes. */
  rebuildSchedule: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, {
    scope: "exam-prep-settings",
    limit: 30,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    return errorResponse(403, "feature_disabled");
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, exam_date, daily_minutes, study_days, hard_topics_self, learning_preferences, schedule_v2, target_score",
    )
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const nextExamDate = parsed.data.examDate ?? prep.exam_date;
  const nextDaily =
    parsed.data.dailyMinutes ??
    (typeof prep.daily_minutes === "number" ? prep.daily_minutes : 45);
  const nextStudyDays =
    parsed.data.studyDays ??
    (Array.isArray(prep.study_days) && prep.study_days.length
      ? (prep.study_days as number[])
      : [1, 2, 3, 4, 5]);
  const nextHard =
    parsed.data.hardTopics ??
    (Array.isArray(prep.hard_topics_self)
      ? (prep.hard_topics_self as string[])
      : []);
  const existingPrefs = parseLearningPreferences(prep.learning_preferences);
  const nextPrefs = {
    ...existingPrefs,
    ...(parsed.data.learningPreferences ?? {}),
  };

  const scheduleChanged = Boolean(
    (parsed.data.examDate && parsed.data.examDate !== prep.exam_date) ||
      (parsed.data.dailyMinutes != null &&
        parsed.data.dailyMinutes !== prep.daily_minutes) ||
      (parsed.data.studyDays &&
        JSON.stringify(parsed.data.studyDays) !==
          JSON.stringify(prep.study_days)),
  );

  let summary: string | null = null;
  if (parsed.data.rebuildSchedule && scheduleChanged && prep.schedule_v2) {
    const previous = prep.schedule_v2 as ScheduleBuildResult;
    if (!previous?.sessions?.length) {
      return errorResponse(409, "no_schedule_v2");
    }

    const { data: nodeRows, error: nodesError } = await service
      .from("exam_prep_nodes")
      .select("id, sort_order, status, session_meta")
      .eq("exam_prep_id", prep.id);
    if (nodesError) return errorResponse(503, "node_lookup_failed");

    const { data: topicRows } = await service
      .from("exam_prep_topics")
      // SIRA ÖNEMLİ, SIRASIZ SORGU YETMİYOR.
      //
      // Planı kuran sıralama, konular eşit puanlıysa GİRDİ SIRASINI koruyor
      // ve girdinin belgenin sırası olduğunu varsayıyor. Kurulumda öyle
      // (`document_topic_nodes` sort_order'a göre okunuyor), ama yenilemede
      // değildi: bu sorgunun sırası yoktu. Sonuç, canlıda yenilenen bir
      // Türkçe planının "Topluluğun Doğuşu" ile BİTMESİ oldu.
      .select("id, label, document_topic_node_id, sort_order")
      .eq("exam_prep_id", prep.id)
      .order("sort_order");

    const hardSet = new Set(
      nextHard.map((t) => t.trim().toLocaleLowerCase("tr")),
    );
    const topics: ScheduleTopicInput[] = (topicRows ?? []).map((t) => ({
      id: (t.document_topic_node_id as string | null) ?? (t.id as string),
      title: t.label as string,
      selfHard: hardSet.has(String(t.label).trim().toLocaleLowerCase("tr")),
      pageNumbers: [],
    }));

    // Prefer previous session topic ids when available.
    const fromSessions = previous.sessions.map((s) => ({
      id: s.topicId,
      title: s.topicTitle,
      pageNumbers: s.sourcePages ?? [],
      selfHard: hardSet.has(s.topicTitle.trim().toLocaleLowerCase("tr")),
    }));
    const topicMap = new Map<string, ScheduleTopicInput>();
    for (const t of [...topics, ...fromSessions]) {
      topicMap.set(t.id, t);
    }

    const result = await rebuildPrepSchedule(service, {
      prepId: prep.id,
      userId,
      examDate: nextExamDate as string,
      dailyMinutes: nextDaily,
      studyDays: nextStudyDays,
      topics: [...topicMap.values()],
      previous,
      settings: { hard_topics_self: nextHard, learning_preferences: nextPrefs },
      nodes: (nodeRows ?? []).map((n) => ({
        id: n.id as string,
        sort_order: n.sort_order as number,
        status: n.status as string,
        session_meta: n.session_meta,
      })),
    });

    if (!result.ok) return errorResponse(500, result.error);
    summary = result.summary;
    return NextResponse.json({ ok: true, rebuilt: true, summary });
  }

  const { error: updateErr } = await service.from("exam_preps").update({
    exam_date: nextExamDate, daily_minutes: nextDaily, study_days: nextStudyDays,
    hard_topics_self: nextHard, learning_preferences: nextPrefs,
  }).eq("id", prep.id).eq("user_id", userId);
  if (updateErr) return errorResponse(500, "update_failed");

  return NextResponse.json({
    ok: true,
    rebuilt: false,
    scheduleChanged,
    preferences: nextPrefs,
  });
}
