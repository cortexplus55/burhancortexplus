/**
 * Stage 6 persistence helpers — only called when pdf_learning_v2 is ON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanNodeKind, NodeStatus } from "@/lib/learning/exam-prep-plan";
import {
  activitySucceeded,
  buildLearningIndicators,
  extractAnswerEvidence,
  foldTopicMastery,
  holdMasteryOnSuccess,
  holdTrackingOnSuccess,
  masterySnapshotFromRow,
  MASTERY_ROW_COLUMNS,
  normalizeTopicKey,
  scoreTopicMastery,
  parsePersistedTracking,
  preferNextNodeForTracking,
  stripAnswerMeta,
  toPersistedTracking,
  topicMasteryGain,
  weakOrStaleTopicKeys,
  type TopicGain,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import {
  countOpenMisconceptions,
  resolveMisconceptionsAfterEvidence,
} from "@/lib/learning/misconception-store";
import { createTopicIndex } from "@/lib/learning/topic-identity";
import { computeTopicPolicy, type PolicyEvidence, type TopicPolicy } from "@/lib/learning/mastery-policy";

/** Bir hazırlığın politika için okunan kanıt tavanı (en yeni satırlar). */
const POLICY_EVIDENCE_LIMIT = 5000;

/**
 * Faz 4: hazırlığın bütün kanıtından konu başına akıllı kavrama kararı (`mastery-policy.ts`). Konu anahtarı hazırlığın
 * konu adına bağlanır (`canonicalKey`). Okuma düşerse hata günlüğe iner ve boş döner (eski sayım kullanılır).
 */
export async function loadTopicPolicies(
  service: SupabaseClient,
  input: { userId: string; prepId: string; canonicalKey: (key: string) => string; now?: Date },
): Promise<Map<string, TopicPolicy>> {
  const { data, error } = await service
    .from("exam_prep_answer_evidence")
    .select("topic_key, source_kind, correct, hint_assisted, is_first_attempt, attempt_id, created_at")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .order("created_at", { ascending: false })
    .limit(POLICY_EVIDENCE_LIMIT);
  const out = new Map<string, TopicPolicy>();
  if (error) {
    console.error("mastery_policy_evidence_read_failed", { prepId: input.prepId, message: error.message });
    return out;
  }
  const byTopic = new Map<string, PolicyEvidence[]>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = normalizeTopicKey(input.canonicalKey(normalizeTopicKey(String(row.topic_key ?? ""))));
    const list = byTopic.get(key) ?? [];
    list.push({
      sourceKind: String(row.source_kind ?? ""),
      correct: row.correct === true,
      hintAssisted: row.hint_assisted === true,
      isFirstAttempt: row.is_first_attempt !== false,
      attemptId: (row.attempt_id as string | null) ?? null,
      createdAt: String(row.created_at ?? ""),
    });
    byTopic.set(key, list);
  }
  for (const [key, rows] of byTopic) out.set(key, computeTopicPolicy(rows, input.now ?? new Date()));
  return out;
}

export async function countPriorCompletedAttempts(
  service: SupabaseClient,
  input: { userId: string; prepId: string; nodeId: string; excludeAttemptId?: string },
): Promise<number> {
  let q = service
    .from("exam_prep_node_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("node_id", input.nodeId)
    .eq("status", "completed");
  if (input.excludeAttemptId) {
    q = q.neq("id", input.excludeAttemptId);
  }
  const { count } = await q;
  return count ?? 0;
}

export async function recordLearningTrackingAfterComplete(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    /**
     * Kanıt bir düğümün kaydına bağlı değilse null (30 Ekim 2026, Paket I #8): yol oraya gelmeden çözülen yazılı
     * deneme düğümü tamamlamaz ama konu kanıtı yazılır. O zaman ilk deneme sayılır, kayıt satırına yazılmaz.
     */
    nodeId: string | null;
    attemptId: string | null;
    kind: PlanNodeKind;
    payload: unknown;
    answers: Record<string, unknown>;
    topicLabel: string | null;
    sessionObjective: string | null;
    targetScore: number | null;
    /** Sıradaki olarak seçilmeyecek adım türleri (ücretsiz hesapta Plus adımları, `pathSkipKinds`). */
    skipKinds?: ReadonlySet<string>;
  },
): Promise<{ nextNodeId: string | null; tracking: ReturnType<typeof toPersistedTracking>; topicGain: TopicGain | null }> {
  const priorCount = input.nodeId
    ? await countPriorCompletedAttempts(service, {
        userId: input.userId,
        prepId: input.prepId,
        nodeId: input.nodeId,
        excludeAttemptId: input.attemptId ?? undefined,
      })
    : 0;
  const isFirstAttempt = priorCount === 0;
  const attemptOrdinal = priorCount + 1;

  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("id, label")
    .eq("exam_prep_id", input.prepId);

  const plannedTopicKeys = (topicRows ?? [])
    .map((t) => String(t.label ?? "").trim())
    .filter(Boolean);

  // Kanıt konunun hazırlıktaki adıyla yazılır (30 Ekim 2026, `topic-identity.ts`): içerik konuyu bir ad varyantıyla
  // taşıyınca ("Stokiyometri: sınırlayıcı bileşen") hâkimiyet planlı konuya değil yetim bir anahtara gidiyor, konu
  // "Ölçülmedi · 0 çözüldü" kalıyordu. Eşleşmeyen ad olduğu gibi kalır.
  const topicIndex = createTopicIndex(
    (topicRows ?? [])
      .map((row) => ({ id: String((row as { id?: unknown }).id ?? ""), label: String(row.label ?? "").trim() }))
      .filter((row) => row.label),
  );
  const canonicalKey = (key: string) => {
    const row = topicIndex.rowForKey(key);
    return row ? normalizeTopicKey(row.label) : key;
  };
  const evidence = extractAnswerEvidence({
    kind: input.kind,
    payload: input.payload,
    answers: input.answers,
    topicLabel: input.topicLabel,
    sessionObjective: input.sessionObjective,
    isFirstAttempt,
  }).map((row) => ({ ...row, topicKey: canonicalKey(row.topicKey) }));

  if (input.attemptId) {
    await service
      .from("exam_prep_node_attempts")
      .update({
        attempt_ordinal: attemptOrdinal,
        answer_meta: {
          hintsUsed: (input.answers.__meta as { hintsUsed?: unknown } | undefined)?.hintsUsed ??
            input.answers.__hints ??
            {},
          isFirstAttempt,
        },
      })
      .eq("id", input.attemptId);
  }

  if (evidence.length) {
    const { error: evidenceError } = await service.from("exam_prep_answer_evidence").insert(
      evidence.map((row) => ({
        user_id: input.userId,
        exam_prep_id: input.prepId,
        node_id: input.nodeId,
        attempt_id: input.attemptId,
        topic_key: row.topicKey,
        learning_objective: row.learningObjective,
        question_index: row.questionIndex,
        correct: row.correct,
        is_first_attempt: row.isFirstAttempt,
        hint_assisted: row.hintAssisted,
        independent_success: row.independentSuccess,
        wrong_type: row.wrongType,
        source_kind: row.sourceKind,
        question_preview: row.questionPreview,
      })),
    );
    // Hata yutulmaz (Faz 4): kanıt yazılamazsa günlüğe iner; hâkimiyet eldeki kanıtla hesaplanır.
    if (evidenceError) {
      console.error("answer_evidence_insert_failed", { prepId: input.prepId, nodeId: input.nodeId, message: evidenceError.message });
    }
  }

  // Yanılgı çözümü (20 Ekim 2026): bu bitişte yardımsız doğru varsa, iki ayrı günde doğru
  // cevaplanan konunun yanılgıları kapanır. Düşerse yanılgılar açık kalır; tamamlama sürer.
  if (evidence.some((row) => row.correct && !row.hintAssisted)) {
    await resolveMisconceptionsAfterEvidence(service, {
      userId: input.userId,
      prepId: input.prepId,
      plannedTopicKeys,
    }).catch(() => []);
  }

  const { data: masteryRows } = await service
    .from("exam_prep_topic_mastery")
    .select(MASTERY_ROW_COLUMNS)
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId);

  const prior: TopicMasterySnapshot[] = ((masteryRows ?? []) as Record<string, unknown>[]).map(masterySnapshotFromRow);
  // Faz 4: konu başına akıllı kavrama kararı — bu bitişin kanıtı dahil bütün kanıttan.
  const policies = await loadTopicPolicies(service, { userId: input.userId, prepId: input.prepId, canonicalKey });

  const succeeded = activitySucceeded(evidence);
  const withPolicy = (topics: TopicMasterySnapshot[]) => {
    const seen = new Set(topics.map((topic) => normalizeTopicKey(topic.topicKey)));
    const out = topics.map((topic) => {
      const policy = policies.get(normalizeTopicKey(topic.topicKey));
      return policy ? scoreTopicMastery({ ...topic, policy }) : topic;
    });
    // Yalnız kart öz bildirimi olan konu da kayda geçer (eski sayımı yok, kararı var).
    for (const [key, policy] of policies) {
      if (seen.has(key)) continue;
      out.push(
        scoreTopicMastery({
          topicKey: key,
          measured: false,
          level: "unmeasured",
          confidence: 0,
          evidenceCount: 0,
          firstAttemptCorrect: 0,
          firstAttemptTotal: 0,
          independentCorrect: 0,
          independentTotal: 0,
          lastPracticedAt: new Date().toISOString(),
          policy,
        }),
      );
    }
    return out;
  };
  const folded = holdMasteryOnSuccess(prior, withPolicy(foldTopicMastery(evidence, prior)), succeeded);
  // "+%X kazandın" kartı (19 Ekim 2026): bu etkinliğin kanıtıyla değişen konunun güveni.
  // Zayıf konuya yönelen hazırlık geneli düğümde (20 Ekim 2026) kartın adı sorulan konu.
  const tested = (input.payload as { testedTopic?: unknown } | null)?.testedTopic;
  const gainLabel = typeof tested === "string" && tested.trim() ? tested.trim() : input.topicLabel;
  const topicGain = topicMasteryGain({
    prior,
    folded,
    evidenceKeys: evidence.map((row) => row.topicKey),
    topicLabel: gainLabel ? (topicIndex.rowForKey(gainLabel)?.label ?? gainLabel) : gainLabel,
  });

  // Konular tek istekte (6 Kasım 2026, hız paketi): önce konu başına art arda bir upsert gidiyordu.
  // Aynı anahtar iki kez gelirse sonuncusu kalır (sıralı yazımda da sonuncusu kalıyordu; tek ifadede
  // aynı satıra iki kez dokunulamaz).
  const masteryUpserts = new Map<string, Record<string, unknown>>();
  for (const topic of folded) {
    if (!topic.measured && topic.evidenceCount === 0 && !topic.policy) continue;
    masteryUpserts.set(topic.topicKey, {
      user_id: input.userId,
      exam_prep_id: input.prepId,
      topic_key: topic.topicKey,
      measured_level: topic.level,
      confidence: topic.confidence,
      evidence_count: topic.evidenceCount,
      first_attempt_correct: topic.firstAttemptCorrect,
      first_attempt_total: topic.firstAttemptTotal,
      independent_correct: topic.independentCorrect,
      independent_total: topic.independentTotal,
      last_practiced_at: topic.lastPracticedAt,
      policy: topic.policy ?? null,
      updated_at: new Date().toISOString(),
    });
  }
  if (masteryUpserts.size) {
    // Tek konuda satırın kendisi (istek gövdesi eskisiyle aynı), birden çoksa dizi: ikisi de tek istek.
    const masteryRowsOut = [...masteryUpserts.values()];
    const { error: masteryError } = await service
      .from("exam_prep_topic_mastery")
      .upsert(masteryRowsOut.length === 1 ? masteryRowsOut[0]! : masteryRowsOut, {
        onConflict: "user_id,exam_prep_id,topic_key",
      });
    if (masteryError) {
      console.error("topic_mastery_upsert_failed", { prepId: input.prepId, message: masteryError.message });
    }
  }

  const { data: nodeRows } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, sort_order, session_meta")
    .eq("exam_prep_id", input.prepId)
    .order("sort_order");

  const nodes = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    status: row.status as NodeStatus,
    sortOrder: row.sort_order as number,
    sessionMeta:
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as { topicTitle?: string })
        : null,
  }));

  // Yalnız açık (çözülmemiş) yanılgılar; sütun yoksa hepsi açık sayılır.
  const misconceptionCount = await countOpenMisconceptions(service, {
    userId: input.userId,
    prepId: input.prepId,
  });

  const mockNode = nodes.find((n) => n.kind === "written_exam" && n.status === "done");
  let mockScorePct: number | null = null;
  if (mockNode) {
    const { data: mockAttempt } = await service
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("node_id", mockNode.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mockAttempt?.total) {
      mockScorePct = Math.round(
        (Number(mockAttempt.score ?? 0) / Number(mockAttempt.total)) * 100,
      );
    }
  }

  const indicators = buildLearningIndicators({
    nodes,
    topics: folded,
    plannedTopicKeys,
    mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions: misconceptionCount ?? 0,
    openMisconceptionsKnown: misconceptionCount != null,
  });
  const { data: prepRow } = await service
    .from("exam_preps")
    .select("learning_tracking")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const tracking = holdTrackingOnSuccess(
    parsePersistedTracking((prepRow as { learning_tracking?: unknown } | null)?.learning_tracking),
    toPersistedTracking(indicators),
    succeeded,
  );

  await service
    .from("exam_preps")
    .update({
      learning_tracking: tracking,
      // Keep legacy column as program progress only (not "ready" claim).
      readiness_score: tracking.programProgressPct,
    })
    .eq("id", input.prepId)
    .eq("user_id", input.userId);

  const next = preferNextNodeForTracking(nodes, {
    openMisconceptions: misconceptionCount ?? 0,
    weakOrStaleTopicKeys: weakOrStaleTopicKeys(folded),
    skipKinds: input.skipKinds,
  });

  return { nextNodeId: next?.id ?? null, tracking, topicGain };
}

export { stripAnswerMeta };
