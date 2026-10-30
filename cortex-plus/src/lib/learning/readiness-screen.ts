import {
  MASTERY_EVIDENCE_FLOOR,
  READY_HEADLINE,
  computeExamReadiness,
  computeProgramProgress,
  effectiveTarget,
  isMeasuredTopic,
  normalizeTopicKey,
  topicIsSolid,
  topicMasteryPercent,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { rankFinalStepTopics, type FinalTopicRank } from "@/lib/learning/prep-wide-target";

/** Düğüm adresine konu seçimi (`?konu=`): odaklı pratik önerilen konuyla açılır. */
function withTopicQuery(href: string, topic: string): string {
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}konu=${encodeURIComponent(topic)}`;
}

export type ReadinessTopicState = "ready" | "needs_work" | "unmeasured";

export type ReadinessTopicRow = {
  topic: string;
  state: ReadinessTopicState;
  /** `topicMasteryPercent`: yol, sözlü seçici ve İlerleme'deki sayıyla aynı. */
  pct: number;
  detail: string;
};

export type ReadinessAction = {
  label: string;
  href: string;
};

export type ReadinessScreen = {
  /** Yalnızca ölçüm bunu destekliyorsa "Hazırsın". */
  headline: string;
  ready: boolean;
  lead: string;
  topics: ReadinessTopicRow[];
  actions: ReadinessAction[];
  mockLine: string;
};

const LEVEL_TR: Record<TopicMasterySnapshot["level"], string> = {
  unmeasured: "ölçülmedi",
  weak: "zayıf",
  emerging: "gelişiyor",
  solid: "sağlam",
};

/**
 * Konunun cevap sayımı (30 Ekim 2026, Paket I #7): doğru ve yanlış aynı iki sayıdan, toplamları soru sayısı.
 * Yüzde (`topicMasteryPercent`) de bu iki sayıdan çıkar. Önceden "36 denemeden 15 doğru, 22 açık yanlış"
 * yazıyordu: açık yanılgı satırları (ipuçlu cevaplar ve tekrarlar dahil) yanlış sayısıymış gibi okunuyordu.
 */
export function topicAnswerTally(topic: TopicMasterySnapshot): { total: number; correct: number; wrong: number } {
  const total = topic.independentTotal > 0 ? topic.independentTotal : topic.firstAttemptTotal;
  const correct = topic.independentTotal > 0 ? topic.independentCorrect : topic.firstAttemptCorrect;
  const safeTotal = Math.max(0, total);
  const safeCorrect = Math.max(0, Math.min(safeTotal, correct));
  return { total: safeTotal, correct: safeCorrect, wrong: safeTotal - safeCorrect };
}

function detailFor(topic: TopicMasterySnapshot, openMisses: number): string {
  if (!topic.measured || topic.evidenceCount === 0) return "Bu konuda kayıtlı cevap yok.";
  const parts: string[] = [];
  const tally = topicAnswerTally(topic);
  if (tally.total > 0) {
    parts.push(`${tally.total} sorudan ${tally.correct} doğru, ${tally.wrong} yanlış`);
  } else {
    parts.push(`${topic.evidenceCount} kayıtlı cevap`);
  }
  if (!isMeasuredTopic(topic)) parts.push(`ölçüm için en az ${MASTERY_EVIDENCE_FLOOR} cevap gerekir`);
  // Açık yanılgı ayrı ad: kapanmamış yanılgı satırıdır, yanlış cevap sayısı değil.
  if (openMisses > 0) parts.push(`${openMisses} yanılgı henüz kapanmadı`);
  if (isMeasuredTopic(topic)) parts.push(`seviye: ${LEVEL_TR[topic.level]}`);
  return parts.join(" · ");
}

/**
 * Baraj hedef puandır. "Sağlam" `topicIsSolid`: ölçülmüş (en az 3 cevap) ve yüzde hedefte. 1-2 cevaplı konu
 * "ölçülmedi" (Paket I #7: sayı göstermez). Kayıt yoksa ölçülmedi.
 */
export function topicState(topic: TopicMasterySnapshot, target: number): ReadinessTopicState {
  if (!isMeasuredTopic(topic)) return "unmeasured";
  return topicIsSolid(topic, target) ? "ready" : "needs_work";
}

/** Hazırsın satırının yüzdesi. Yol, sözlü ve İlerleme aynı sayıyı gösterir. */
export function readinessTopicPercent(topic: TopicMasterySnapshot): number {
  return topicMasteryPercent(topic);
}

export function buildReadinessScreen(input: {
  /**
   * Final adımlarının seçicisi (`rankFinalStepTopics`, Paket I #8): öneri bunun ilki. Verilmezse aynı kural
   * buradan hesaplanır (açık yanılgılar `openMissesByTopic`'ten).
   */
  ranked?: FinalTopicRank[];
  plannedTopics: string[];
  mastery: TopicMasterySnapshot[];
  openMissesByTopic: { topic: string; count: number }[];
  /** Bütün açık yanılgılar (liste en yeni 40'ı taşır); verilmezse listeden toplanır. */
  openMisconceptionsTotal?: number;
  mockScorePct: number | null;
  targetScore: number | null;
  nodes: { kind: PlanNodeKind; status: NodeStatus }[];
  links: { focused?: string | null; written?: string | null; quiz?: string | null; home: string };
}): ReadinessScreen {
  const planned = input.plannedTopics.map((topic) => topic.trim()).filter(Boolean);
  const byKey = new Map(
    input.mastery.map((topic) => [normalizeTopicKey(topic.topicKey), topic]),
  );
  const misses = new Map(
    input.openMissesByTopic.map((row) => [normalizeTopicKey(row.topic), row.count]),
  );
  const labels = planned.length
    ? planned
    : input.mastery.map((topic) => topic.topicKey).filter((topic) => topic && topic !== "genel");

  // Hedef girilmemişse karar %70'e göre verilir; ekran da aynı sayıyı söyler.
  const target = effectiveTarget(input.targetScore);
  const topics: ReadinessTopicRow[] = labels.map((label) => {
    const snapshot = byKey.get(normalizeTopicKey(label)) ?? {
      topicKey: label,
      measured: false,
      level: "unmeasured" as const,
      confidence: 0,
      evidenceCount: 0,
      firstAttemptCorrect: 0,
      firstAttemptTotal: 0,
      independentCorrect: 0,
      independentTotal: 0,
      lastPracticedAt: null,
    };
    const open = misses.get(normalizeTopicKey(label)) ?? 0;
    return {
      topic: label,
      state: topicState(snapshot, target),
      pct: readinessTopicPercent(snapshot),
      detail: detailFor(snapshot, open),
    };
  });

  const program = computeProgramProgress(input.nodes);
  const openMisconceptions = input.openMisconceptionsTotal ?? input.openMissesByTopic.reduce((sum, row) => sum + row.count, 0);
  const verdict = computeExamReadiness({
    programPct: program.pct,
    topics: input.mastery,
    plannedTopicKeys: planned,
    mockScorePct: input.mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions,
  });

  const ready = verdict.claimFullyReady;
  // En düşük ölçülen başarı önce (30 Ekim 2026, Paket I #8): öneri planın sırasıyla değil, en zayıf konuyla
  // başlıyordu ("%42" dururken başka konu önerildi).
  const needsWork = topics
    .map((topic, index) => ({ topic, index }))
    .filter((row) => row.topic.state === "needs_work")
    .sort((a, b) => a.topic.pct - b.topic.pct || a.index - b.index)
    .map((row) => row.topic);
  const unmeasured = topics.filter((topic) => topic.state === "unmeasured");
  const readyTopics = topics.filter((topic) => topic.state === "ready");
  const ranked =
    input.ranked ??
    rankFinalStepTopics({
      plannedTopics: labels,
      mastery: input.mastery,
      openMisses: input.openMissesByTopic.flatMap((row) =>
        Array.from({ length: Math.max(0, row.count) }, () => ({ topicLabel: row.topic })),
      ),
      targetScore: input.targetScore,
    });
  const weakest = ranked[0]?.label ?? needsWork[0]?.topic ?? null;

  let headline = "Henüz hazırsın diyemeyiz";
  let lead = "Bu ekran kayıtlı cevaplarından hesaplanır.";
  if (ready) {
    headline = READY_HEADLINE;
    const mock = input.mockScorePct;
    lead =
      mock != null && mock >= target
        ? `Yazılı denemede %${Math.round(mock)} aldın; hedefin %${target}.`
        : `Genel hazırlık skorun %${verdict.pct}; hedefin %${target}.`;
    if (needsWork.length) {
      lead += ` İstersen ${needsWork.length} konuyu bir tur daha pekiştirebilirsin.`;
    }
  } else if (!topics.length || (readyTopics.length === 0 && needsWork.length === 0 && unmeasured.length === topics.length && input.mockScorePct == null)) {
    headline = "Henüz ölçüm yok";
    lead = "Hazır demek için önce konu konu cevap görmemiz gerekir.";
  } else {
    const left = [
      needsWork.length ? `${needsWork.length} konu çalışılacak` : "",
      unmeasured.length ? `${unmeasured.length} konu ölçülmedi` : "",
    ].filter(Boolean);
    lead = left.length
      ? `${left.join(", ")}. Etkinlik bitirmek tek başına hazır olmak değildir.`
      : verdict.label;
  }

  const actions: ReadinessAction[] = [];
  // Tek öneri, tek konu: odaklı pratik o konuyla açılır (`?konu=`); etiket ve sorular aynı konu.
  if (!ready && weakest && input.links.focused) {
    actions.push({
      label: `Odaklı pratik: ${weakest}`,
      href: withTopicQuery(input.links.focused, weakest),
    });
  }
  // Genel skorla hazır olan öğrenciye de deneme önerilir: karar değişmez, ölçüm güçlenir.
  if (input.mockScorePct == null && input.links.written) {
    actions.push({ label: "Yazılı denemeyi çöz", href: input.links.written });
  } else if (input.mockScorePct != null && input.mockScorePct < target && input.links.written) {
    actions.push({
      label: `Deneme hedefin altında (%${input.mockScorePct}). Bir tur daha çöz`,
      href: input.links.written,
    });
  }
  if (!ready && unmeasured.length && input.links.quiz) {
    actions.push({
      label: `Ölçülmeyen konu için test: ${unmeasured[0].topic}`,
      href: input.links.quiz,
    });
  }
  if (!actions.length) {
    actions.push({ label: "Çalışma yoluna dön", href: input.links.home });
  }

  const mockLine =
    input.mockScorePct == null
      ? "Yazılı deneme henüz çözülmedi."
      : input.targetScore == null
        ? `Yazılı deneme skoru %${input.mockScorePct}. Hedef %${target} (hedef puan girilmediği için varsayılan).`
        : `Yazılı deneme skoru %${input.mockScorePct}. Hedef %${target}.`;

  return { headline, ready, lead, topics, actions, mockLine };
}
