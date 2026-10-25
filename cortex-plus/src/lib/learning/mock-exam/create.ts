import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { loadMergedTopicContext, loadTopicSpanContext } from "@/lib/learning/source-context";
import {
  allocateQuestions,
  slotFromTopicRow,
  buildBlueprint,
  defaultSlots,
  filterOverlappingQuestions,
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
import { dropNearDuplicates } from "@/lib/learning/item-dedup";

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

export async function createMockExam(input: CreateMockExamInput): Promise<CreateMockExamResult> {
  const { service, userId, prepId } = input;
  const startedAt = Date.now();

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

  const syllabusText = await loadSyllabusSnippet(service, userId, prepId);
  const syllabus = parseExamFormatFromText(syllabusText);
  const excluded = exclusionTitles(syllabusText);

  const slots: MockTopicSlot[] = topics.map((t) => {
    const slot = slotFromTopicRow({ id: t.id, label: t.label, sourceRefs: t.source_refs });
    slot.outOfScope = excluded.some((ex) => titlesAlign(ex, t.label));
    return slot;
  });

  // Pasaj uzunluklarını doldur (konular birbirini beklemez).
  await Promise.all(
    slots.map(async (slot) => {
      if (slot.outOfScope) return;
      const ctx = await topicContext(service, userId, prep.document_id as string | null, slot.topicLabel, topics);
      slot.passageChars = Math.max(40, ctx.block.length);
    }),
  );

  const sampleSource = slots
    .filter((s) => !s.outOfScope)
    .map((s) => s.topicLabel)
    .join(" ");
  const allowNumeric = subjectAllowsNumeric(String(prep.exam_type ?? ""), sampleSource + syllabusText);

  let preset: MockLengthPreset = input.preset ?? (syllabus ? "real" : "standard");
  if (input.questionCount != null) {
    // Stüdyo kısa yol
    preset = input.questionCount <= 12 ? "short" : "standard";
  }

  const blueprint = buildBlueprint({
    topics: slots,
    preset,
    syllabus: preset === "real" ? syllabus : null,
    allowNumeric,
  });

  if (input.questionCount != null && preset !== "real") {
    blueprint.questionCount = input.questionCount;
    blueprint.allocation = allocateQuestions(slots, input.questionCount);
    // Soru türü yerleri de seçilen sayıya göre (24 Ekim 2026 lansman testi): yerler hazır planın sayısıyla
    // (kısa 10, standart 20) kuruluyor, açık uçlu ve çok cevaplı yerler listenin sonunda kalıyordu; Araçlar'da
    // 5 soruluk yazılı 5 çoktan seçmeli çıktı (15'lik de açık uçlusuz).
    blueprint.slots = defaultSlots(input.questionCount, allowNumeric);
  }
  if (input.durationMinutes != null) blueprint.durationMinutes = input.durationMinutes;

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
    const drafts: MockExamQuestionDraft[] = [];
    const allocation = blueprint.allocation.filter((a) => a.count > 0);
    const slotQueue = [...blueprint.slots];
    const progress = mockProgressCounter(allocation.length, input.onProgress);

    // Konu başına paralel üretim; her biten konu ilerlemeyi bir artırır.
    for (let i = 0; i < allocation.length; i += TOPIC_GENERATE_CONCURRENCY) {
      const batch = allocation.slice(i, i + TOPIC_GENERATE_CONCURRENCY);
      const batchPlans = batch.map((row) => ({
        row,
        slots: slotQueue.splice(0, row.count),
      }));
      const parts = await Promise.all(
        batchPlans.map(({ row, slots }) =>
          generateForTopic({
            service,
            userId,
            isPremium: input.isPremium,
            prepTitle: String(prep.title),
            documentId: prep.document_id as string | null,
            topic: row,
            slots: slots.length ? slots : [{ type: "mcq", points: 4 }],
            allTopics: topics,
            chargeKey,
            reservationId,
          }).finally(() => progress(row.topicLabel)),
        ),
      );
      for (const part of parts) drafts.push(...part);
    }

    let questions = dropNearDuplicates(filterOverlappingQuestions(drafts), (question) => question.text);
    // Kaynaksız soru yayımlama
    questions = questions.filter((q) => q.source.label.trim().length > 0);

    // Harf dengesi bozuksa mcq'ları karıştır (yeniden üretmek yerine)
    if (!letterBalanceOk(questions)) {
      questions = rotateCorrectOptions(questions);
    }

    // Eksikse bir kez daha dene: eksik kalan konular, çoktan seçmeli (17 Ekim 2026'ya kadar her
    // zaman listenin ilk konusu deneniyordu; Nefroloji boş kalınca yerine Büyüme'den ikinci soru geldi).
    // 19 Ekim 2026: hiç soru vermeyen konu yine yeniden denenir; kısmen dolan zor konu ise baştan
    // denenmez, eksik soru kendi sorularını sorunsuz veren konulardan gelir. Araçlar'daki 10 soruluk
    // Ekonomi yazılısında tek konu 143 sn uğraşıp 1 soru verdi, tamamlama aynı konuyu 132 sn daha
    // denedi; deneme 280 sn sürdü (tavan 300). Tamamlama ancak TOPUP_DEADLINE_MS'den önce başlar.
    const planned = blueprint.questionCount;
    if (questions.length < planned && allocation.length && Date.now() - startedAt < TOPUP_DEADLINE_MS) {
      const have = new Map<string, number>();
      for (const q of questions) have.set(q.topicLabel, (have.get(q.topicLabel) ?? 0) + 1);
      const targets = topUpTargets(allocation, have, planned - questions.length).slice(0, TOPIC_GENERATE_CONCURRENCY);
      const extra = await Promise.all(
        targets.map(({ row, missing }) =>
          generateForTopic({
            service,
            userId,
            isPremium: input.isPremium,
            prepTitle: String(prep.title),
            documentId: prep.document_id as string | null,
            topic: row,
            slots: Array.from({ length: Math.min(4, missing) }, () => ({ type: "mcq" as const, points: 4 })),
            allTopics: topics,
            chargeKey,
            reservationId,
          }),
        ),
      );
      questions = dropNearDuplicates(
        filterOverlappingQuestions([
          ...questions,
          ...extra.flat().filter((q) => q.source.label.trim()),
        ]),
        (question) => question.text,
      ).slice(0, planned);
    }

    const ready = questions.length;
    if (!ready) {
      await refund();
      return { ok: false, status: 500, error: "generation_failed" };
    }

    const note =
      ready < planned
        ? polishMockCopy(`Planlanan ${planned} sorudan ${ready}'si hazırlandı.`)
        : null;

    const { data: exam, error: examError } = await service
      .from("practice_exams")
      .insert({
        user_id: userId,
        title: `${prep.title} · yazılı deneme`,
        duration_minutes: blueprint.durationMinutes,
        exam_prep_id: prepId,
        blueprint,
        scope: input.scope ?? "all",
        topic_ids: input.topicIds ?? null,
      })
      .select("id")
      .single();

    if (examError || !exam) {
      await refund();
      return { ok: false, status: 500, error: "generation_failed" };
    }

    await service.from("practice_exam_questions").insert(
      questions.map((q, sort_order) => ({
        exam_id: exam.id,
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
      })),
    );

    await commitCredits(service, reservationId);
    return {
      ok: true,
      examId: exam.id as string,
      blueprint,
      planned,
      ready,
      note,
    };
  } catch (error) {
    await refund();
    throw error;
  }
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
};

type DraftBase = Pick<MockExamQuestionDraft, "topicId" | "topicLabel" | "source" | "difficulty">;

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
  if (!ctx.block.trim()) return [];

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
    // Tek iyi soru bu konu için yeter: eksik kalan soruyu deneme kendisi tamamlar (motorun
    // kendi ikinci taslağı zor konuda süreyi ikiye katlıyordu, 19 Ekim 2026).
    minimum: 1,
    // Öğrenci kurulum ekranında bekliyor: kısa düzeltme bütçesi (25 Ekim 2026).
    urgent: true,
    multi: slots.some((slot) => slot.type === "multi_mcq"),
    topicLabel: input.topic.topicLabel,
    prepTitle: input.prepTitle,
    userPrompt: [
      `Sınav: ${input.prepTitle}.`,
      `Konu: ${input.topic.topicLabel}.`,
      `Tam ${slots.length} çoktan seçmeli soru yaz; yalnız bu konudan.`,
      "Sınav disiplini: ipucu yok, doğru cevabı soru metnine koyma.",
      "Her soruda explanation ve optionWhy zorunlu.",
      "Kaynakta olmayan olgu yazma.",
    ].join(" "),
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
          brief: "Yazılı deneme: öğrenci cevabı birkaç cümleyle kâğıda ya da uygulamaya yazacak.",
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

/** Eksik tamamlama ancak denemenin başından bu kadar süre geçmeden başlar (rota tavanı 300 sn). */
const TOPUP_DEADLINE_MS = 150_000;

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

function exclusionTitles(text: string): string[] {
  const lines = text.split(/\n+/);
  const out: string[] = [];
  for (const line of lines) {
    if (!/kapsam\s*dışı|sınavda\s*yok|hariç/i.test(line)) continue;
    const cut = line.split(/kapsam\s*dışı|sınavda\s*yok|hariç/i)[0] ?? "";
    const title = cut.replace(/^[\s•\-*]+/, "").replace(/[.:;\-–—]+$/g, "").trim();
    if (title.length >= 4) out.push(title.slice(0, 120));
  }
  return out;
}

function titlesAlign(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  return left.includes(right) || right.includes(left);
}

function subjectAllowsNumeric(examType: string, sample: string): boolean {
  const folded = fold(`${examType} ${sample.slice(0, 400)}`);
  if (/tarih|edebiyat|dil\b|felsefe|inkilap|sosyal\s*bilgi|anayasa/.test(folded)) {
    return false;
  }
  return /\d/.test(sample);
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
