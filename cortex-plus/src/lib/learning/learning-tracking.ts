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
import { coverageLine, masteryPercentText, pathCompletion } from "@/lib/learning/prep-metrics";
import { podcastCheckAnswered, podcastCheckOf } from "@/lib/learning/podcast-check";
import { PATH_LOOKAHEAD } from "@/lib/learning/study-path-window";
import { oralItemSufficient } from "@/lib/learning/oral-sufficiency";
import { contentSpansTopics, createTopicIndex } from "@/lib/learning/topic-identity";

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
  const t = (raw ?? "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
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

  // Sözlü "Tüm sınav" (scope "all", Paket I #8) ve birden çok konu seçilen sözlü (scope "topics", 30 Ekim 2026) soru
  // başına konu taşımaz: tek konuya kanıt yazılmaz (`contentSpansTopics`).
  if (data.type === "oral" && !contentSpansTopics(data)) {
    const questions =
      (data.questions as {
        prompt?: string;
        hint?: string;
        learningObjective?: string;
      }[]) ?? [];
    const gradeMeta = data.gradeMeta as
      | { correctIndices?: number[]; correctCount?: number; items?: { index?: unknown; ratio?: unknown }[] }
      | undefined;
    const testedTopic = typeof data.testedTopic === "string" ? data.testedTopic : "";
    const oralTopic = normalizeTopicKey(testedTopic || input.topicLabel);
    // Hakemin soru başına puanı varsa yeterli cevap (%80+, `oralItemSufficient`) doğru sayılır: bilgi eksiği listesi
    // ve günü gelen tekrar aynı eşiği okur (30 Ekim 2026). Önceden yalnız tam puan doğruydu, %88 yanlış yazılıyordu.
    const graded = new Map<number, { ratio?: unknown }>();
    for (const item of Array.isArray(gradeMeta?.items) ? gradeMeta.items : []) {
      const at = Number(item?.index);
      if (Number.isInteger(at)) graded.set(at, item);
    }
    questions.forEach((question, index) => {
      const hasAnswer = String(input.answers[String(index)] ?? "").trim().length > 8;
      // Without per-item grades, credit length-checked answers as provisional.
      let correct = hasAnswer;
      if (graded.has(index)) {
        correct = oralItemSufficient(graded.get(index));
      } else if (Array.isArray(gradeMeta?.correctIndices)) {
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

/** Konunun ölçülmüş sayılması ve "Sağlam" olabilmesi için gereken kanıt. Bir soru yetmez. */
export const MASTERY_EVIDENCE_FLOOR = 3;

/**
 * Konu ölçüldü mü (30 Ekim 2026, Paket I #7): en az 3 kayıtlı cevap. Altında konu "Ölçülmedi" yazar ve
 * sayı göstermez. Önceden 1-2 cevaplı konunun yüzdesi `kanıt / 3` ile sönüyordu: 1/1 doğru da, hiç
 * çalışılmamış konuya düşen tek kanıt da "%33" görünüyordu — öğrenci için anlamsız bir öncül sayıydı.
 * Kapsam ("x/N konu ölçüldü"), hazırlık ortalaması ve "Sağlam" aynı eşiği okur.
 */
export function isMeasuredTopic(topic: Pick<TopicMasterySnapshot, "measured" | "evidenceCount"> | null | undefined): boolean {
  return Boolean(topic && topic.measured !== false && topic.evidenceCount >= MASTERY_EVIDENCE_FLOOR);
}

/** Bağımsız doğruluk; yoksa ilk deneme. Kayıt yoksa 0. */
export function topicSuccessRate(topic: TopicMasterySnapshot): number {
  if (topic.independentTotal > 0) return topic.independentCorrect / topic.independentTotal;
  if (topic.firstAttemptTotal > 0) return topic.firstAttemptCorrect / topic.firstAttemptTotal;
  return 0;
}

/**
 * Konu yüzdesi — yol, sözlü seçici, İlerleme ve Hazırsın aynı fonksiyonu okur. Ölçülen konuda başarı oranının
 * kendisi (ekrandaki "N sorudan X doğru" ile aynı iki sayı); ölçülmemiş konu (3 cevaptan az) 0 ve ekranda
 * sayı yerine "Ölçülmedi".
 */
export function topicMasteryPercent(topic: TopicMasterySnapshot): number {
  if (!isMeasuredTopic(topic)) return 0;
  return Math.max(0, Math.min(100, Math.round(topicSuccessRate(topic) * 100)));
}

/** "Sağlam": ölçülmüş (en az 3 kanıt) ve yüzde hedefin üstünde. Tek doğru cevap yetmez. */
export function topicIsSolid(topic: TopicMasterySnapshot, target: number): boolean {
  return isMeasuredTopic(topic) && topicMasteryPercent(topic) >= target;
}

export type TopicMasteryState = "ready" | "needs_work" | "unmeasured";

export type TopicMasteryView = {
  /** `topicMasteryPercent`; ölçülmemiş konuda 0 ve ekranda yazılmaz (`text`). */
  percent: number;
  state: TopicMasteryState;
  /** Ekrandaki rozet: "Sağlam" / "Çalışılacak" / "Ölçülmedi". */
  label: string;
  /** Ekrandaki sayı: "%62" ya da ölçülmemişse "Ölçülmedi". */
  text: string;
  /** Kayıtlı cevap (kanıt) sayısı: "N çözüldü". */
  solved: number;
};

export const MASTERY_STATE_LABEL: Record<TopicMasteryState, string> = {
  ready: "Sağlam",
  needs_work: "Çalışılacak",
  unmeasured: "Ölçülmedi",
};

/**
 * Konunun ekrandaki hâli — tek kaynak (29 Ekim 2026). Yol, İlerleme, sözlü konu seçici ve Hazırsın
 * yüzdeyi ve "Sağlam / Çalışılacak" rozetini buradan okur; biri kayıtlı `confidence`'ı, öteki sönümlü
 * yüzdeyi gösterince aynı konu iki ekranda iki sayıyla çıkıyordu. Baraj hedef puandır (yoksa 70).
 */
export function topicMasteryView(topic: TopicMasterySnapshot, target: number | null | undefined): TopicMasteryView {
  const measured = isMeasuredTopic(topic);
  const state: TopicMasteryState = !measured ? "unmeasured" : topicIsSolid(topic, effectiveTarget(target)) ? "ready" : "needs_work";
  const percent = topicMasteryPercent(topic);
  return {
    percent,
    state,
    label: MASTERY_STATE_LABEL[state],
    text: masteryPercentText(percent, measured),
    solved: topic.evidenceCount,
  };
}

/** `exam_prep_topic_mastery` okuyan her sayfa bu sütunları ister; yüzde kayıtlı `confidence`'tan değil ham sayılardan. */
export const MASTERY_ROW_COLUMNS =
  "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at";

export function masterySnapshotFromRow(row: Record<string, unknown>): TopicMasterySnapshot {
  const evidenceCount = Number(row.evidence_count ?? 0);
  return {
    topicKey: String(row.topic_key ?? ""),
    measured: evidenceCount > 0,
    level: ((row.measured_level as TopicMasterySnapshot["level"] | null) ?? "unmeasured"),
    confidence: Number(row.confidence ?? 0),
    evidenceCount,
    firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
    firstAttemptTotal: Number(row.first_attempt_total ?? 0),
    independentCorrect: Number(row.independent_correct ?? 0),
    independentTotal: Number(row.independent_total ?? 0),
    lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
  };
}

/** Konu adı → yüzde. Kaydı olmayan konu yok sayılır (çağıran 0 yazar). */
export function topicPercentsByKey(rows: Record<string, unknown>[] | null | undefined): Map<string, number> {
  return new Map(
    (rows ?? []).map((row) => {
      const snapshot = masterySnapshotFromRow(row);
      return [normalizeTopicKey(snapshot.topicKey), topicMasteryPercent(snapshot)] as const;
    }),
  );
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

  const rate = topicSuccessRate(topic);
  const confidence = topicMasteryPercent({ ...topic, measured: true });

  let level: TopicMasterySnapshot["level"] = "weak";
  if (topicIsSolid(topic, 85)) level = "solid";
  else if (rate >= 0.55) level = "emerging";
  else level = "weak";

  return { ...topic, level, confidence };
}

/**
 * Hâkimiyet satırlarını hazırlığın konularına bağlar — tek eşleştirici (`createTopicIndex`, 30 Ekim 2026). Anahtar
 * (`topic_key`) konunun adıdır; önce birebir, sonra tek bir konunun uzantısı ("Stokiyometri: sınırlayıcı bileşen" →
 * "Stokiyometri"). Aynı konuya düşen satırlar toplanır; hiçbir konuya bağlanmayan satır sayılmaz. İlerleme, yol ve sözlü
 * seçici konunun yüzdesini, durumunu ve çözülen sayısını buradan okur: önceden yalnız birebir anahtar okunuyor, ad
 * varyantıyla yazılan kanıt konuya hiç yansımıyordu ("Ölçülmedi · 0 çözüldü").
 */
export function masteryByPlannedTopic(
  labels: readonly string[],
  snapshots: readonly TopicMasterySnapshot[],
): Map<string, TopicMasterySnapshot> {
  const index = createTopicIndex(labels.map((label) => ({ id: label, label })).filter((row) => row.label.trim()));
  const merged = new Map<string, TopicMasterySnapshot>();
  for (const snapshot of snapshots) {
    const row = index.rowForKey(snapshot.topicKey);
    if (!row) continue;
    const prev = merged.get(row.label);
    if (!prev) {
      merged.set(row.label, { ...snapshot, topicKey: row.label });
      continue;
    }
    const later =
      (prev.lastPracticedAt ?? "") >= (snapshot.lastPracticedAt ?? "") ? prev.lastPracticedAt : snapshot.lastPracticedAt;
    merged.set(row.label, {
      ...prev,
      measured: prev.measured || snapshot.measured,
      evidenceCount: prev.evidenceCount + snapshot.evidenceCount,
      firstAttemptCorrect: prev.firstAttemptCorrect + snapshot.firstAttemptCorrect,
      firstAttemptTotal: prev.firstAttemptTotal + snapshot.firstAttemptTotal,
      independentCorrect: prev.independentCorrect + snapshot.independentCorrect,
      independentTotal: prev.independentTotal + snapshot.independentTotal,
      lastPracticedAt: later,
    });
  }
  for (const [label, snapshot] of merged) merged.set(label, scoreTopicMastery(snapshot));
  return merged;
}

/**
 * Tamamlama (eski adı "Program ilerlemesi") — `pathCompletion` (30 Ekim 2026, Paket I #7): "Hazırsın" karar
 * ekranı sayılmaz; açılınca düğüm biter ama etkinlik bitmiş olmaz.
 */
export function computeProgramProgress(
  nodes: { status: NodeStatus; kind?: PlanNodeKind | string | null }[],
): LearningIndicators["programProgress"] {
  const progress = pathCompletion(nodes);
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
  let confidenceSum = 0;
  const plannedKeys = keys.length ? keys : ["genel"];
  for (const key of plannedKeys) {
    const t = byKey.get(key);
    const scored = t ? scoreTopicMastery(t) : null;
    const confidence = scored ? topicMasteryPercent(scored) : 0;
    confidenceSum += confidence;
    // Ölçülmüş = en az 3 cevap (`isMeasuredTopic`); kapsam, ortalama ve ekrandaki "Ölçülmedi" aynı eşik.
    if (!t || !isMeasuredTopic(t)) {
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

  const measuredSuccessPct =
    successN > 0 ? Math.round((successSum / successN) * 100) : null;
  /** Çalışılmamış konu 0: 9 konudan 2'si çalışılmışken yüzde 2/9 bandındadır. */
  const topicMean = Math.round(confidenceSum / plannedKeys.length);
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
    return {
      pct: topicMean,
      label: "Henüz ölçülmüş konu yok — hazırlık tahmini düşük",
      claimFullyReady: false,
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

  let pct = topicMean;

  if (openMisconceptions > 0 || !misconceptionsKnown) {
    pct = Math.min(pct, 85);
  }

  pct = Math.max(0, Math.min(100, pct));

  // Hazırsın: bütün konular ölçülmüş ve ortalama hedefi geçmiş. Deneme, çalışılmamış konuyu 0'dan çıkarmaz.
  const claimFullyReady =
    unmeasured === 0 && readyForTarget({ mockScorePct: null, overallPct: pct, targetScore: target });

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

  // Yüzde yalnız ölçülen konulardan; etiket kapsamı söyler (30 Ekim 2026, Paket I #7): 1/22 konu
  // ölçülmüşken "Konu hâkimiyeti %78" tek başına yanıltıyordu.
  const measured = snapshots.filter((t) => isMeasuredTopic(t));
  const unmeasuredCount = snapshots.length - measured.length;
  const pct =
    measured.length === 0
      ? null
      : Math.round(
          measured.reduce((sum, t) => sum + topicMasteryPercent(t), 0) / measured.length,
        );

  const coverage = coverageLine(measured.length, snapshots.length);
  const label =
    pct == null
      ? `Henüz ölçülen konu yok · ${coverage}`
      : pct >= 80
        ? `${coverage} · ölçülenlerde güçlü`
        : pct >= 50
          ? `${coverage} · ölçülenlerde karışık`
          : `${coverage} · ölçülenlerde zayıf`;

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
