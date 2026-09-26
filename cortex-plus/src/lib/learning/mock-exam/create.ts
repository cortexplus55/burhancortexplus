import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { loadMergedTopicContext, loadTopicSpanContext } from "@/lib/learning/source-context";
import {
  allocateQuestions,
  buildBlueprint,
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
import { verifyChoiceQuestion } from "@/lib/learning/question-verifier";

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
    const weight = weightFromRefs(t.source_refs);
    const outOfScope = excluded.some((ex) => titlesAlign(ex, t.label));
    return {
      topicId: t.id === "studio" ? null : t.id,
      topicLabel: t.label,
      weightPercent: weight?.percent ?? null,
      examHeavy: weight?.heavy ?? false,
      outOfScope,
      passageChars: 100,
    };
  });

  // Pasaj uzunluklarını doldur
  for (const slot of slots) {
    if (slot.outOfScope) continue;
    const ctx = await topicContext(service, userId, prep.document_id as string | null, slot.topicLabel, topics);
    slot.passageChars = Math.max(40, ctx.block.length);
  }

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
  }

  const drafts: MockExamQuestionDraft[] = [];
  const allocation = blueprint.allocation.filter((a) => a.count > 0);
  const slotQueue = [...blueprint.slots];
  const chargeKey = `practice-exam:${prepId}:${userId}:${Date.now()}`;

  // Konu başına paralel üretim (en fazla 4)
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
          allowNumeric,
          allTopics: topics,
          chargeKey,
        }),
      ),
    );
    for (const part of parts) drafts.push(...part);
  }

  let questions = filterOverlappingQuestions(drafts);
  // Kaynaksız soru yayımlama
  questions = questions.filter((q) => q.source.label.trim().length > 0);

  // Harf dengesi bozuksa mcq'ları karıştır (yeniden üretmek yerine)
  if (!letterBalanceOk(questions)) {
    questions = rotateCorrectOptions(questions);
  }

  // Eksikse bir kez daha dene (en zayıf konu)
  const planned = blueprint.questionCount;
  if (questions.length < planned && allocation.length) {
    const weak = allocation[0];
    const extra = await generateForTopic({
      service,
      userId,
      isPremium: input.isPremium,
      prepTitle: String(prep.title),
      documentId: prep.document_id as string | null,
      topic: weak,
      slots: Array.from({ length: Math.min(4, planned - questions.length) }, () => ({
        type: "mcq" as const,
        points: 4,
      })),
      allowNumeric,
      allTopics: topics,
      chargeKey,
    });
    questions = filterOverlappingQuestions([
      ...questions,
      ...extra.filter((q) => q.source.label.trim()),
    ]);
  }

  const ready = questions.length;
  if (!ready) return { ok: false, status: 500, error: "generation_failed" };

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

  if (examError || !exam) return { ok: false, status: 500, error: "generation_failed" };

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

  return {
    ok: true,
    examId: exam.id as string,
    blueprint,
    planned,
    ready,
    note,
  };
}

async function generateForTopic(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  documentId: string | null;
  topic: { topicId: string | null; topicLabel: string; count: number };
  slots: Array<{ type: MockQuestionType; points: number }>;
  allowNumeric: boolean;
  allTopics: TopicRow[];
  chargeKey: string;
}): Promise<MockExamQuestionDraft[]> {
  const ctx = await topicContext(
    input.service,
    input.userId,
    input.documentId,
    input.topic.topicLabel,
    input.allTopics,
  );
  if (!ctx.block.trim()) return [];

  const sourceLabel = sourceLabelFromBlock(ctx.block, ctx.documentName);

  const typeHint = input.slots
    .map((s, i) => `${i + 1}. tür=${s.type}, puan=${s.points}`)
    .join("; ");

  const outcome = await generateExamQuiz({
    service: input.service,
    userId: input.userId,
    isPremium: input.isPremium,
    teachingV2: true,
    sourceExcerpt: ctx.block,
    requireSourceSupport: true,
    actionCode: "PRACTICE_EXAM_GENERATE",
    idempotencyKey: input.chargeKey,
    userPrompt: [
      `Sınav: ${input.prepTitle}.`,
      `Konu: ${input.topic.topicLabel}.`,
      `Tam ${input.slots.length} soru yaz; yalnız bu konudan.`,
      `Tür planı: ${typeHint}.`,
      input.allowNumeric ? "" : "Sayısal (numeric) soru yazma.",
      "Sınav disiplini: ipucu yok, doğru cevabı soru metnine koyma.",
      "Her soruda explanation ve optionWhy zorunlu.",
      "Kaynakta olmayan olgu yazma.",
    ]
      .filter(Boolean)
      .join(" "),
  });

  if (!outcome.ok) return [];

  const drafts: MockExamQuestionDraft[] = [];
  for (let i = 0; i < outcome.questions.length && drafts.length < input.slots.length; i += 1) {
    const q = outcome.questions[i];
    const slot = input.slots[drafts.length] ?? input.slots[0];
    const verified = verifyChoiceQuestion(
      {
        text: q.text,
        options: q.options,
        correct: q.correct,
        multi: q.multi || slot.type === "multi_mcq",
        explanation: q.explanation,
        optionWhy: q.optionWhy,
      },
      ctx.block,
    );
    if (verified.status === "drop") continue;
    const vq = verified.question;

    const type: MockQuestionType =
      slot.type === "multi_mcq" || vq.multi
        ? vq.correct.length > 1
          ? "multi_mcq"
          : "mcq"
        : slot.type === "mcq"
          ? "mcq"
          : slot.type;

    // open/short/numeric/tf: şimdilik mcq üretiminden türet; klasik için explanation→rubrik
    if (type === "open" || type === "short_answer") {
      drafts.push({
        text: polishMockCopy(q.text),
        type,
        options: [],
        correctAnswers: vq.correct,
        points: slot.points,
        explanation: polishMockCopy(q.explanation ?? ""),
        optionWhy: [],
        rubric:
          type === "open"
            ? [
                { criterion: "Ana fikir", points: Math.ceil(slot.points / 3) },
                { criterion: "Gerekçe", points: Math.ceil(slot.points / 3) },
                { criterion: "Örnek veya sayı", points: slot.points - 2 * Math.ceil(slot.points / 3) },
              ].filter((r) => r.points > 0)
            : [
                { criterion: "Beklenen nokta 1", points: Math.ceil(slot.points / 2) },
                { criterion: "Beklenen nokta 2", points: Math.floor(slot.points / 2) },
              ],
        modelAnswer: polishMockCopy(vq.correct.join("; ")),
        topicId: input.topic.topicId,
        topicLabel: input.topic.topicLabel,
        source: {
          documentId: input.documentId,
          page: pageFromLabel(sourceLabel),
          label: sourceLabel,
        },
        difficulty: "medium",
      });
      continue;
    }

    if (type === "true_false") {
      const statement = polishMockCopy(q.text);
      const isTrue = vq.correct[0] === vq.options[0];
      drafts.push({
        text: statement,
        type: "true_false",
        options: ["Doğru", "Yanlış"],
        correctAnswers: [isTrue ? "Doğru" : "Yanlış"],
        points: slot.points,
        explanation: polishMockCopy(q.explanation ?? ""),
        optionWhy: [],
        rubric: [],
        modelAnswer: "",
        topicId: input.topic.topicId,
        topicLabel: input.topic.topicLabel,
        source: {
          documentId: input.documentId,
          page: pageFromLabel(sourceLabel),
          label: sourceLabel,
        },
        difficulty: "medium",
        trueFalseStatement: statement,
        correctedStatement: isTrue ? statement : polishMockCopy(q.explanation ?? statement),
      });
      continue;
    }

    if (type === "numeric" && input.allowNumeric) {
      const num = extractLeadingNumber(vq.correct[0] ?? "");
      if (num == null) continue;
      drafts.push({
        text: polishMockCopy(q.text),
        type: "numeric",
        options: [],
        correctAnswers: vq.correct,
        points: slot.points,
        explanation: polishMockCopy(q.explanation ?? ""),
        optionWhy: [],
        rubric: [],
        modelAnswer: vq.correct[0] ?? "",
        topicId: input.topic.topicId,
        topicLabel: input.topic.topicLabel,
        source: {
          documentId: input.documentId,
          page: pageFromLabel(sourceLabel),
          label: sourceLabel,
        },
        difficulty: "medium",
        numericExpected: num,
        numericUnit: extractUnit(vq.correct[0] ?? ""),
        numericTolerance: Math.max(0.01, Math.abs(num) * 0.02),
      });
      continue;
    }

    drafts.push({
      text: polishMockCopy(vq.text),
      type: type === "multi_mcq" ? "multi_mcq" : "mcq",
      options: vq.options,
      correctAnswers: vq.correct,
      points: slot.points,
      explanation: polishMockCopy(vq.explanation ?? q.explanation ?? ""),
      optionWhy: vq.optionWhy ?? q.optionWhy ?? [],
      rubric: [],
      modelAnswer: "",
      topicId: input.topic.topicId,
      topicLabel: input.topic.topicLabel,
      source: {
        documentId: input.documentId,
        page: pageFromLabel(sourceLabel),
        label: sourceLabel,
      },
      difficulty: "medium",
    });
  }

  return drafts;
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

function weightFromRefs(raw: unknown): { percent: number | null; heavy: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && "weightPercent" in item) {
        const percent = Number((item as { weightPercent?: unknown }).weightPercent);
        return {
          percent: Number.isFinite(percent) ? percent : null,
          heavy: Boolean((item as { examHeavy?: unknown }).examHeavy),
        };
      }
    }
  }
  return null;
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

function extractLeadingNumber(text: string): number | null {
  const m = text.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractUnit(text: string): string | null {
  const m = text.match(/\d+(?:[.,]\d+)?\s*([a-zA-ZğüşıöçĞÜŞİÖÇ/%°]+)/);
  return m?.[1] ?? null;
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
    return { ...q, options, correctAnswers: [options[target]] };
  });
}

function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
