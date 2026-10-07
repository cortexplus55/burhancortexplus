import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeFacts } from "@/lib/gamification/badges";
import { parsePersistedTracking } from "@/lib/learning/learning-tracking";

function istanbulToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

type Result<T> = { data: T | null; error: { message: string } | null };

/*
  Bir sorgu düşerse o rozet "henüz açılmadı" görünür; bütün pencere boş
  kalmaz. Ama sessizce yutulmuyor: hangi tablonun düştüğü loga yazılıyor,
  yoksa "rozetim neden açılmadı" sorusunun cevabı bulunamazdı.
*/
function rows<T>(table: string, result: Result<T[]>): T[] {
  if (result.error) {
    console.error("badge_facts_query_failed", { table, error: result.error.message });
    return [];
  }
  return result.data ?? [];
}

/**
 * Konu ustalığı yüzdesi. Uyarlanabilir motorun `mastery` kolonu (0–1)
 * varsa o, yoksa eski ölçümün güven yüzdesi. "Ustalaşıldı" eşiği motorun
 * kendi eşiği (statusFromMastery): %80 ustalık ve yeterli kanıt.
 */
function topicScore(row: {
  mastery: number | null;
  mastery_confidence: number | null;
  confidence: number | null;
  measured_level: string | null;
}): { pct: number; mastered: boolean } {
  if (typeof row.mastery === "number") {
    return {
      pct: row.mastery * 100,
      mastered: row.mastery >= 0.8 && (row.mastery_confidence ?? 0) >= 0.65,
    };
  }
  const pct = Number(row.confidence ?? 0);
  return { pct, mastered: row.measured_level === "solid" && pct >= 80 };
}

export async function loadBadgeFacts(
  service: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<BadgeFacts> {
  const [answers, preps, days, mocks, uploads, voices, topics, referrals, attempts] =
    await Promise.all([
      service
        .from("messages")
        .select("created_at")
        .eq("user_id", userId)
        .eq("role", "assistant")
        .order("created_at", { ascending: true })
        .limit(1),
      service
        .from("exam_preps")
        .select("id, created_at, learning_tracking")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("user_activity_days")
        .select("activity_date")
        .eq("user_id", userId)
        .order("activity_date", { ascending: true })
        .limit(2000),
      service
        .from("practice_exam_attempts")
        .select("completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: true })
        .limit(1),
      service
        .from("documents")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1),
      service
        .from("exam_prep_node_attempts")
        .select("created_at")
        .eq("user_id", userId)
        .eq("voice_mode", true)
        .order("created_at", { ascending: true })
        .limit(1),
      service
        .from("exam_prep_topic_mastery")
        .select("mastery, mastery_confidence, confidence, measured_level, updated_at")
        .eq("user_id", userId)
        .limit(500),
      service
        .from("profiles")
        .select("created_at")
        .eq("referred_by", userId)
        .order("created_at", { ascending: true })
        .limit(1),
      service
        .from("exam_prep_node_attempts")
        .select("node_id, created_at, updated_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .limit(1000),
    ]);

  const prepRows = rows("exam_preps", preps as Result<{ id: string; created_at: string; learning_tracking: unknown }[]>);
  const attemptRows = rows(
    "exam_prep_node_attempts",
    attempts as Result<{ node_id: string; created_at: string; updated_at: string | null }[]>,
  );

  // Ders sayısı: tamamlanan denemelerden düğümü "lesson" olanlar.
  let lessonCompletions: string[] = [];
  const nodeIds = [...new Set(attemptRows.map((a) => a.node_id).filter(Boolean))];
  if (nodeIds.length) {
    const lessonNodes = rows(
      "exam_prep_nodes",
      (await service
        .from("exam_prep_nodes")
        .select("id")
        .in("id", nodeIds.slice(0, 1000))
        .eq("kind", "lesson")) as Result<{ id: string }[]>,
    );
    const lessonIds = new Set(lessonNodes.map((n) => n.id));
    lessonCompletions = attemptRows
      .filter((a) => lessonIds.has(a.node_id))
      .map((a) => a.updated_at ?? a.created_at);
  }

  let bestTopic: BadgeFacts["bestTopic"] = null;
  for (const row of rows(
    "exam_prep_topic_mastery",
    topics as Result<{
      mastery: number | null;
      mastery_confidence: number | null;
      confidence: number | null;
      measured_level: string | null;
      updated_at: string | null;
    }[]>,
  )) {
    const score = topicScore(row);
    const better =
      !bestTopic ||
      (score.mastered && !bestTopic.mastered) ||
      (score.mastered === bestTopic.mastered && score.pct > bestTopic.pct);
    if (better) bestTopic = { ...score, at: row.updated_at };
  }

  let bestReadiness: BadgeFacts["bestReadiness"] = null;
  for (const prep of prepRows) {
    const tracking = parsePersistedTracking(prep.learning_tracking);
    if (!tracking) continue;
    if (!bestReadiness || tracking.examReadinessPct > bestReadiness.pct) {
      bestReadiness = { pct: tracking.examReadinessPct, at: tracking.updatedAt };
    }
  }

  const first = <T extends Record<string, unknown>>(table: string, result: unknown, key: keyof T) =>
    (rows(table, result as Result<T[]>)[0]?.[key] as string | undefined) ?? null;

  return {
    firstAnswerAt: first<{ created_at: string }>("messages", answers, "created_at"),
    firstPrepAt: prepRows.length ? prepRows[prepRows.length - 1].created_at : null,
    lessonCompletions,
    activityDays: rows("user_activity_days", days as Result<{ activity_date: string }[]>).map((d) =>
      String(d.activity_date).slice(0, 10),
    ),
    firstMockExamAt: first<{ completed_at: string }>("practice_exam_attempts", mocks, "completed_at"),
    firstUploadAt: first<{ created_at: string }>("documents", uploads, "created_at"),
    firstVoiceAt: first<{ created_at: string }>("exam_prep_node_attempts", voices, "created_at"),
    bestTopic,
    firstReferralAt: first<{ created_at: string }>("profiles", referrals, "created_at"),
    bestReadiness,
    latestPrepId: prepRows[0]?.id ?? null,
    today: istanbulToday(now),
  };
}
