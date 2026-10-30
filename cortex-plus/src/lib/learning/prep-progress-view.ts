/**
 * Hazırlığın "İlerleme" sekmesi — Astra düzeni (29 Eylül 2026).
 *
 * Astra'da sekme şunları gösteriyor: hazırlık puanı ve hedef işareti,
 * "bu hafta" değişimi, hedefe ulaşan konu ve ders sayısı; altında Hazırlık
 * düzeyi / Denemeler / Tempo. Burada yalnızca elimizdeki gerçek kayıtlardan
 * hesaplanabileni hesaplıyoruz; uydurma bir tahmin göstermiyoruz.
 *
 * Saf fonksiyon: sayfa kayıtları okur, bu modül görünümü kurar.
 */

import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { LESSON_KINDS, coverageLine, lessonsCompleted, pathCompletion } from "@/lib/learning/prep-metrics";
import { isBareAnswerText } from "@/lib/learning/answer-tally";
import {
  buildReadinessForecastSeries,
  type ReadinessForecastSeries,
} from "@/lib/learning/prep-radar";
import type { TopicMasteryState } from "@/lib/learning/learning-tracking";
import { istanbulDay } from "@/lib/istanbul-day";
import { contentSpansTopics, contentTestedTopic, createTopicIndex } from "@/lib/learning/topic-identity";

export type ProgressNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  status: NodeStatus;
  /** `topicId` iki kimlikten biri olabilir (konu satırı ya da belge konu düğümü, `topic-identity.ts`). */
  sessionMeta?: { topicId?: string; topicTitle?: string; durationMinutes?: number; calendarDate?: string } | null;
};

/** Etkinliğin konusu kayıttan (30 Ekim 2026): içeriğin sorduğu konu, yoksa kaydın konu satırı, yoksa düğümün konusu. */
export function attemptTopicFields(row: { topic_id?: unknown; payload?: unknown }): {
  topicId: string | null;
  testedTopic: string | null;
  spansTopics: boolean;
} {
  return {
    topicId: typeof row.topic_id === "string" && row.topic_id ? row.topic_id : null,
    testedTopic: contentTestedTopic(row.payload),
    spansTopics: contentSpansTopics(row.payload),
  };
}

export type SolvedQuestion = {
  /** Konusu yazılıysa sayaç o konuya gider; yoksa düğümün konusuna. */
  topic: string | null;
  key: string;
};

function questionText(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const bag = row as { text?: unknown; prompt?: unknown };
  const text = typeof bag.text === "string" ? bag.text : typeof bag.prompt === "string" ? bag.prompt : "";
  return text.trim();
}

/** Quiz kökü, sözlü sorusu ve doğru/yanlış maddesi. Yüzde paydası (100) soru değildir. */
export function attemptStems(payload: unknown): string[] {
  return solvedQuestions(payload).map((item) => item.key);
}

function rowTopic(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const topic = (row as { topic?: unknown }).topic;
  return typeof topic === "string" && topic.trim() ? topic.trim() : null;
}

export function solvedQuestions(payload: unknown): SolvedQuestion[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as { type?: unknown; questions?: unknown; items?: unknown };
  if (data.type === "mock_exam" && Array.isArray(data.items)) {
    return data.items.map((row, index) => ({
      topic: rowTopic(row),
      key: `mock:${index}:${rowTopic(row) ?? ""}`,
    }));
  }
  const rows = [
    ...(Array.isArray(data.questions) ? data.questions : []),
    ...(Array.isArray(data.items) ? data.items : []),
  ];
  return rows.flatMap((row) => {
    const text = questionText(row);
    if (!text) return [];
    return [{ topic: rowTopic(row), key: text }];
  });
}

export type ProgressAttempt = {
  nodeId: string;
  score: number | null;
  total: number | null;
  createdAt: string;
  /** Varsa aynı soru kökü bir kez sayılır. */
  stems?: string[];
  /** Konusu belli sorular. Yazılı denemenin 100'lük paydası burada sayılmaz. */
  solved?: SolvedQuestion[];
  /** Kaydın konu satırı (`exam_prep_node_attempts.topic_id`). */
  topicId?: string | null;
  /** İçeriğin sorduğu konu (`testedTopic`): düğümün konusu dışında bir konu çalışıldıysa o. */
  testedTopic?: string | null;
  /** Birden çok konuyu kapsayan içerik (sözlü "Tüm sınav" / çoklu seçim): tek konuya sayılmaz. */
  spansTopics?: boolean;
};

export type ProgressGap = {
  claim: string;
  topicLabel: string | null;
  /** Öğrencinin ham cevabı. Başlık değildir. */
  detail?: string | null;
  /** Satırı yazan etkinlik (`exam_prep_misconceptions.source_kind`). */
  sourceKind?: string | null;
};

export type PrepProgressView = {
  /** Hazırlık puanı (%). Ölçüm varsa sınava hazırlık tahmini, yoksa tamamlama. */
  scorePct: number;
  /** Puanın neye dayandığı — öğrenciye aynen yazılıyor. */
  scoreBasis: string;
  /** Tamamlama (%): biten adım / yolun adımları (`pathCompletion`); "Hazırlık"tan ayrı ad, ayrı sayı. */
  completionPct: number;
  targetPct: number;
  /** Bu hafta biten etkinlik sayısı; Astra'nın "bu hafta" çipinin karşılığı. */
  weekActivities: number;
  topicsAtTarget: number;
  topicCount: number;
  /**
   * Ölçülen konu (en az 3 cevap, `isMeasuredTopic`) sayısı; hâkimiyet bilgisi yoksa null. Ekran "x/N konu ölçüldü"
   * yazar (30 Ekim 2026: Paket I #7 bunu yalnız değerlendirme sayfasına koymuştu, İlerleme "hedefe ulaşan konu" diyordu).
   */
  measuredTopics: number | null;
  /** "3/8 konu ölçüldü" (`coverageLine`); hâkimiyet bilgisi yoksa null. */
  coverageText: string | null;
  lessonsDone: number;
  forecast:
    | { kind: "waiting"; reason: string }
    | { kind: "ready"; pct: number; text: string };
  /** 14 günlük (veya sınava kalan) hazırlık eğrisi — SVG çizgi grafik. */
  forecastSeries: ReadinessForecastSeries;
  /**
   * Tempo kartı (19 Ekim 2026, Astra'daki gibi): bir ders ne kazandırıyor, hedefe kaç ders kaldı,
   * günde kaç ders gerekir. Ölçülen puan ve biten ders sayısından; ikisi de yoksa null.
   */
  pace: {
    gainPerLessonPct: number;
    lessonsToTarget: number;
    perDay: number | null;
    /**
     * Gereken ders günde birin altındaysa haftalık sayı (30 Ekim 2026): 228 gün kalmışken "günde 1"
     * yazmak planın temposunu söylemiyordu. Varsa ekran "haftada N" yazar.
     */
    perWeek?: number | null;
    /**
     * Grafikteki "~X günde" ile aynı. Planda tarihli adım varsa planın kendisinden: hedefe yetecek
     * kadar dersin sonuncusunun planlandığı güne kadar (30 Ekim 2026; 228 gün kalmışken "~7 günde"
     * diyordu). Planın kalan dersleri yetmiyorsa null ("bu tempoyla hedefe henüz ulaşılmaz").
     * Tarih yoksa `Math.ceil(kalanDers / günlükDers)`.
     */
    daysToFinish: number | null;
    todayLessons: number;
  } | null;
  /** En az bir etkinlik puanlandı: "eksik yok" artık bir ölçüm sonucudur, boşluk değil. */
  gapsMeasured: boolean;
  gaps: ProgressGap[];
  topics: { label: string; pct: number; solved: number; lessons: number; state?: TopicMasteryState }[];
  weeks: {
    labels: string[];
    rows: { label: string; counts: number[]; pct: number }[];
  };
  mocks: { title: string; date: string; pct: number }[];
  tempo: {
    weeks: { label: string; activities: number; minutes: number }[];
    dailyGoalMinutes: number | null;
    thisWeekMinutes: number;
  };
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Astra'nın "Hedef ustalık %75"i. Hazırlıkta hedef puan yoksa bu. */
export const DEFAULT_TARGET_PCT = 75;
/**
 * Sınav günü tahmini kaç biten dersten sonra görünür. 29 Eylül'de "Astra: ilk iki ders" diye 2
 * yazılmıştı; 19 Ekim 2026'da Astra'da ilk dersten hemen sonra tahmin ve tempo kartı görüldü.
 */
const FORECAST_MIN_LESSONS = 1;
const WEEK_COUNT = 5;

const MOCK_KINDS = new Set<PlanNodeKind>(["written_exam", "final_check"]);

function topicOf(node: ProgressNode | undefined): string | null {
  const title = node?.sessionMeta?.topicTitle?.trim();
  return title || null;
}

/**
 * Planın kalan ders adımlarının (`LESSON_KINDS`: yalnız ders, 30 Ekim 2026) bugünden
 * uzaklığı, gün olarak ve sıralı: i. eleman, bugünden sayınca (i+1). dersin planlandığı gün (bugün = 1).
 * Günü geçmiş adım bugün sayılır. Tarihsiz adım sayılmaz.
 */
function plannedLessonDates(nodes: readonly ProgressNode[], today: string): number[] {
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  return nodes
    .filter((node) => LESSON_KINDS.has(node.kind) && node.status !== "done")
    .map((node) => node.sessionMeta?.calendarDate)
    .filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map((date) => Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - todayTime) / DAY_MS)) + 1)
    .sort((a, b) => a - b);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

const SOLVED_KINDS = new Set<PlanNodeKind>([
  "quiz",
  "true_false",
  "final_check",
  "focused",
  "gaps",
  "oral",
  "written_exam",
  "qa",
]);

/**
 * Soru üreten düğümlerin son oturumu. Ders, kart ve podcast "çözüldü"ye girmez.
 * Aynı kök bir kez sayılır. Yazılı deneme ve sözlüdeki 100'lük yüzde paydası soru sayısı değildir.
 * Deneme maddesi, düğümün konusuna değil maddenin kendi konusuna yazılır.
 *
 * Yalnız hâkimiyet bilgisi olmayan eski yolda (bayrak kapalı) okunur; açık yolda "çözüldü" kanıt sayısıdır
 * (`topicMasteryView.solved`, 30 Ekim 2026).
 */
function uniqueSolved(
  attempts: ProgressAttempt[],
  onTopic: (attempt: ProgressAttempt) => boolean,
  itemTopic: (raw: string) => string | null,
  nodes: Map<string, ProgressNode>,
  topicLabel: string,
): number {
  const latest = new Map<string, ProgressAttempt>();
  for (const attempt of attempts) {
    const prev = latest.get(attempt.nodeId);
    if (!prev || Date.parse(attempt.createdAt) >= Date.parse(prev.createdAt)) latest.set(attempt.nodeId, attempt);
  }
  const seen = new Set<string>();
  let count = 0;
  for (const attempt of latest.values()) {
    const node = nodes.get(attempt.nodeId);
    const kind = node?.kind;
    if (kind && !SOLVED_KINDS.has(kind)) continue;
    const onTopicNode = onTopic(attempt);
    const solved = attempt.solved ?? [];
    if (solved.length) {
      for (const item of solved) {
        const belongs = item.topic ? itemTopic(item.topic) === topicLabel : onTopicNode;
        const key = item.key.trim().toLocaleLowerCase("tr");
        if (!belongs || !key || seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      continue;
    }
    if (!onTopicNode) continue;
    const stems = attempt.stems ?? [];
    if (stems.length) {
      for (const stem of stems) {
        const key = stem.trim().toLocaleLowerCase("tr");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      continue;
    }
    const total = attempt.total ?? 0;
    if (total > 0 && total !== 100) count += total;
  }
  return count;
}

/** H1…H4, şimdi: en eski hafta başta. `index` 0 = bu hafta. */
function weekIndex(createdAt: string, now: number): number | null {
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time) || time > now) return null;
  const index = Math.floor((now - time) / WEEK_MS);
  return index < WEEK_COUNT ? index : null;
}

function weekLabels(): string[] {
  return Array.from({ length: WEEK_COUNT }, (_, i) =>
    i === WEEK_COUNT - 1 ? "şimdi" : `H${i + 1}`,
  );
}

/**
 * Bilgi eksiği satırının okunur hâli (30 Ekim 2026). Sözlü satırı eskiden iddia olarak öğrencinin ham cevabını
 * ("Bilmiyorum", yazım hatalı cümle) yazıyordu; ekranda başlık o cümle oluyordu. Sözlü satırında başlık sorunun
 * kendisi (önizleme), ham cevap gösterilmez — yeni kayıtlarda iddia zaten sorunun hedefidir (`oralMisconceptionDrafts`).
 * Konu adı hazırlığın konu adına bağlanır (tek eşleştirici).
 */
export function readableGap(gap: ProgressGap, canonicalTopic: (label: string) => string = (label) => label): ProgressGap {
  const topicLabel = gap.topicLabel?.trim() ? canonicalTopic(gap.topicLabel.trim()) : gap.topicLabel;
  if (gap.sourceKind === "oral") {
    const question = gap.detail?.trim() ?? "";
    return { ...gap, topicLabel, claim: question || gap.claim, detail: null };
  }
  return { ...gap, topicLabel };
}

export function buildPrepProgressView(input: {
  nodes: ProgressNode[];
  attempts: ProgressAttempt[];
  topicLabels: string[];
  gaps: ProgressGap[];
  examDate: string | null;
  targetScore: number | null;
  dailyMinutes: number | null;
  /** Ölçülen sınava hazırlık tahmini (pdf_learning_v2). Yoksa null. */
  measuredReadinessPct: number | null;
  /** Konu hâkimiyeti (0–100). Varsa çubuk tamamlanan adımdan değil buradan gelir; listede olmayan konu 0. */
  /** `confidence`: `topicMasteryPercent` (sönümlü yüzde); `state`: aynı kaynaktan "Sağlam / Çalışılacak" (29 Ekim 2026). */
  /** `solved`: konunun kanıt sayısı (`topicMasteryView.solved`); varsa "N çözüldü" bundan (30 Ekim 2026). */
  topicMastery?: { label: string; confidence: number; state?: TopicMasteryState; solved?: number }[];
  /**
   * Konular kimlikleriyle (30 Ekim 2026): düğüm ve kayıt konuya tek eşleştiriciyle bağlanır (`topic-identity.ts`).
   * Yoksa yalnız ad.
   */
  topicRefs?: { id: string; label: string; documentTopicNodeId?: string | null }[];
  now?: Date;
}): PrepProgressView {
  const now = (input.now ?? new Date()).getTime();
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const completed = input.attempts.filter((attempt) => nodeById.has(attempt.nodeId));

  const measured = input.measuredReadinessPct;
  // Ölçüm yoksa (eski yol) puan tamamlamanın kendisi (`pathCompletion`) — üçüncü bir ağırlıklı formül
  // (`readinessScore`) aynı "Hazırlık" adına başka sayı yazıyordu (30 Ekim 2026, Paket I #7).
  const completion = pathCompletion(input.nodes);
  const scorePct =
    typeof measured === "number" ? Math.max(0, Math.min(100, Math.round(measured))) : completion.pct;
  const scoreBasis =
    typeof measured === "number"
      ? "Ölçülen başarı, konu kapsamı ve deneme sonuçlarına göre; yanlış cevapla düşebilir."
      : "Tamamlanan adımlara göre; konu hakimiyetini ölçmez.";
  const targetPct =
    typeof input.targetScore === "number" && input.targetScore > 0 && input.targetScore <= 100
      ? Math.round(input.targetScore)
      : DEFAULT_TARGET_PCT;

  const labels = input.topicLabels.length
    ? input.topicLabels
    : [...new Set(input.nodes.map(topicOf).filter((t): t is string => Boolean(t)))];

  // Konu bağı tek kuralla (30 Ekim 2026, `topic-identity.ts`): düğüm konusu kimlikle (belgeli hazırlıkta belge konu
  // düğümü), kaydın konusu önce içeriğin sorduğu konudan (`testedTopic`), sonra kaydın konu satırından. Önceden
  // düğümün başlığı birebir aranıyordu: "Enflasyon Türleri" için açılan sözlü "Para Politikası"nın düğümünde olduğu
  // için Para Politikası "3 çözüldü", Enflasyon Türleri "0 çözüldü" yazdı.
  const refByLabel = new Map((input.topicRefs ?? []).map((ref) => [ref.label, ref]));
  const index = createTopicIndex(
    labels.map((label) => {
      const ref = refByLabel.get(label);
      return { id: ref?.id || label, label, documentTopicNodeId: ref?.documentTopicNodeId ?? null };
    }),
  );
  const nodeTopicCache = new Map<string, string | null>();
  const nodeTopic = (node: ProgressNode | undefined): string | null => {
    if (!node) return null;
    if (!nodeTopicCache.has(node.id)) {
      const row = index.rowFor({ id: node.sessionMeta?.topicId ?? null, label: node.sessionMeta?.topicTitle ?? null });
      nodeTopicCache.set(node.id, row?.label ?? topicOf(node));
    }
    return nodeTopicCache.get(node.id) ?? null;
  };
  const attemptTopic = (attempt: ProgressAttempt): string | null => {
    if (attempt.spansTopics) return null;
    const tested = attempt.testedTopic ? index.rowFor(attempt.testedTopic) : null;
    if (tested) return tested.label;
    const own = attempt.topicId ? index.rowFor({ id: attempt.topicId }) : null;
    if (own) return own.label;
    return nodeTopic(nodeById.get(attempt.nodeId));
  };
  const itemTopic = (raw: string) => index.rowFor(raw)?.label ?? raw.trim();

  const topics = labels.map((label) => {
    const topicNodes = input.nodes.filter((node) => nodeTopic(node) === label);
    const mine = completed.filter((attempt) => attemptTopic(attempt) === label);
    const scored = mine.filter((attempt) => (attempt.total ?? 0) > 0 && attempt.total !== 100);
    const earned = scored.reduce((sum, attempt) => sum + Math.max(0, attempt.score ?? 0), 0);
    const possible = scored.reduce((sum, attempt) => sum + (attempt.total ?? 0), 0);
    const accuracy = possible > 0 ? Math.round((earned / possible) * 100) : null;
    const mastery = input.topicMastery?.find((row) => row.label === label);
    // Ölçülmemiş konu sayı göstermez (Paket I #7): çubuk da 0; eski etkinlik doğruluğu yedeğe düşmez.
    const masteryPct =
      mastery && typeof mastery.confidence === "number"
        ? mastery.state === "unmeasured"
          ? 0
          : Math.round(mastery.confidence)
        : null;
    const solved =
      typeof mastery?.solved === "number"
        ? mastery.solved
        : uniqueSolved(completed, (attempt) => attemptTopic(attempt) === label, itemTopic, nodeById, label);
    return {
      label,
      pct: masteryPct ?? accuracy ?? 0,
      solved,
      // Biten ders (30 Ekim 2026): planlanan ders düğümü değil, tamamlanan.
      lessons: topicNodes.filter((node) => LESSON_KINDS.has(node.kind) && node.status === "done").length,
      ...(mastery?.state ? { state: mastery.state } : {}),
    };
  });
  const measuredTopics = input.topicMastery
    ? topics.filter((topic) => topic.state && topic.state !== "unmeasured").length
    : null;

  // Hero'daki "N ders tamamlandı" ile aynı işlev; "Hazırsın" ekranı ders değildir.
  const lessonsDone = lessonsCompleted(input.nodes);

  // Haftalara göre konular: son beş haftada konu başına biten etkinlik.
  const rows = labels.map((label) => ({ label, counts: Array(WEEK_COUNT).fill(0) as number[], pct: 0 }));
  const rowByLabel = new Map(rows.map((row) => [row.label, row]));
  const tempoWeeks = Array.from({ length: WEEK_COUNT }, () => ({ activities: 0, minutes: 0 }));
  for (const attempt of completed) {
    const week = weekIndex(attempt.createdAt, now);
    if (week === null) continue;
    const column = WEEK_COUNT - 1 - week;
    const node = nodeById.get(attempt.nodeId);
    const row = rowByLabel.get(attemptTopic(attempt) ?? "");
    if (row) row.counts[column] += 1;
    tempoWeeks[column].activities += 1;
    tempoWeeks[column].minutes += Math.max(0, node?.sessionMeta?.durationMinutes ?? 0);
  }
  for (const row of rows) {
    row.pct = topics.find((topic) => topic.label === row.label)?.pct ?? 0;
  }

  const weekActivities = tempoWeeks[WEEK_COUNT - 1].activities;

  const examTime = input.examDate ? Date.parse(input.examDate) : Number.NaN;
  const daysToExam = Number.isFinite(examTime) ? Math.max(1, Math.ceil((examTime - now) / DAY_MS)) : null;
  const gainPerLessonPct = lessonsDone > 0 && scorePct > 0 ? Math.max(1, Math.round(scorePct / lessonsDone)) : 0;
  const plannedLessonDays = plannedLessonDates(input.nodes, istanbulDay(new Date(now)));
  const pace: PrepProgressView["pace"] =
    gainPerLessonPct > 0
      ? (() => {
          const lessonsToTarget = Math.max(0, Math.ceil(Math.max(0, targetPct - scorePct) / gainPerLessonPct));
          let perDay = daysToExam ? Math.ceil(lessonsToTarget / daysToExam) : lessonsToTarget > 0 ? 1 : null;
          const daily = perDay && perDay > 0 ? perDay : lessonsToTarget > 0 ? 1 : null;
          let daysToFinish = lessonsToTarget === 0 ? 0 : daily ? Math.ceil(lessonsToTarget / daily) : null;
          let perWeek: number | null = null;
          // Plan tarihliyse tahmin planın temposundan: hedefe yetecek son dersin planlandığı gün.
          if (lessonsToTarget > 0 && plannedLessonDays.length) {
            const reached = plannedLessonDays[lessonsToTarget - 1];
            daysToFinish = reached != null ? Math.max(1, Math.min(daysToExam ?? reached, reached)) : null;
            if (daysToFinish != null) {
              const rate = lessonsToTarget / daysToFinish;
              perDay = rate >= 1 ? Math.ceil(rate) : null;
              perWeek = rate >= 1 ? null : Math.max(1, Math.ceil(rate * 7));
            } else {
              // Planın kalan dersleri hedefe yetmiyor: tempo yazılmaz, eğri planın sonunda durur.
              perDay = null;
            }
          }
          return {
            gainPerLessonPct,
            lessonsToTarget,
            perDay,
            ...(perWeek != null ? { perWeek } : {}),
            daysToFinish,
            // Ayrı ders sayısı: aynı dersin tekrar kayıtları bir kez sayılır — kahraman alanındaki
            // "1 ders tamamlandı" ile çelişmesin (canlıda "Bugün 4 ders" çıkmıştı, 19 Ekim 2026).
            todayLessons: new Set(
              completed
                .filter((attempt) => {
                  const node = nodeById.get(attempt.nodeId);
                  const time = Date.parse(attempt.createdAt);
                  return Boolean(node && LESSON_KINDS.has(node.kind)) && Number.isFinite(time) && now - time < DAY_MS;
                })
                .map((attempt) => attempt.nodeId),
            ).size,
          };
        })()
      : null;

  // Tahmin hazırlık yüzdesinden başlar. Gün sayısı tempo kartıyla aynı bölme: kalan ders / günde ders.
  let forecast: PrepProgressView["forecast"];
  if (lessonsDone < FORECAST_MIN_LESSONS) {
    forecast = {
      kind: "waiting",
      reason: "İlerleme eğilimin ve tahminin, bu hazırlıktaki ilk dersten sonra görünür.",
    };
  } else if (!Number.isFinite(examTime)) {
    forecast = { kind: "waiting", reason: "Sınav tarihi girilince tahmin görünür." };
  } else if (!pace || pace.daysToFinish == null) {
    forecast = {
      kind: "ready",
      pct: scorePct,
      text: `Hazırlık %${scorePct}. Hedefin %${targetPct}.`,
    };
  } else if (pace.daysToFinish === 0 || scorePct >= targetPct) {
    forecast = {
      kind: "ready",
      pct: scorePct,
      text: `Hazırlık %${scorePct}. Hedefin %${targetPct}.`,
    };
  } else {
    const daysLeft = daysToExam ?? pace.daysToFinish;
    const span = Math.max(1, pace.daysToFinish);
    const projected = Math.round(
      Math.min(targetPct, scorePct + ((targetPct - scorePct) * Math.min(daysLeft, span)) / span),
    );
    const rate = pace.perWeek ? `haftada ${pace.perWeek}` : `günde ${pace.perDay}`;
    forecast = {
      kind: "ready",
      pct: projected,
      text: `Bu tempoyla yaklaşık ${pace.daysToFinish} günde hazırlık %${projected} olur. ${pace.lessonsToTarget} ders, ${rate}.`,
    };
  }
  const gapsMeasured = completed.some((attempt) => (attempt.total ?? 0) > 0);

  const mocks = completed
    .filter((attempt) => MOCK_KINDS.has(nodeById.get(attempt.nodeId)?.kind as PlanNodeKind))
    .filter((attempt) => (attempt.total ?? 0) > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((attempt) => {
      const node = nodeById.get(attempt.nodeId)!;
      return {
        title: topicOf(node) ?? node.title,
        date: attempt.createdAt,
        pct: pct(Math.max(0, attempt.score ?? 0), attempt.total ?? 0),
      };
    });

  return {
    scorePct,
    scoreBasis,
    completionPct: completion.pct,
    targetPct,
    weekActivities,
    // Hedefteki konu ölçülmüş olmalı (Paket I #7 eşiği): ölçülmemiş konu hedefte sayılmaz.
    topicsAtTarget: topics.filter((topic) => topic.state !== "unmeasured" && topic.pct >= targetPct).length,
    topicCount: labels.length,
    measuredTopics,
    coverageText: measuredTopics == null ? null : coverageLine(measuredTopics, labels.length),
    lessonsDone,
    forecast,
    forecastSeries: buildReadinessForecastSeries({
      currentPct: scorePct,
      targetPct,
      gainPerDay: gainPerLessonPct > 0 ? Math.min(6, gainPerLessonPct) : 0,
      daysRemaining: daysToExam,
      daysToTarget: pace?.daysToFinish ?? null,
      // Plan tarihli ama kalan dersleri hedefe yetmiyor: eğri planın son dersinde durur, hedefe varmaz.
      planEnd:
        pace && pace.lessonsToTarget > 0 && pace.daysToFinish == null && plannedLessonDays.length
          ? {
              day: plannedLessonDays[plannedLessonDays.length - 1]!,
              pct: scorePct + gainPerLessonPct * plannedLessonDays.length,
            }
          : null,
    }),
    pace,
    gapsMeasured,
    // Eski kayıtların "(boş)" / "Doğru" önizlemesi yazılmaz; yalnız şık taşıyan satır listeye girmez (Paket I #7).
    gaps: input.gaps
      .map((gap) => readableGap(gap, (label) => index.rowFor(label)?.label ?? label))
      .map((gap) => (gap.detail && isBareAnswerText(gap.detail) ? { ...gap, detail: null } : gap))
      .filter((gap) => !isBareAnswerText(gap.claim) || Boolean(gap.detail))
      .slice(0, 5),
    topics,
    weeks: { labels: weekLabels(), rows },
    mocks,
    tempo: {
      weeks: weekLabels().map((label, i) => ({ label, ...tempoWeeks[i] })),
      dailyGoalMinutes:
        typeof input.dailyMinutes === "number" && input.dailyMinutes > 0 ? input.dailyMinutes : null,
      thisWeekMinutes: tempoWeeks[WEEK_COUNT - 1].minutes,
    },
  };
}
