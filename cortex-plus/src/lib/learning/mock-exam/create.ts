import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { loadMergedTopicContext, loadTopicSpanContext } from "@/lib/learning/source-context";
import { assignExamCoverage, coverageAsk, topicCoveragePoints } from "@/lib/learning/mock-exam/fact-coverage";
import {
  slotFromTopicRow,
  buildBlueprint,
  letterBalanceOk,
  parseExamFormatFromText,
  polishMockCopy,
  TOPIC_GENERATE_CONCURRENCY,
  type MockExamBlueprint,
  type MockExamQuestionDraft,
  type MockLengthPreset,
  type MockQuestionType,
  type MockTopicSlot,
} from "@/lib/learning/mock-exam";
import { mockProgressCounter, type MockExamProgress } from "@/lib/learning/mock-exam/progress";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { teacherOralLoop } from "@/lib/learning/teacher-practice";
import { assertDeliverable, type DeliveryItem, type DeliverySlot } from "@/lib/learning/deliverable";
import {
  MOCK_EXAM_BUDGET_MS,
  MOCK_EXAM_WAVE_CAP,
  acceptedItems,
  publishReady,
  spreadSlotTypes,
  topicCountsMatch,
} from "@/lib/learning/exam-assembly";
import { fillUntilDelivered } from "@/lib/learning/fill-until-delivered";
import { avoidListBlock } from "@/lib/learning/item-dedup";
import { logMockExamWave } from "@/lib/learning/mock-exam/topup";
import { modelForAttempt } from "@/lib/learning/model-ladder";
import { sourceHasMeasurableQuantities } from "@/lib/learning/source-quantities";
import { studentOptionCount, type OptionCount } from "@/lib/learning/student-pedagogy";
import { topicWeightsFromText } from "@/lib/learning/mock-exam/weights-from-text";
import { exclusionPhrases } from "@/lib/learning/cross-material-topics";

export type CreateMockExamInput = {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepId: string;
  preset?: MockLengthPreset;
  scope?: "all" | "topics";
  topicIds?: string[];
  /** Stüdyo / tek konu. */
  topicLabel?: string;
  questionCount?: number;
  /** Öğrencinin seçtiği süre; 0 süresiz. Yoksa uzunluk seçeneğinin süresi. */
  durationMinutes?: number;
  /** Her konunun üretimi bitince (25 Ekim 2026): ekran gerçek sayıyı gösterir, sahte sayaç yok. */
  onProgress?: (progress: MockExamProgress) => void;
};

export type CreateMockExamResult =
  | {
      ok: true;
      examId: string;
      blueprint: MockExamBlueprint;
      planned: number;
      ready: number;
      note: string | null;
    }
  | { ok: false; status: number; error: string };

type TopicRow = {
  id: string;
  label: string;
  status: string | null;
  source_refs: unknown;
};

export type MockExamPlan = {
  prepTitle: string;
  documentId: string | null;
  topics: TopicRow[];
  blueprint: MockExamBlueprint;
  blocks: Map<string, string>;
};

export async function createMockExam(input: CreateMockExamInput): Promise<CreateMockExamResult> {
  const planned = await planMockExam(input);
  if (!planned.ok) return planned;
  const { service, userId, prepId } = input;
  const { plan } = planned;

  // Deneme başına tek ücret: kredi burada bir kez ayrılır, konu üretimleri bu ayrılışı
  // kullanır. 17 Ekim 2026'ya kadar her konu aynı anahtarla kendi ayırmaya çalışıyordu;
  // yalnız ilk konu geçiyor, ötekiler "işlem sürüyor/bitti" ile boş dönüyordu (Pediatri'de
  // 10 sorudan 1'i).
  const chargeKey = `practice-exam:${prepId}:${userId}:${Date.now()}`;
  const charge = await reserveCredits(service, userId, "PRACTICE_EXAM_GENERATE", chargeKey);
  if (!charge.ok) {
    // Ücretsizde deneme Plus'ta: kod `premium_required`, kapı geri sayımsız "Plus'ta açık" der (24 Ekim 2026).
    return { ok: false, status: charge.reason === "insufficient_credits" ? 402 : 409, error: refusalCode(charge) };
  }
  const reservationId = charge.reservationId;
  const refund = () => refundCredits(service, reservationId).catch(() => undefined);

  try {
    const assembled = await assembleMockExamQuestions({
      service,
      userId,
      isPremium: input.isPremium,
      prepTitle: plan.prepTitle,
      documentId: plan.documentId,
      topics: plan.topics,
      blueprint: plan.blueprint,
      reservationId,
      chargeKey,
      onProgress: input.onProgress,
      blocks: plan.blocks,
    });
    if (!assembled.ok) {
      await refund();
      return { ok: false, status: 500, error: "generation_failed" };
    }
    const saved = await persistMockExam({
      service,
      userId,
      prepId,
      prepTitle: plan.prepTitle,
      blueprint: plan.blueprint,
      questions: assembled.questions,
      slots: assembled.slots,
      scope: input.scope,
      topicIds: input.topicIds,
    });
    if (!saved.ok) {
      await refund();
      return { ok: false, status: 500, error: "generation_failed" };
    }
    await commitCredits(service, reservationId);
    return {
      ok: true,
      examId: saved.examId,
      blueprint: plan.blueprint,
      planned: assembled.planned,
      ready: assembled.planned,
      note: null,
    };
  } catch (error) {
    await refund();
    throw error;
  }
}

export async function planMockExam(
  input: CreateMockExamInput,
): Promise<{ ok: true; plan: MockExamPlan } | { ok: false; status: number; error: string }> {
  const { service, userId, prepId } = input;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, user_id, document_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return { ok: false, status: 404, error: "not_found" };

  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("id, label, status, source_refs")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  let topics = (topicRows ?? []) as TopicRow[];
  if (input.scope === "topics" && input.topicIds?.length) {
    const allowed = new Set(input.topicIds);
    topics = topics.filter((t) => allowed.has(t.id));
  }
  if (input.topicLabel?.trim()) {
    topics = topics.filter(
      (t) => fold(t.label) === fold(input.topicLabel!) || fold(t.label).includes(fold(input.topicLabel!)),
    );
    if (!topics.length) {
      topics = [
        {
          id: "studio",
          label: input.topicLabel.trim(),
          status: "ready",
          source_refs: [],
        },
      ];
    }
  }

  if (!topics.length) return { ok: false, status: 400, error: "no_topics" };

  const { slots, syllabus, syllabusText } = await loadMockExamSetup(service, userId, prepId, topics);

  // Konu metinleri (konular birbirini beklemez). Aynı okuma kapsam noktalarını da kurar. Dağılıma girmez:
  // kurulum ekranı metni bilmiyor, söz verdiği dağılım üretimde aynen kalmalı (Paket A).
  const blocks = new Map<string, string>();
  await Promise.all(
    slots.map(async (slot) => {
      if (slot.outOfScope) return;
      const ctx = await topicContext(service, userId, prep.document_id as string | null, slot.topicLabel, topics);
      blocks.set(slot.topicLabel, ctx.block);
    }),
  );

  const sampleSource = slots
    .filter((s) => !s.outOfScope)
    .map((s) => s.topicLabel)
    .join(" ");
  const allowNumeric = sourceHasMeasurableQuantities(sampleSource + syllabusText);

  let preset: MockLengthPreset = input.preset ?? (syllabus ? "real" : "standard");
  if (input.questionCount != null) {
    // Stüdyo kısa yol
    preset = input.questionCount <= 12 ? "short" : "standard";
  }

  // Soru türü yerleri de seçilen sayıya göre (24 Ekim 2026 lansman testi): Araçlar'da 5 soruluk yazılı
  // 5 çoktan seçmeli çıkmıştı. Dağılım ve yerler kurulum ekranının okuduğu `promisedAllocation`'dan.
  const blueprint = buildBlueprint({
    topics: slots,
    preset,
    syllabus: preset === "real" ? syllabus : null,
    allowNumeric,
    questionCount: input.questionCount ?? undefined,
  });
  if (input.durationMinutes != null) blueprint.durationMinutes = input.durationMinutes;

  return {
    ok: true,
    plan: {
      prepTitle: String(prep.title),
      documentId: (prep.document_id as string | null) ?? null,
      topics,
      blueprint,
      blocks,
    },
  };
}

/**
 * Kurulum ekranı ve üretim aynı konu yerlerini ve aynı sınav biçimini okur (Paket A, 28 Ekim 2026).
 * Kurulum eskiden ilk 3 belgenin 8 sayfasına bakıyor, "kapsam dışı" konuları bilmiyordu; üretim 8 belgenin
 * 12 sayfasına bakıyordu — iki ekran farklı biçim ve farklı dağılım görebiliyordu.
 */
export async function loadMockExamSetup(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  topics: Array<{ id: string; label: string; source_refs: unknown }>,
): Promise<{ slots: MockTopicSlot[]; syllabus: ReturnType<typeof parseExamFormatFromText>; syllabusText: string }> {
  const syllabusText = await loadSyllabusSnippet(service, userId, prepId);
  const syllabus = parseExamFormatFromText(syllabusText);
  const excluded = exclusionTitles(syllabusText);
  // Kayıtta ağırlık yoksa belgedeki "Yevmiye %35" (30 Ekim 2026, Paket I #4); kurulum ve üretim aynı yükleyiciyi okur.
  const textWeights = topicWeightsFromText(syllabusText, topics.map((t) => t.label));
  const slots: MockTopicSlot[] = topics.map((t) => {
    const slot = slotFromTopicRow({ id: t.id, label: t.label, sourceRefs: t.source_refs });
    slot.outOfScope = excluded.some((ex) => titlesAlign(ex, t.label));
    if (slot.weightPercent == null && textWeights.has(t.label)) slot.weightPercent = textWeights.get(t.label)!;
    return slot;
  });
  return { slots, syllabus, syllabusText };
}

/** Açık uçlu yerler (Astra'nın kâğıdındaki yazma yeri) sözlü deneme motorundan gelir. */
const OPEN_TYPES = new Set<MockQuestionType>(["open", "short_answer"]);

type TopicGenInput = {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  documentId: string | null;
  topic: { topicId: string | null; topicLabel: string; count: number };
  slots: Array<{ type: MockQuestionType; points: number }>;
  allTopics: TopicRow[];
  chargeKey: string;
  /** Denemenin ayrılmış kredisi; konu üretimi kendi ayırmaz (bkz. createMockExam). */
  reservationId: string;
  modelIndex?: number;
  /** Kabul edilmiş kökler. Aynı olgu yeniden sorulmasın. */
  avoid?: string[];
  /** Öğrencinin sınıfı/sınavı: 4 ya da 5 şık. Kâğıdın bütün soruları aynı sayıda (Paket A). */
  optionCount?: OptionCount;
};

type DraftBase = Pick<MockExamQuestionDraft, "topicId" | "topicLabel" | "source" | "difficulty">;

/** Konunun kilit bilgisi ve alt başlığı, kota kadar ayrı noktaya bölünür. */
function coverageBlock(block: string, topicLabel: string, count: number): string {
  const points = topicCoveragePoints([{ text: block }], topicLabel);
  const assigned = assignExamCoverage([{ topicLabel, count }], new Map([[topicLabel, points]]));
  return coverageAsk(assigned.map((slot) => slot.point));
}

function readDraft(question: MockExamQuestionDraft): DeliveryItem {
  return {
    topicId: question.topicId,
    topicLabel: question.topicLabel,
    type: question.type,
    text: question.text,
    options: question.options,
    correctAnswers: question.correctAnswers,
    explanation: question.explanation,
    sourceLabel: question.source.label,
  };
}

function buildDeliverySlots(blueprint: MockExamBlueprint, blocks: Map<string, string> | undefined): DeliverySlot[] {
  const allocation = blueprint.allocation.filter((row) => row.count > 0);
  const typedByTopic = spreadSlotTypes(
    allocation.map((row) => row.count),
    blueprint.slots,
    { type: "mcq" as MockQuestionType, points: 4 },
  );
  const points = new Map<string, ReturnType<typeof topicCoveragePoints>>();
  for (const row of allocation) {
    points.set(row.topicLabel, topicCoveragePoints([{ text: blocks?.get(row.topicLabel) ?? "" }], row.topicLabel));
  }
  const coverage = assignExamCoverage(
    allocation.map((row) => ({ topicLabel: row.topicLabel, count: row.count })),
    points,
  );
  const slots: DeliverySlot[] = [];
  let cursor = 0;
  for (const [rowIndex, row] of allocation.entries()) {
    for (const plan of typedByTopic[rowIndex] ?? []) {
      const point = coverage[cursor];
      cursor += 1;
      slots.push({
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        type: plan.type,
        points: plan.points,
        point: point?.point ?? null,
        signature: point?.signature ?? "",
      });
    }
  }
  return slots;
}

export async function assembleMockExamQuestions(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  documentId: string | null;
  topics: TopicRow[];
  blueprint: MockExamBlueprint;
  reservationId: string;
  chargeKey: string;
  prior?: MockExamQuestionDraft[];
  maxWaves?: number;
  onProgress?: (progress: MockExamProgress) => void;
  blocks?: Map<string, string>;
  /** Daha önce biten konular. Sayaç sıfırdan başlamasın. */
  initialTopics?: string[];
  modelIndexes?: Record<string, number>;
  signal?: AbortSignal;
  /** Konu biter bitmez. İstek düşse de bu sorular kalır. */
  onCheckpoint?: (snapshot: { items: MockExamQuestionDraft[]; topicsAttempted: string[]; wave?: number }) => Promise<void>;
  /** Günlük satırı. Soru metni yazılmaz. */
  examId?: string | null;
  /** Bu çağrıdan önce biten dalga. Parça parça istek bunu saklar. */
  wave?: number;
  /** Kâğıdın başladığı an. Duvar saati buna göre. */
  startedAt?: number;
  /** Zorlamalı doldurma daha önce denendi. */
  forced?: boolean;
}): Promise<
  | {
      ok: true;
      questions: MockExamQuestionDraft[];
      planned: number;
      slots: DeliverySlot[];
      wave: number;
      topicsAttempted: string[];
      topicTotal: number;
      modelIndexes: Record<string, number>;
      forced: boolean;
    }
  | {
      ok: false;
      questions: MockExamQuestionDraft[];
      planned: number;
      slots: DeliverySlot[];
      wave: number;
      topicsAttempted: string[];
      topicTotal: number;
      modelIndexes: Record<string, number>;
      forced: boolean;
    }
> {
  const allocation = input.blueprint.allocation.filter((row) => row.count > 0);
  const slots = buildDeliverySlots(input.blueprint, input.blocks);
  const optionCount = await studentOptionCount(input.service, input.userId, input.prepTitle);
  const seeded = new Set(input.initialTopics ?? []);
  const tick = mockProgressCounter(allocation.length, input.onProgress, seeded.size);
  const reported = new Set(seeded);
  const progress = (label: string) => {
    if (reported.has(label)) return;
    reported.add(label);
    tick(label);
  };
  const bag = [...(input.prior ?? [])];
  let liveWave = input.wave ?? 0;
  let chain = Promise.resolve();
  const exclusive = (task: () => Promise<void>) => {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const filled = await fillUntilDelivered({
    slots,
    prior: input.prior,
    maxWaves: input.maxWaves ?? 4,
    followUpWaves: input.maxWaves === 1 ? MOCK_EXAM_WAVE_CAP : undefined,
    waveCap: MOCK_EXAM_WAVE_CAP,
    budgetMs: MOCK_EXAM_BUDGET_MS,
    startedAt: input.startedAt,
    forced: input.forced,
    initialWave: input.wave ?? 0,
    onWave: (report) => {
      liveWave = report.wave;
      logMockExamWave({ examId: input.examId ?? null, ...report });
      void input.onCheckpoint?.({ items: bag.slice(), topicsAttempted: [...reported], wave: report.wave });
    },
    parallelism: TOPIC_GENERATE_CONCURRENCY,
    signal: input.signal,
    modelIndexes: input.modelIndexes,
    generate: (request) => {
      if (input.signal?.aborted) return Promise.resolve([]);
      const row = { topicId: request.topicId, topicLabel: request.topicLabel, count: request.slots.length };
      const typed = request.slots.map((slot) => ({
        type: (request.relaxed ? "mcq" : slot.type) as MockQuestionType,
        points: slot.points ?? 4,
      }));
      return generateForTopic({
        service: input.service,
        userId: input.userId,
        isPremium: input.isPremium,
        prepTitle: input.prepTitle,
        documentId: input.documentId,
        topic: row,
        slots: typed.length ? typed : [{ type: "mcq", points: 4 }],
        allTopics: input.topics,
        chargeKey: input.chargeKey,
        reservationId: input.reservationId,
        modelIndex: request.modelIndex,
        avoid: request.avoid,
        optionCount,
      })
        .then((produced) =>
          exclusive(async () => {
            bag.push(...produced);
            const topicsAttempted = reported.has(row.topicLabel) ? [...reported] : [...reported, row.topicLabel];
            await input.onCheckpoint?.({ items: bag.slice(), topicsAttempted, wave: liveWave });
          }).then(() => produced),
        )
        .finally(() => progress(row.topicLabel));
    },
    read: readDraft,
  });
  const planned = input.blueprint.questionCount;
  const meta = {
    planned,
    slots: filled.slots,
    wave: filled.completedWave,
    topicsAttempted: [...reported],
    topicTotal: allocation.length,
    modelIndexes: filled.modelIndexes,
    forced: filled.forced,
  };
  if (!filled.ok) {
    // Yalnız kapıdan geçmiş, kopya olmayan sorular sayılır: bozuk soru konunun kotasını dolu göstermesin.
    const have = new Map<string, number>();
    for (const { raw } of acceptedItems(slots, bag, readDraft)) {
      have.set(raw.topicLabel, (have.get(raw.topicLabel) ?? 0) + 1);
    }
    const missingTotal = allocation.reduce((sum, row) => sum + Math.max(0, row.count - (have.get(row.topicLabel) ?? 0)), 0);
    const targets = topUpTargets(allocation, have, missingTotal);
    if (targets.length) {
      const extra = (
        await Promise.all(
          targets.map((target) =>
            generateForTopic({
              service: input.service,
              userId: input.userId,
              isPremium: input.isPremium,
              prepTitle: input.prepTitle,
              documentId: input.documentId,
              topic: { topicId: target.row.topicId, topicLabel: target.row.topicLabel, count: target.missing },
              slots: Array.from({ length: target.missing }, () => ({ type: "mcq" as const, points: 4 })),
              allTopics: input.topics,
              chargeKey: input.chargeKey,
              reservationId: input.reservationId,
              modelIndex: 0,
              avoid: bag.map((item) => item.text),
              optionCount,
            }),
          ),
        )
      ).flat();
      bag.push(...extra);
    }
    const recovered = publishReady(slots, bag, readDraft);
    if (recovered.ok) {
      return {
        ok: true,
        questions: recovered.items,
        ...meta,
        slots: recovered.slots,
        forced: true,
      };
    }
    return { ok: false, questions: bag.slice(), ...meta };
  }
  let questions = filled.items.map((question, index) => ({
    ...question,
    points: filled.slots[index]?.points ?? question.points,
  }));
  if (!letterBalanceOk(questions)) questions = rotateCorrectOptions(questions);
  const gate = assertDeliverable(filled.slots, questions, readDraft);
  if (!gate.canPublish) {
    const again = publishReady(filled.slots, questions, readDraft);
    if (!again.ok) return { ok: false, questions: bag.slice(), ...meta };
    return {
      ok: true,
      questions: again.items.map((question, index) => ({
        ...question,
        points: again.slots[index]?.points ?? question.points,
      })),
      ...meta,
      slots: again.slots,
    };
  }
  return { ok: true, questions: gate.publishable, ...meta };
}

export async function persistMockExam(input: {
  service: SupabaseClient;
  userId: string;
  prepId: string;
  prepTitle: string;
  blueprint: MockExamBlueprint;
  questions: MockExamQuestionDraft[];
  slots: DeliverySlot[];
  scope?: "all" | "topics";
  topicIds?: string[];
}): Promise<{ ok: true; examId: string } | { ok: false }> {
  const gate = assertDeliverable(input.slots, input.questions, readDraft);
  if (!gate.canPublish || gate.publishable.length !== input.blueprint.questionCount) return { ok: false };
  const questions = gate.publishable;
  // Kurulumun söylediği konu başı sayı (Paket A): toplam tutsa da konular kaydıysa kâğıt yazılmaz.
  if (!topicCountsMatch(input.blueprint.allocation, questions)) return { ok: false };
  const { data: exam, error: examError } = await input.service
    .from("practice_exams")
    .insert({
      user_id: input.userId,
      title: `${input.prepTitle} · yazılı deneme`,
      duration_minutes: input.blueprint.durationMinutes,
      exam_prep_id: input.prepId,
      blueprint: input.blueprint,
      scope: input.scope ?? "all",
      topic_ids: input.topicIds ?? null,
    })
    .select("id")
    .single();
  if (examError || !exam) return { ok: false };
  const inserted = await insertMockExamQuestions(input.service, exam.id as string, questions);
  if (!inserted) return { ok: false };
  return { ok: true, examId: exam.id as string };
}

export function mockQuestionRows(examId: string, questions: MockExamQuestionDraft[]) {
  return questions.map((q, sort_order) => ({
    exam_id: examId,
    question_text: q.text,
    question_type: q.type,
    options: q.options.length ? q.options : null,
    correct_answer: q.correctAnswers[0] ?? null,
    correct_answers: q.correctAnswers,
    points: q.points,
    sort_order,
    topic_id: q.topicId,
    topic_label: q.topicLabel,
    explanation: q.explanation,
    option_why: q.optionWhy.length ? q.optionWhy : null,
    rubric: q.rubric.length ? q.rubric : null,
    model_answer: q.modelAnswer || null,
    source_document_id: q.source.documentId,
    source_page: q.source.page,
    source_label: q.source.label,
    difficulty: q.difficulty,
  }));
}

export async function insertMockExamQuestions(
  service: SupabaseClient,
  examId: string,
  questions: MockExamQuestionDraft[],
): Promise<boolean> {
  const { error } = await service.from("practice_exam_questions").insert(mockQuestionRows(examId, questions));
  return !error;
}

/**
 * Bir konunun soruları: çoktan seçmeli yerler öğretmen test motorundan, açık uçlu yerler
 * öğretmen sözlü motorundan. Her öğeyi kendi denetçisi çözer; kod soruyu başka türe
 * çevirmez (17 Ekim 2026'ya kadar şıkları silip doğru/yanlış, sayısal, açık uçlu
 * yapıyordu — denetçinin çözdüğü soru öğrencinin gördüğü soru değildi).
 */
async function generateForTopic(input: TopicGenInput): Promise<MockExamQuestionDraft[]> {
  const ctx = await topicContext(
    input.service,
    input.userId,
    input.documentId,
    input.topic.topicLabel,
    input.allTopics,
  );
  const sourceLabel = sourceLabelFromBlock(ctx.block, ctx.documentName);
  const base: DraftBase = {
    topicId: input.topic.topicId,
    topicLabel: input.topic.topicLabel,
    source: { documentId: input.documentId, page: pageFromLabel(sourceLabel), label: sourceLabel },
    difficulty: "medium",
  };
  const choiceSlots = input.slots.filter((slot) => !OPEN_TYPES.has(slot.type));
  const openSlots = input.slots.filter((slot) => OPEN_TYPES.has(slot.type));
  const [choice, open] = await Promise.all([
    choiceSlots.length ? choiceDrafts(input, ctx.block, choiceSlots, base) : Promise.resolve([]),
    openSlots.length ? openDrafts(input, ctx.block, openSlots, base) : Promise.resolve([]),
  ]);
  return [...choice, ...open];
}

async function choiceDrafts(
  input: TopicGenInput,
  block: string,
  slots: TopicGenInput["slots"],
  base: DraftBase,
): Promise<MockExamQuestionDraft[]> {
  const outcome = await generateExamQuiz({
    service: input.service,
    userId: input.userId,
    isPremium: input.isPremium,
    teachingV2: true,
    sourceExcerpt: block,
    requireSourceSupport: true,
    actionCode: "PRACTICE_EXAM_GENERATE",
    idempotencyKey: input.chargeKey,
    heldReservationId: input.reservationId,
    count: slots.length,
    optionCount: input.optionCount,
    // Öğrenci kurulum ekranında bekliyor: kısa düzeltme bütçesi (25 Ekim 2026).
    urgent: true,
    rephrase: true,
    model: modelForAttempt(input.modelIndex ?? 0),
    multi: slots.some((slot) => slot.type === "multi_mcq"),
    topicLabel: input.topic.topicLabel,
    prepTitle: input.prepTitle,
    previousStems: input.avoid,
    userPrompt: [
      `Sınav: ${input.prepTitle}.`,
      `Konu: ${input.topic.topicLabel}.`,
      `Tam ${slots.length} çoktan seçmeli soru yaz; yalnız bu konudan.`,
      "Sınav disiplini: ipucu yok, doğru cevabı soru metnine koyma.",
      "Her soruda explanation ve optionWhy zorunlu.",
      "Soru doğru kalsın ve yalnız bu konudan olsun. Cümleyi aynen kopyalamak zorunda değilsin; aynı noktayı başka bağlamda, başka sayıyla ya da başka açıdan sorabilirsin. Yanlış olgu yazma.",
      "Aynı olguyu, aynı cevabı ya da aynı kökü ikinci kez sorma. Sıradaki soru farklı bir alt başlık ya da açı olsun.",
      coverageBlock(block, input.topic.topicLabel, slots.length),
      avoidListBlock("KABUL EDİLMİŞ SORULAR (bununla örtüşen olgu, cevap ya da kök yazma):", input.avoid ?? []),
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!outcome.ok) return [];

  const drafts: MockExamQuestionDraft[] = [];
  for (const q of outcome.questions) {
    if (drafts.length >= slots.length) break;
    const slot = slots[drafts.length] ?? slots[0];
    // Öğretmen motorunun denetçisi soruyu kendisi çözüp onayladı; burada yalnız biçim bakılır.
    // Eski kural süzgeci (verifyChoiceQuestion) onaylı soruyu düşürüyor, kaynakta geçen tek şıkkı
    // görünce cevap anahtarını değiştirip çok cevaplıyı tek cevaplı yapıyordu (17 Ekim: Nefroloji'nin
    // tek sorusu düştü, denemede o konu hiç yoktu). Konu testi de bu süzgeçten geçmiyor.
    const options = q.options.map((option) => option.trim()).filter(Boolean);
    const correct = q.correct.filter((answer) => options.includes(answer));
    if (q.text.trim().length < 8 || options.length < 2 || !correct.length || (!q.multi && correct.length !== 1)) continue;
    const vq = { ...q, options, correct, multi: q.multi && correct.length > 1 };
    drafts.push({
      ...base,
      text: polishMockCopy(vq.text),
      type: vq.multi && vq.correct.length > 1 ? "multi_mcq" : "mcq",
      options: vq.options,
      correctAnswers: vq.correct,
      points: slot.points,
      explanation: polishMockCopy(vq.explanation ?? ""),
      optionWhy: vq.optionWhy ?? [],
      rubric: [],
      modelAnswer: "",
    });
  }
  return drafts;
}

async function openDrafts(
  input: TopicGenInput,
  block: string,
  slots: TopicGenInput["slots"],
  base: DraftBase,
): Promise<MockExamQuestionDraft[]> {
  const run = await runWithTeacherModel(input.service, {
    userId: input.userId,
    actionCode: "PRACTICE_EXAM_GENERATE",
    idempotencyKey: input.chargeKey,
    heldReservationId: input.reservationId,
    label: "teacher_exam_open",
    topic: input.topic.topicLabel,
    work: async (ask, started) => {
      const loop = await teacherOralLoop(
        ask,
        {
          topicLabel: input.topic.topicLabel,
          prepTitle: input.prepTitle,
          mode: "document",
          pages: [],
          sourceBlock: block,
          brief: [
            "Yazılı deneme: öğrenci cevabı birkaç cümleyle kâğıda ya da uygulamaya yazacak.",
            "Soru doğru kalsın ve bu konuda kalsın. Cümleyi aynen kopyalamak zorunda değilsin; aynı noktayı başka bağlamda, başka sayıyla ya da başka açıdan sorabilirsin.",
            "Aynı olguyu, aynı cevabı ya da aynı kökü ikinci kez sorma. Sıradaki soru farklı bir alt başlık ya da açı olsun.",
            coverageBlock(block, input.topic.topicLabel, slots.length),
            avoidListBlock("KABUL EDİLMİŞ SORULAR (bununla örtüşen olgu, cevap ya da kök yazma):", input.avoid ?? []),
          ]
            .filter(Boolean)
            .join("\n"),
          count: slots.length,
          urgent: true,
        },
        started,
      );
      return loop.items.length
        ? { ok: true as const, result: loop.items, log: { kept: loop.items.length, rejected: loop.rejected.length } }
        : { ok: false as const, reasons: loop.rejected.map((row) => row.problems[0] ?? "sorun") };
    },
  });
  if (!run.ok) return [];
  return run.result.slice(0, slots.length).map((item, index) => {
    const slot = slots[index] ?? slots[0];
    return {
      ...base,
      text: polishMockCopy(item.prompt),
      type: slot.type,
      options: [],
      correctAnswers: [],
      points: slot.points,
      explanation: polishMockCopy(item.modelAnswer),
      optionWhy: [],
      rubric: rubricFromPoints(item.expectedPoints, slot.points),
      modelAnswer: polishMockCopy(item.modelAnswer),
    };
  });
}

/**
 * Eksik soru kotası dolmamış konuda tamamlanır. Kotası dolmuş konuya soru eklenmez.
 * Duyurulan dağılım böylece üretimde korunur (P2-7).
 */
export function topUpTargets<R extends { topicLabel: string; count: number }>(
  allocation: R[],
  have: Map<string, number>,
  missingTotal: number,
): { row: R; missing: number }[] {
  const got = (row: R) => have.get(row.topicLabel) ?? 0;
  const short = allocation
    .map((row, index) => ({ row, index, deficit: row.count - got(row) }))
    .filter((item) => item.row.count > 0 && item.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || a.index - b.index);
  const counts = new Map<R, number>();
  let left = missingTotal;
  for (const item of short) {
    if (left <= 0) break;
    const take = Math.min(item.deficit, left);
    counts.set(item.row, take);
    left -= take;
  }
  return [...counts].map(([row, missing]) => ({ row, missing }));
}

/** Beklenen noktalar rubriğe: puan noktalara tam sayı olarak bölünür, artan ilk noktalara. */
export function rubricFromPoints(points: string[], total: number): { criterion: string; points: number }[] {
  const list = points.map((point) => point.trim()).filter(Boolean).slice(0, Math.max(1, total));
  if (!list.length) return [{ criterion: "Ana nokta", points: total }];
  const each = Math.floor(total / list.length);
  const extra = total - each * list.length;
  return list.map((criterion, index) => ({ criterion, points: each + (index < extra ? 1 : 0) }));
}

async function topicContext(
  service: SupabaseClient,
  userId: string,
  documentId: string | null,
  topicLabel: string,
  topics: TopicRow[],
) {
  const row = topics.find((t) => t.label === topicLabel);
  const refs = asRefs(row?.source_refs);
  const docIds = [
    ...new Set(
      [documentId, ...refs.map((r) => r.documentId)].filter((id): id is string => Boolean(id)),
    ),
  ];
  const span = await loadTopicSpanContext(service, userId, docIds, topicLabel, {
    preferredNodeId: refs[0]?.nodeId ?? null,
  });
  if (span?.block) return span;
  return loadMergedTopicContext(service, userId, topicLabel, {
    documentId,
    pageNumbers: refs[0]?.pages,
    allowSearch: true,
  });
}

async function loadSyllabusSnippet(
  service: SupabaseClient,
  userId: string,
  prepId: string,
): Promise<string> {
  try {
    const { data: docs } = await service
      .from("exam_prep_source_documents")
      .select("document_id")
      .eq("exam_prep_id", prepId)
      .limit(8);
    const ids = (docs ?? []).map((d) => d.document_id as string).filter(Boolean);
    if (!ids.length) {
      const { data: prep } = await service
        .from("exam_preps")
        .select("document_id")
        .eq("id", prepId)
        .maybeSingle();
      if (prep?.document_id) ids.push(prep.document_id as string);
    }
    if (!ids.length) return "";
    const { data: pages } = await service
      .from("document_pages")
      .select("text_content")
      .in("document_id", ids)
      .order("page_number")
      .limit(12);
    return (pages ?? [])
      .map((p) => String(p.text_content ?? ""))
      .join("\n")
      .slice(0, 12000);
  } catch {
    return "";
  }
}

function asRefs(raw: unknown): Array<{ documentId?: string; pages?: number[]; nodeId?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === "object") as Array<{
    documentId?: string;
    pages?: number[];
    nodeId?: string;
  }>;
}

/**
 * Kapsam dışı başlıklar: müfredat, konu haritası ve kurulum aynı okuyucuyu kullanır (Paket I, 30 Ekim 2026);
 * eskiden burada ayrı bir kalıp vardı ve "finalde yok" gibi ders notu cümlelerini tanımıyordu.
 */
function exclusionTitles(text: string): string[] {
  const out = exclusionPhrases(text).map((phrase) => phrase.slice(0, 120));
  // "X kapsam dışı / sınavda yok / hariç" satırının eski okuması da kalır (satırın ortasındaki "hariç").
  for (const line of text.split(/\n+/)) {
    if (!/kapsam\s*dışı|sınavda\s*yok|hariç/i.test(line)) continue;
    const cut = line.split(/kapsam\s*dışı|sınavda\s*yok|hariç/i)[0] ?? "";
    const title = cut.replace(/^[\s•\-*]+/, "").replace(/[.:;\-–—]+$/g, "").trim();
    if (title.length >= 4 && !out.includes(title.slice(0, 120))) out.push(title.slice(0, 120));
  }
  return out;
}

function titlesAlign(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  return left.includes(right) || right.includes(left);
}

function sourceLabelFromBlock(block: string, documentName: string | null): string {
  const m = block.match(/\[([^\]]+)\]\s*([^:\n]+)/);
  if (m) return polishMockCopy(`${m[2].trim()} · ${m[1].trim()}`);
  if (documentName?.trim()) return polishMockCopy(documentName.trim());
  return polishMockCopy("Yüklenen materyal");
}

function pageFromLabel(label: string): number | null {
  const m = label.match(/s\.?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function rotateCorrectOptions(questions: MockExamQuestionDraft[]): MockExamQuestionDraft[] {
  let shift = 0;
  return questions.map((q) => {
    if (q.type !== "mcq" || q.options.length < 2 || q.correctAnswers.length !== 1) return q;
    const correct = q.correctAnswers[0];
    const idx = q.options.indexOf(correct);
    if (idx < 0) return q;
    const target = (idx + shift) % q.options.length;
    shift += 1;
    if (target === idx) return q;
    const options = [...q.options];
    [options[idx], options[target]] = [options[target], options[idx]];
    // Şık gerekçesi şıkla birlikte yer değiştirir; yoksa açıklama başka şıkkın altına düşer.
    const optionWhy = [...q.optionWhy];
    if (optionWhy.length === q.options.length) [optionWhy[idx], optionWhy[target]] = [optionWhy[target], optionWhy[idx]];
    return { ...q, options, optionWhy, correctAnswers: [options[target]] };
  });
}

function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
