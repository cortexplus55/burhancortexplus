/**
 * Stage 6 — program progress ≠ topic mastery ≠ exam readiness.
 * Pure helpers; runtime writes only when pdf_learning_v2 is ON.
 */

import {
  sameOptionSet,
  selectedOptions,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import type { PlanNodeKind, NodeStatus } from "@/lib/learning/exam-prep-plan";
import { nodeProgress } from "@/lib/learning/exam-prep-plan";
import { podcastCheckAnswered, podcastCheckOf } from "@/lib/learning/podcast-check";
import { PATH_LOOKAHEAD } from "@/lib/learning/study-path-window";

export type AnswerEvidenceDraft = {
  topicKey: string;
  learningObjective: string | null;
  questionIndex: number;
  correct: boolean;
  isFirstAttempt: boolean;
  hintAssisted: boolean;
  independentSuccess: boolean;
  wrongType: string | null;
  sourceKind: string;
  questionPreview: string | null;
};

export type TopicMasterySnapshot = {
  topicKey: string;
  measured: boolean;
  level: "unmeasured" | "weak" | "emerging" | "solid";
  /** 0 when unmeasured — never inflate confidence. */
  confidence: number;
  evidenceCount: number;
  firstAttemptCorrect: number;
  firstAttemptTotal: number;
  independentCorrect: number;
  independentTotal: number;
  lastPracticedAt: string | null;
};

export type LearningIndicators = {
  programProgress: {
    pct: number;
    done: number;
    total: number;
    label: string;
  };
  topicMastery: {
    /** null when nothing measured yet. */
    pct: number | null;
    label: string;
    measuredCount: number;
    unmeasuredCount: number;
    topics: TopicMasterySnapshot[];
  };
  examReadiness: {
    pct: number;
    label: string;
    /** True only when estimate is genuinely maxed with evidence. */
    claimFullyReady: boolean;
    components: {
      measuredSuccessPct: number | null;
      mockPct: number | null;
      coveragePct: number;
      programPct: number;
      openMisconceptions: number;
    };
  };
};

export type TrackingPersisted = {
  version: 1;
  updatedAt: string;
  programProgressPct: number;
  topicMasteryPct: number | null;
  examReadinessPct: number;
  claimFullyReady: boolean;
  measuredTopicCount: number;
  unmeasuredTopicCount: number;
  openMisconceptions: number;
};

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeTopicKey(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return t || "genel";
}

/**
 * Build per-answer evidence from a scored attempt payload.
 * Flashcards never count as mastery evidence (participation only).
 */
export function extractAnswerEvidence(input: {
  kind: PlanNodeKind;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel?: string | null;
  sessionObjective?: string | null;
  isFirstAttempt: boolean;
  /** Per question index — true if student used a hint before / with the answer. */
  hintsUsed?: Record<string, boolean>;
}): AnswerEvidenceDraft[] {
  const data = (input.payload ?? {}) as Record<string, unknown>;
  // Hazırlık geneli düğüm zayıf konuya yönelince (20 Ekim 2026) içerik o konunun adını taşır;
  // kanıt düğümün devraldığı konuya değil sorulan konuya yazılır (yanılgı satırıyla aynı kural).
  const stamped = typeof data.testedTopic === "string" ? data.testedTopic.trim() : "";
  const topicKey = normalizeTopicKey(stamped || input.topicLabel);
  const hints = input.hintsUsed ?? parseHintsUsed(input.answers);
  const out: AnswerEvidenceDraft[] = [];

  if (data.type === "quiz") {
    const questions =
      (data.questions as (QuizQuestion & {
        misconceptionTag?: string;
        learningObjective?: string;
      })[]) ?? [];
    questions.forEach((question, index) => {
      const correct = sameOptionSet(
        selectedOptions(input.answers[String(index)]),
        question.correct ?? [],
      );
      const hintAssisted = Boolean(hints[String(index)]);
      const questionTopic = (question as { topic?: string }).topic;
      out.push({
        topicKey: normalizeTopicKey(questionTopic || stamped || input.topicLabel),
        learningObjective:
          question.learningObjective?.trim() ||
          input.sessionObjective?.trim() ||
          null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct
          ? null
          : question.misconceptionTag?.trim() || "quiz_miss",
        sourceKind: input.kind,
        questionPreview: question.text?.slice(0, 160) ?? null,
      });
    });
  }

  if (data.type === "true_false") {
    const items =
      (data.items as {
        text: string;
        correct: boolean;
        misconceptionTag?: string;
      }[]) ?? [];
    items.forEach((item, index) => {
      const value = input.answers[String(index)];
      const correct = value === item.correct || value === String(item.correct);
      const hintAssisted = Boolean(hints[String(index)]);
      out.push({
        topicKey,
        learningObjective: input.sessionObjective?.trim() || null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct
          ? null
          : item.misconceptionTag?.trim() || "true_false_miss",
        sourceKind: "true_false",
        questionPreview: item.text?.slice(0, 160) ?? null,
      });
    });
  }

  if (data.type === "oral") {
    const questions =
      (data.questions as {
        prompt?: string;
        hint?: string;
        learningObjective?: string;
      }[]) ?? [];
    const gradeMeta = data.gradeMeta as
      | { correctIndices?: number[]; correctCount?: number }
      | undefined;
    const testedTopic = typeof data.testedTopic === "string" ? data.testedTopic : "";
    const oralTopic = normalizeTopicKey(testedTopic || input.topicLabel);
    questions.forEach((question, index) => {
      const hasAnswer = String(input.answers[String(index)] ?? "").trim().length > 8;
      // Without per-item grades, credit length-checked answers as provisional.
      let correct = hasAnswer;
      if (Array.isArray(gradeMeta?.correctIndices)) {
        correct = gradeMeta.correctIndices.includes(index);
      } else if (typeof gradeMeta?.correctCount === "number") {
        // Conservative: only first N length-ok answers count when only a count is known.
        correct = hasAnswer && index < gradeMeta.correctCount;
      }
      const hintAssisted =
        Boolean(hints[String(index)]);
      out.push({
        topicKey: oralTopic,
        learningObjective:
          question.learningObjective?.trim() ||
          input.sessionObjective?.trim() ||
          null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct ? null : "oral_miss",
        sourceKind: "oral",
        questionPreview: question.prompt?.slice(0, 160) ?? null,
      });
    });
  }

  // Podcast'in dinleme kontrolü (20 Ekim 2026, ürün sahibinin kararı: kanıt sayılır). Yalnız
  // cevaplandıysa; "Şimdi değil" boş cevapla biter ve kanıt yazmaz.
  // Önbellekten gelen podcast ("Yeniden dinle") aynı üç soruyu yeniden sorar; ikinci kez kanıt olmaz
  // (20 Ekim inceleme: hâkimiyet her dinleyişte şişiyordu).
  // 22 Ekim 2026 inceleme: önbellekten gelen podcast (hazırlığın podcast sayfası ya da önceden yazım doldurmuş)
  // ilk dinleyişte de `reused` taşıyor; kontrolün İLK cevabı kanıttır. Yalnız aynı düğümün ikinci dinleyişi yazmaz.
  if (data.type === "podcast" && (data.reused !== true || input.isFirstAttempt)) {
    const check = podcastCheckOf(data);
    if (podcastCheckAnswered(check, input.answers)) {
      check.forEach((question, index) => {
        const correct = sameOptionSet(selectedOptions(input.answers[String(index)]), question.correct);
        const hintAssisted = Boolean(hints[String(index)]);
        out.push({
          topicKey,
          learningObjective: question.learningObjective?.trim() || input.sessionObjective?.trim() || null,
          questionIndex: index,
          correct,
          isFirstAttempt: input.isFirstAttempt,
          hintAssisted,
          independentSuccess: correct && !hintAssisted,
          wrongType: correct ? null : question.misconceptionTag?.trim() || "podcast_check_miss",
          sourceKind: "podcast",
          questionPreview: question.text.slice(0, 160),
        });
      });
    }
  }

  // Yazılı deneme (20 Ekim 2026): notlanan her soru kendi konusuna kanıt. Konu adı denemenin soru
  // satırında (`practice_exam_questions.topic_label` = `exam_prep_topics.label`). Kısmi ve boş
  // cevap doğru sayılmaz; kısmi puan yalnız deneme puanında kalır. Sınavda yardım yok.
  if (data.type === "mock_exam") {
    const items = (data.items as { topic?: string; correct?: boolean; verdict?: string }[] | undefined) ?? [];
    items.forEach((item, index) => {
      const correct = item.correct === true;
      out.push({
        topicKey: normalizeTopicKey(item.topic || input.topicLabel),
        learningObjective: null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted: false,
        independentSuccess: correct,
        wrongType: correct ? null : item.verdict === "bos" ? "mock_blank" : "mock_miss",
        sourceKind: "written_exam",
        questionPreview: null,
      });
    });
  }

  // Kartlar, ders ve kontrolsüz podcast: kanıt yok.
  return out.slice(0, 40);
}

export function parseHintsUsed(
  answers: Record<string, unknown>,
): Record<string, boolean> {
  const meta = answers.__meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const hints = (meta as { hintsUsed?: unknown }).hintsUsed;
    if (hints && typeof hints === "object" && !Array.isArray(hints)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(hints as Record<string, unknown>)) {
        out[k] = Boolean(v);
      }
      return out;
    }
  }
  const direct = answers.__hints;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(direct as Record<string, unknown>)) {
      out[k] = Boolean(v);
    }
    return out;
  }
  return {};
}

/** Strip tracking meta before persisting raw student answers. */
export function stripAnswerMeta(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const { __meta, __hints, ...rest } = answers;
  void __meta;
  void __hints;
  return rest;
}

export function foldTopicMastery(
  evidence: AnswerEvidenceDraft[],
  prior: TopicMasterySnapshot[] = [],
  nowIso = new Date().toISOString(),
): TopicMasterySnapshot[] {
  const map = new Map<string, TopicMasterySnapshot>();
  for (const p of prior) {
    map.set(normalizeTopicKey(p.topicKey), { ...p });
  }

  for (const row of evidence) {
    const key = normalizeTopicKey(row.topicKey);
    const cur =
      map.get(key) ??
      ({
        topicKey: key,
        measured: false,
        level: "unmeasured",
        confidence: 0,
        evidenceCount: 0,
        firstAttemptCorrect: 0,
        firstAttemptTotal: 0,
        independentCorrect: 0,
        independentTotal: 0,
        lastPracticedAt: null,
      } satisfies TopicMasterySnapshot);

    cur.measured = true;
    cur.evidenceCount += 1;
    cur.lastPracticedAt = nowIso;

    // İpucuyla verilen cevap ilk denemede "bildi" sayılmaz (22 Ekim 2026 inceleme): bütün soruları eğitmen
    // yardımıyla doğru cevaplayan öğrencinin bağımsız kanıtı yoktu, puan ilk deneme oranına düşüyor ve konu
    // "sağlam" çıkıyordu. Soru ilk denemenin toplamında kalır (soruldu), doğrusuna girmez.
    if (row.isFirstAttempt) {
      cur.firstAttemptTotal += 1;
      if (row.correct && !row.hintAssisted) cur.firstAttemptCorrect += 1;
    }
    // Independent successes are counted against all graded items that were not hint-assisted.
    if (!row.hintAssisted) {
      cur.independentTotal += 1;
      if (row.correct) cur.independentCorrect += 1;
    }

    map.set(key, cur);
  }

  return [...map.values()].map(scoreTopicMastery);
}

export function scoreTopicMastery(topic: TopicMasterySnapshot): TopicMasterySnapshot {
  if (!topic.measured || topic.evidenceCount === 0) {
    return {
      ...topic,
      measured: false,
      level: "unmeasured",
      confidence: 0,
    };
  }

  const rate =
    topic.independentTotal > 0
      ? topic.independentCorrect / topic.independentTotal
      : topic.firstAttemptTotal > 0
        ? topic.firstAttemptCorrect / topic.firstAttemptTotal
        : 0;

  let level: TopicMasterySnapshot["level"] = "weak";
  if (rate >= 0.85 && topic.evidenceCount >= 3) level = "solid";
  else if (rate >= 0.55) level = "emerging";
  else level = "weak";

  // Confidence scales with evidence; unmeasured stays 0.
  const sampleFactor = Math.min(1, topic.evidenceCount / 5);
  const confidence = Math.round(rate * 100 * sampleFactor);

  return { ...topic, level, confidence };
}

export function computeProgramProgress(
  nodes: { status: NodeStatus }[],
): LearningIndicators["programProgress"] {
  const progress = nodeProgress(nodes);
  let label = "Henüz başlamadın";
  if (progress.pct >= 100) label = "Planlanan etkinlikler tamamlandı";
  else if (progress.pct >= 80) label = "Etkinliklerin çoğu tamamlandı";
  else if (progress.pct > 0) label = "Program ilerliyor";
  return { ...progress, label };
}

/**
 * Exam readiness estimate — never equals program completion alone.
 *
 * "Hazırsın" kararı `readyForTarget`: deneme ya da bu yüzde hedefi geçtiyse. Yüzde dürüst kalır:
 * tavanlar yerinde (açık yanılgı, kapsam, ölçülen başarı); iddia yoksa en çok 99. Bütün
 * etkinlikleri yanlışlarla bitirmek yine 100 / "hazır" vermez.
 */
/** Hedef puan girilmemişse deneme bu hedefe göre ölçülür; ekran da aynı sayıyı söyler. */
export const DEFAULT_TARGET_SCORE = 70;

/** "Hazırsın" başlığı: karar ekranı, değerlendirme ve yol aynı metni gösterir. */
export const READY_HEADLINE = "🎉 Sınava Hazırsın! Hedefini Başarıyla Geçtin";

function finitePct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Hedef girilmemişse varsayılan; her yüzey aynı sayıyı kullanır. */
export function effectiveTarget(targetScore: number | null | undefined): number {
  return finitePct(targetScore ?? null) ?? DEFAULT_TARGET_SCORE;
}

/**
 * "Hazırsın" kuralı (25 Ekim 2026, ürün sahibinin kararı) — tek ve deterministik: yazılı deneme
 * skoru ya da genel hazırlık skoru hedefe ulaştıysa hazırsın. Ders, konu ya da sınav türü
 * fark etmez. Önceden her konunun sağlam olması ve açık yanılgı olmaması da isteniyordu:
 * denemede %89 alıp %80 hedefi geçen öğrenci "Henüz hazırsın diyemeyiz" görüyordu.
 */
export function readyForTarget(input: {
  mockScorePct?: number | null;
  overallPct?: number | null;
  targetScore?: number | null;
}): boolean {
  const target = effectiveTarget(input.targetScore);
  const mock = finitePct(input.mockScorePct);
  const overall = finitePct(input.overallPct);
  return (mock != null && mock >= target) || (overall != null && overall >= target);
}

/** Konunun doğruluğu (bağımsız deneme, yoksa ilk deneme); kayıt yoksa null. */
export function topicAccuracyPct(topic: TopicMasterySnapshot): number | null {
  if (!topic.measured || topic.evidenceCount === 0) return null;
  if (topic.independentTotal > 0) return Math.round((topic.independentCorrect / topic.independentTotal) * 100);
  if (topic.firstAttemptTotal > 0) return Math.round((topic.firstAttemptCorrect / topic.firstAttemptTotal) * 100);
  return Number.isFinite(topic.confidence) ? Math.round(topic.confidence) : null;
}

export function computeExamReadiness(input: {
  programPct: number;
  topics: TopicMasterySnapshot[];
  /** Planned topic keys from schedule / topic map; unlisted evidence still counts. */
  plannedTopicKeys?: string[];
  mockScorePct?: number | null;
  targetScore?: number | null;
  openMisconceptions?: number;
  /** Açık yanılgı sayısı okunamadıysa false: sayı 0 sanılmaz, "Hazırsın" kapalı kalır. */
  openMisconceptionsKnown?: boolean;
}): LearningIndicators["examReadiness"] {
  const planned = (input.plannedTopicKeys ?? []).map(normalizeTopicKey);
  const byKey = new Map(input.topics.map((t) => [normalizeTopicKey(t.topicKey), t]));
  const keys =
    planned.length > 0
      ? [...new Set([...planned, ...byKey.keys()])]
      : [...byKey.keys()];

  let measured = 0;
  let unmeasured = 0;
  let successSum = 0;
  let successN = 0;
  for (const key of keys.length ? keys : ["genel"]) {
    const t = byKey.get(key);
    if (!t || !t.measured || t.evidenceCount === 0) {
      unmeasured += 1;
      continue;
    }
    measured += 1;
    const rate =
      t.independentTotal > 0
        ? t.independentCorrect / t.independentTotal
        : t.firstAttemptTotal > 0
          ? t.firstAttemptCorrect / t.firstAttemptTotal
          : 0;
    successSum += rate;
    successN += 1;
  }

  void unmeasured;
  const measuredSuccessPct =
    successN > 0 ? Math.round((successSum / successN) * 100) : null;
  const coveragePct =
    keys.length > 0 ? Math.round((measured / keys.length) * 100) : measured > 0 ? 100 : 0;
  const mockPct =
    input.mockScorePct == null || Number.isNaN(input.mockScorePct)
      ? null
      : Math.max(0, Math.min(100, Math.round(input.mockScorePct)));
  const openMisconceptions = Math.max(0, input.openMisconceptions ?? 0);
  const misconceptionsKnown = input.openMisconceptionsKnown !== false;

  // No measured evidence → low readiness, never high confidence.
  if (measured === 0 || measuredSuccessPct == null) {
    // 19 Ekim 2026: 16 konulu yolda ilk ders bitince %1'in altı yuvarlanıp "%0" çıkıyordu; Astra
    // aynı anda %2 gösteriyor. İlerleme varsa en az %1 — ölçüm iddiası değil, sıfır değil işareti.
    const base = Math.min(15, Math.max(input.programPct > 0 ? 1 : 0, Math.round(input.programPct * 0.1)));
    const claimByMock = readyForTarget({ mockScorePct: mockPct, targetScore: input.targetScore });
    const pct = claimByMock && mockPct != null ? Math.max(base, mockPct) : base;
    return {
      pct,
      label: claimByMock
        ? "Deneme skorun hedefi geçti"
        : "Henüz ölçülmüş konu yok — hazırlık tahmini düşük",
      claimFullyReady: claimByMock,
      components: {
        measuredSuccessPct: null,
        mockPct,
        coveragePct,
        programPct: input.programPct,
        openMisconceptions,
      },
    };
  }

  const target = effectiveTarget(input.targetScore);
  const mockFactor =
    mockPct == null ? measuredSuccessPct : Math.round(0.6 * measuredSuccessPct + 0.4 * mockPct);

  let pct = Math.round(
    0.45 * measuredSuccessPct +
      0.25 * mockFactor +
      0.2 * coveragePct +
      0.1 * input.programPct,
  );

  // Hard caps — completion ≠ readiness.
  // Açık yanılgı varken %85 üstü yok. Düzelmiş eski yanlış bu tavanı getirmez (20 Ekim 2026):
  // onun payını ölçülen başarı tavanı (aşağıda) zaten dürüstçe düşürüyor.
  if (openMisconceptions > 0 || !misconceptionsKnown) {
    pct = Math.min(pct, 85);
  }
  if (measuredSuccessPct < 100) {
    pct = Math.min(pct, measuredSuccessPct);
  }
  if (coveragePct < 100) {
    pct = Math.min(pct, 90);
  }
  if (input.programPct >= 100 && measuredSuccessPct < 70) {
    pct = Math.min(pct, Math.max(10, measuredSuccessPct - 5));
  }
  // Absolute: all activities done with mostly wrongs → not "ready".
  if (input.programPct >= 100 && measuredSuccessPct <= 40) {
    pct = Math.min(pct, 25);
  }
  if (mockPct != null && mockPct < target) {
    pct = Math.min(pct, Math.max(mockPct, measuredSuccessPct - 10));
  }

  pct = Math.max(0, Math.min(100, pct));

  // Genel skor ancak her planlı konu ölçüldüyse geneldir: 10 konudan biri ölçülmüşken "Hazırsın" denmez.
  const claimFullyReady = readyForTarget({
    mockScorePct: mockPct,
    overallPct: coveragePct >= 100 ? pct : null,
    targetScore: target,
  });
  // Hedefi geçen deneme yüzdeyi onun altında bırakmaz: ekran "Hazırsın" derken %60 yazmasın.
  if (claimFullyReady && mockPct != null) pct = Math.max(pct, mockPct);

  if (!claimFullyReady && pct >= 100) {
    pct = 99;
  }

  let label = "Hazırlık tahmini oluşuyor";
  if (claimFullyReady) label = "Hedefini geçtin";
  else if (pct >= 80) label = "İyi gidiyorsun; eksikler var";
  else if (pct >= 50) label = "Orta hazırlık — zayıf konulara dön";
  else if (pct > 0) label = "Hazırlık henüz düşük";
  else label = "Hazırlık ölçülmedi";

  return {
    pct,
    label,
    claimFullyReady,
    components: {
      measuredSuccessPct,
      mockPct,
      coveragePct,
      programPct: input.programPct,
      openMisconceptions,
    },
  };
}

export function computeTopicMasterySummary(
  topics: TopicMasterySnapshot[],
  plannedTopicKeys: string[] = [],
): LearningIndicators["topicMastery"] {
  const planned = plannedTopicKeys.map(normalizeTopicKey);
  const byKey = new Map(topics.map((t) => [normalizeTopicKey(t.topicKey), t]));
  const keys =
    planned.length > 0
      ? [...new Set([...planned, ...byKey.keys()])]
      : [...byKey.keys()];

  const snapshots: TopicMasterySnapshot[] = keys.length
    ? keys.map((key) => {
        const t = byKey.get(key);
        if (t) return scoreTopicMastery(t);
        return {
          topicKey: key,
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
      })
    : topics.map(scoreTopicMastery);

  const measured = snapshots.filter((t) => t.measured);
  const unmeasuredCount = snapshots.length - measured.length;
  const pct =
    measured.length === 0
      ? null
      : Math.round(
          measured.reduce((sum, t) => sum + t.confidence, 0) / measured.length,
        );

  let label = "Konu hâkimiyeti henüz ölçülmedi";
  if (pct == null) label = "Ölçülmemiş konular — yüksek güven yok";
  else if (pct >= 80) label = "Ölçülen konularda güçlü sinyal";
  else if (pct >= 50) label = "Ölçülen konularda karışık sinyal";
  else label = "Ölçülen konularda zayıf sinyal";

  return {
    pct,
    label,
    measuredCount: measured.length,
    unmeasuredCount,
    topics: snapshots,
  };
}

export function buildLearningIndicators(input: {
  nodes: { kind: PlanNodeKind; status: NodeStatus }[];
  topics: TopicMasterySnapshot[];
  plannedTopicKeys?: string[];
  mockScorePct?: number | null;
  targetScore?: number | null;
  openMisconceptions?: number;
  openMisconceptionsKnown?: boolean;
}): LearningIndicators {
  const programProgress = computeProgramProgress(input.nodes);
  const topicMastery = computeTopicMasterySummary(
    input.topics,
    input.plannedTopicKeys,
  );
  const examReadiness = computeExamReadiness({
    programPct: programProgress.pct,
    topics: topicMastery.topics,
    plannedTopicKeys: input.plannedTopicKeys,
    mockScorePct: input.mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions: input.openMisconceptions,
    openMisconceptionsKnown: input.openMisconceptionsKnown,
  });
  return { programProgress, topicMastery, examReadiness };
}

export function toPersistedTracking(
  indicators: LearningIndicators,
  nowIso = new Date().toISOString(),
): TrackingPersisted {
  return {
    version: 1,
    updatedAt: nowIso,
    programProgressPct: indicators.programProgress.pct,
    topicMasteryPct: indicators.topicMastery.pct,
    examReadinessPct: indicators.examReadiness.pct,
    claimFullyReady: indicators.examReadiness.claimFullyReady,
    measuredTopicCount: indicators.topicMastery.measuredCount,
    unmeasuredTopicCount: indicators.topicMastery.unmeasuredCount,
    openMisconceptions: indicators.examReadiness.components.openMisconceptions,
  };
}

export function parsePersistedTracking(raw: unknown): TrackingPersisted | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  return {
    version: 1,
    updatedAt: String(o.updatedAt ?? ""),
    programProgressPct: Number(o.programProgressPct ?? 0),
    topicMasteryPct:
      o.topicMasteryPct == null ? null : Number(o.topicMasteryPct),
    examReadinessPct: Number(o.examReadinessPct ?? 0),
    claimFullyReady: Boolean(o.claimFullyReady),
    measuredTopicCount: Number(o.measuredTopicCount ?? 0),
    unmeasuredTopicCount: Number(o.unmeasuredTopicCount ?? 0),
    openMisconceptions: Number(o.openMisconceptions ?? 0),
  };
}

/**
 * Prefer review/gap nodes when misconceptions or weak/stale measured topics exist.
 * Does not reorder locked chain aggressively — only chooses among ready nodes.
 */
export function preferNextNodeForTracking<
  T extends {
    id: string;
    kind: PlanNodeKind;
    status: NodeStatus;
    sortOrder: number;
    sessionMeta?: { topicTitle?: string } | null;
  },
>(
  nodes: T[],
  opts: {
    openMisconceptions: number;
    weakOrStaleTopicKeys: string[];
    now?: number;
    /** Yolun kesin penceresi (şu anki + N adım); varsayılan `PATH_LOOKAHEAD`. */
    window?: number;
    /**
     * Öğrencinin açamayacağı adım türleri (ücretsiz hesapta Plus'a özel adımlar, `pathSkipKinds`):
     * sıradaki olarak hiç seçilmez (24 Ekim 2026).
     */
    skipKinds?: ReadonlySet<string>;
  },
): T | null {
  const usable = (n: T) => !opts.skipKinds?.has(n.kind);
  const ready = nodes
    .filter((n) => n.status === "ready" && usable(n))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!ready.length) {
    return (
      nodes.find((n) => n.status !== "done" && usable(n)) ??
      null
    );
  }

  const weak = new Set(opts.weakOrStaleTopicKeys.map(normalizeTopicKey));
  const reviewKinds = new Set<PlanNodeKind>([
    "gaps",
    "focused",
    "final_check",
    "spaced",
    "flashcards",
    "quiz",
  ]);

  /*
    20 Ekim 2026: yönlendirme yalnız yolun penceresinde (şu anki + PATH_LOOKAHEAD adım). Önceden
    yolun herhangi bir yerinde açık duran düğüm seçilebiliyordu: erken çözülen yazılı deneme ya da
    "Başka birini seç" sondaki "Kartlarla son tekrar"ı açınca "Devam et" sınav gününe atlıyordu.
    Sınav günü türleri (son kartlar, son kontrol, hazırlık) ancak sırası gelince önerilir.
  */
  const first = ready[0];
  const reach = first.sortOrder + Math.max(0, opts.window ?? PATH_LOOKAHEAD);
  const examDayKinds = new Set<PlanNodeKind>(["flashcards", "final_check", "readiness"]);
  if (opts.openMisconceptions > 0 || weak.size > 0) {
    const biased = ready.find((n) => {
      if (n.sortOrder > reach) return false;
      if (n !== first && examDayKinds.has(n.kind)) return false;
      if (!reviewKinds.has(n.kind)) return false;
      const topic = normalizeTopicKey(n.sessionMeta?.topicTitle);
      return weak.size === 0 || weak.has(topic) || opts.openMisconceptions > 0;
    });
    if (biased) return biased;
  }

  return ready[0];
}

/**
 * Ücretsiz hesabın Plus adımında takılmış yolu (24 Ekim 2026). Tamamlama fonksiyonu (göç 20261024130000)
 * bundan sonra Plus adımını atlıyor; ama düzeltmeden önce takılan yolda bitirilebilecek adım kalmadı
 * (canlıda: ders bitti, podcast açık, gerisi kilitli). Açılabilir hazır adım yoksa fonksiyonun kuralıyla
 * açılacak düğümler: önündeki her adım bitmiş ya da Plus'a özel olan ilk kilitli açılabilir adım ve
 * yoldaki Plus adımları. Kural aynı: Plus adımı yolu tutmaz; başka hiçbir kilit kalkmaz.
 */
export function freePathUnblockIds<T extends { id: string; kind: string; status: NodeStatus; sortOrder: number }>(
  nodes: T[],
  skipKinds: ReadonlySet<string>,
): string[] {
  if (!skipKinds.size) return [];
  const sorted = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.some((n) => n.status === "ready" && !skipKinds.has(n.kind))) return [];
  const ids: string[] = [];
  for (const n of sorted) {
    if (n.status === "done") continue;
    if (skipKinds.has(n.kind)) {
      if (n.status === "locked") ids.push(n.id);
      continue;
    }
    // İlk bitmemiş açılabilir adım: kilitliyse açılır, yol devam eder.
    return n.status === "locked" ? [...ids, n.id] : [];
  }
  return [];
}

export function weakOrStaleTopicKeys(
  topics: TopicMasterySnapshot[],
  now = Date.now(),
): string[] {
  return topics
    .filter((t) => {
      if (!t.measured) return false;
      if (t.level === "weak" || t.confidence < 50) return true;
      if (!t.lastPracticedAt) return true;
      const age = now - new Date(t.lastPracticedAt).getTime();
      return age >= STALE_MS;
    })
    .map((t) => t.topicKey);
}

const LEVEL_RANK: Record<TopicMasterySnapshot["level"], number> = { unmeasured: 0, weak: 1, emerging: 2, solid: 3 };

/**
 * Başarılı etkinlik (P1-7): yardımsız doğrular kanıtın en az yarısı ya da kanıtsız (ders, kart, podcast).
 * Başarılı bir etkinlik hâkimiyeti ve hazır olma yüzdesini düşürmez; başarısız test düşürebilir.
 */
export function activitySucceeded(evidence: Pick<AnswerEvidenceDraft, "correct" | "hintAssisted">[]): boolean {
  if (!evidence.length) return true;
  const independent = evidence.filter((row) => row.correct && !row.hintAssisted).length;
  return independent * 2 >= evidence.length;
}

export function holdMasteryOnSuccess(
  prior: TopicMasterySnapshot[],
  folded: TopicMasterySnapshot[],
  succeeded: boolean,
): TopicMasterySnapshot[] {
  if (!succeeded) return folded;
  return folded.map((topic) => {
    const before = prior.find((row) => normalizeTopicKey(row.topicKey) === normalizeTopicKey(topic.topicKey));
    if (!before?.measured) return topic;
    return {
      ...topic,
      confidence: Math.max(topic.confidence, before.confidence),
      level: LEVEL_RANK[before.level] > LEVEL_RANK[topic.level] ? before.level : topic.level,
    };
  });
}

export function holdTrackingOnSuccess(
  previous: TrackingPersisted | null,
  next: TrackingPersisted,
  succeeded: boolean,
): TrackingPersisted {
  if (!succeeded || !previous) return next;
  return {
    ...next,
    programProgressPct: Math.max(next.programProgressPct, previous.programProgressPct),
    topicMasteryPct:
      next.topicMasteryPct == null || previous.topicMasteryPct == null
        ? next.topicMasteryPct ?? previous.topicMasteryPct
        : Math.max(next.topicMasteryPct, previous.topicMasteryPct),
    examReadinessPct: Math.max(next.examReadinessPct, previous.examReadinessPct),
  };
}

export type TopicGain = { label: string; before: number; after: number };

/**
 * Sonuç ekranından sonraki "+%X kazandın" kartı (19 Ekim 2026, Astra'da test sonrası
 * "Konu hakimiyeti %18" ekranı). Ölçüm bu etkinliğin kanıtıyla değişen konunun güveni:
 * önce kayıttaki değer, sonra katlanmış değer. Kanıt yoksa (ders, kart, kontrolsüz ya da kontrolü
 * atlanmış podcast) null.
 */
export function topicMasteryGain(input: {
  prior: TopicMasterySnapshot[];
  folded: TopicMasterySnapshot[];
  evidenceKeys: string[];
  topicLabel: string | null;
}): TopicGain | null {
  const keys = [...new Set(input.evidenceKeys.map(normalizeTopicKey))];
  if (!keys.length) return null;
  const own = input.topicLabel ? normalizeTopicKey(input.topicLabel) : null;
  const key = own && keys.includes(own) ? own : keys[0]!;
  const before = input.prior.find((topic) => normalizeTopicKey(topic.topicKey) === key)?.confidence ?? 0;
  const after = input.folded.find((topic) => normalizeTopicKey(topic.topicKey) === key)?.confidence;
  if (typeof after !== "number") return null;
  const beforeRounded = Math.round(before);
  const afterRounded = Math.round(after);
  // Kazanç metni kayıtlı yeni değer eksi eski değerdir. Fark 0 ya da eksi ise kart yazılmaz.
  if (afterRounded <= beforeRounded) return null;
  const label = own === key && input.topicLabel ? input.topicLabel.trim() : key;
  return { label, before: beforeRounded, after: afterRounded };
}
