/** Sözlü deneme: öğretmen motoruyla yazım, "Tüm sınav" kaynağı, hakem notlandırması ve kayıtlı rapor. */
import "server-only";
import { loadPreviousItems } from "@/lib/learning/previous-items";
import { teacherOralLoop } from "@/lib/learning/teacher-practice";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson } from "@/lib/ai/generate";
import { EMPTY_SOURCE_CONTEXT, loadPageSourceAcrossDocuments, type SourceContext } from "@/lib/learning/source-context";
import { oralQuestionPlan, oralScopeSources, type OralScopeTopic } from "@/lib/learning/oral-scope";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";
import { createTopicIndex } from "@/lib/learning/topic-identity";
import { ORAL_JUDGE_RULES, oralFirstAnswer, oralFollowAnswer, oralFollowQuestion, stampOralQuestions, type OralExamReport, type OralGroundingPassage, type OralQuestionDraft, type OralSemanticItem } from "@/lib/learning/oral-exam";
import { loadPrepChatGrounding } from "@/lib/learning/prep-chat-grounding";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { parseSessionMeta, teachingActivityForKind } from "@/lib/learning/teaching-standards";
import { NodeGenerationError, actionForKind } from "./shared";
import type { NodePayloadInput } from "./generate";

/**
 * Sözlü notu, hazırlığın korpusuna da bakar. Okuma düşerse düğümün
 * kendi sayfa metni yeter; ikinci bir model çağrısı yok.
 */
export async function oralCorpus(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  questions: OralQuestionDraft[],
  topicLabel: string,
): Promise<{ corpus: string; passages: OralGroundingPassage[] }> {
  try {
    const message =
      questions.map((question) => question.prompt ?? "").filter(Boolean).join("\n") || topicLabel;
    const grounded = await loadPrepChatGrounding(service, userId, prepId, message);
    return {
      corpus: grounded.corpus,
      passages: grounded.passages.map((passage) => ({
        documentName: passage.documentName,
        pageNumber: passage.pageNumber,
        slide: passage.slide,
        content: passage.content,
      })),
    };
  } catch {
    return { corpus: "", passages: [] };
  }
}

/** Sözlü hakem ister mi: rubriği olan soru varsa (yoksa notlandırma kelime örtüşmesiyle, anında). */
export function oralNeedsJudge(payload: unknown): boolean {
  const questions = ((payload as { questions?: OralQuestionDraft[] } | null)?.questions ?? []);
  return questions.some((question) => (question.expectedPoints ?? []).length > 0);
}

/** Öğretmen sözlü deneme motoru (2 Ekim 2026): her soru, nokta ve örnek cevap belgeyle eşlenir. */
export async function teacherOralPayload(
  input: NodePayloadInput,
  activity: ReturnType<typeof teachingActivityForKind>,
  asked: number,
) {
  const startedAt = Date.now();
  const block = input.sourceBlock.trim();
  // Bu konuda önceki etkinliklerin sorduğu bilgiler (Paket I #8): sözlü aynı bilgiyi yeniden sormasın.
  const avoid =
    input.prepId && input.userId
      ? await loadPreviousItems(input.service, {
          userId: input.userId,
          prepId: input.prepId,
          kind: "oral",
          excludeNodeId: input.nodeId ?? null,
          topic: input.topicLabel,
          topicId: input.topicId ?? null,
        })
      : [];
  const outcome = await runWithTeacherModel(input.service, {
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `oral:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    startedAt,
    label: "teacher_oral",
    topic: input.topicLabel,
    work: async (ask, started) => {
      const loop = await teacherOralLoop(
        ask,
        {
          topicLabel: input.topicLabel,
          prepTitle: input.prepTitle,
          pages: [],
          sourceBlock: block || undefined,
          mode: block ? "document" : "topic",
          brief: input.syllabusLine?.trim() || undefined,
          learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
          examPoints: input.examPoints,
          examPointsUse: "oral",
          count: asked,
          urgent: input.charge !== false,
          avoid,
        },
        started,
      );
      const log = { kept: loop.items.length, rejected: loop.rejected.length, rounds: loop.rounds };
      return loop.items.length >= Math.min(asked, 3)
        ? { ok: true as const, result: loop.items, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  return {
    type: "oral",
    testedTopic: input.topicLabel,
    questions: stampOralQuestions(outcome.result, input.oralCitation),
    teachingStandard: activity,
    engine: "teacher",
  };
}

/**
 * Sözlü "Tüm sınav": konular sort_order ile K1..KN; soru sayısı kadar konu eşit aralıkla seçilir, her
 * birinin kendi belgesinden kendi sayfaları (konu kaynağı, yoksa konunun dersinin sayfaları) okunur.
 */
export async function loadOralAllSource(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    count: number;
    fallbackDocumentIds: Array<string | null | undefined>;
    sourceBoundaryMode: "documents_only" | "allow_supporting" | null;
    /** Birden çok konu seçildiyse yalnız bunlar (konu satırı ya da belge konu düğümü kimliği). */
    onlyTopicIds?: readonly string[] | null;
  },
): Promise<{ source: SourceContext; plan: string[] }> {
  const [{ data: topicRows }, { data: nodeRows }] = await Promise.all([
    service
      .from("exam_prep_topics")
      .select("id, label, sort_order, source_refs, document_topic_node_id")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order"),
    service.from("exam_prep_nodes").select("kind, session_meta").eq("exam_prep_id", input.prepId).order("sort_order"),
  ]);
  const rows = (topicRows ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label ?? "").trim(),
    documentTopicNodeId: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
    sourceRefs: row.source_refs,
  }));
  // Düğümün sayfaları konuya tek kuralla bağlanır (30 Ekim 2026): belgeli hazırlıkta düğüm belge konu düğümünü taşır;
  // önceden konu satırı kimliğiyle aranıyor, hiç tutmuyordu (yalnız ad kalıyordu).
  const index = createTopicIndex(rows);
  const nodePages = new Map<string, number[]>();
  for (const row of nodeRows ?? []) {
    const meta = parseSessionMeta(row.session_meta);
    if (!meta?.sourcePages?.length) continue;
    const owner = index.rowFor({ id: meta.topicId ?? null, label: meta.topicTitle ?? null });
    if (!owner || nodePages.has(owner.id)) continue;
    nodePages.set(owner.id, meta.sourcePages);
  }
  const wanted = input.onlyTopicIds?.length
    ? new Set(input.onlyTopicIds.map((id) => index.rowFor({ id })?.id).filter((id): id is string => Boolean(id)))
    : null;
  const topics: OralScopeTopic[] = rows
    .filter((row) => !wanted || wanted.has(row.id))
    .map((row) => {
      const ref = parseTopicSourceRefs(row.sourceRefs)[0];
      const pages = ref?.pages?.length ? ref.pages : (nodePages.get(row.id) ?? []);
      return { label: row.label, documentId: ref?.documentId ?? null, pages };
    });
  const chosen = oralScopeSources(topics, input.count);
  const plan = oralQuestionPlan(
    chosen.map((topic) => topic.label),
    input.count,
  );
  const blocks: string[] = [];
  let documentName: string | null = null;
  for (const topic of chosen) {
    if (!topic.pages.length) continue;
    try {
      const loaded = await loadPageSourceAcrossDocuments(
        service,
        input.userId,
        [topic.documentId, ...input.fallbackDocumentIds],
        topic.pages,
        { sourceBoundaryMode: input.sourceBoundaryMode, topicLabel: topic.label, mode: "tolerant" },
      );
      if (loaded.block.trim()) {
        blocks.push(`### Konu: ${topic.label}\n${loaded.block.trim()}`);
        documentName ??= loaded.documentName;
      }
    } catch {
      // Konunun sayfası okunamadı: öbür konular yine gelir.
    }
  }
  return { source: { ...EMPTY_SOURCE_CONTEXT, block: blocks.join("\n\n"), documentName }, plan };
}

export const oralSemanticSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().min(0),
      points: z.array(
        z.object({
          point: z.string().min(1).max(240),
          status: z.enum(["covered", "partial", "missing"]),
          quote: z.string().max(240),
        }),
      ),
      firstAnswerIssue: z
        .object({ wrong: z.string().min(1).max(240), correct: z.string().min(1).max(300) })
        .nullable()
        .optional(),
    }),
  ),
});

/**
 * Hakemin soru bloğu (29 Ekim 2026): soru, beklenen noktalar, rubrik, örnek çözüm, ilk cevap, varsa
 * takip sorusu ve cevabı. Ham kaynak metni isteme girmez — hakem "doğrusu"nu yalnız bu bloktan yazar.
 */
export function oralJudgeBlock(question: OralQuestionDraft, answers: Record<string, unknown>, index: number): string {
  const first = oralFirstAnswer(answers, index);
  const followQuestion = oralFollowQuestion(answers, index);
  const followAnswer = oralFollowAnswer(answers, index);
  const rubric = (question.rubricCriteria ?? []).map((item) => item.trim()).filter(Boolean);
  return [
    `--- Soru ${index} (index=${index}) başı ---`,
    `Soru: ${question.prompt ?? ""}`,
    `Beklenen noktalar: ${(question.expectedPoints ?? []).join(" | ")}`,
    rubric.length ? `Rubrik: ${rubric.join(" | ")}` : "",
    question.modelAnswer?.trim() ? `Örnek çözüm: ${question.modelAnswer.trim()}` : "",
    `İlk cevap: ${first || "(boş)"}`,
    followQuestion || followAnswer ? `Takip sorusu: ${followQuestion || "(kaydedilmedi)"}` : "",
    followQuestion || followAnswer ? `Takip cevabı: ${followAnswer || "(boş)"}` : "",
    `--- Soru ${index} sonu ---`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Sınav sonunda tek hakem çağrısı. Başarısızsa null → kelime örtüşmesi yedeği. */
export async function gradeOralSemantics(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  questions: OralQuestionDraft[];
  answers: Record<string, unknown>;
}): Promise<OralSemanticItem[] | null> {
  const blocks = input.questions.map((question, index) => oralJudgeBlock(question, input.answers, index)).join("\n\n");
  const outcome = await generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "PRACTICE_EXAM_GRADE",
    isPremium: input.isPremium,
    schemaHint:
      'Yalnızca JSON: {"items":[{"index":number,"points":[{"point":string,"status":"covered"|"partial"|"missing","quote":string}],"firstAnswerIssue":{"wrong":string,"correct":string}|null}]}. Her nokta için öğrencinin cevabından birebir alıntı (quote) ver; alıntı yoksa status missing. Soru metnini quote yapma. Cevap konuşma tanımasından gelmiş olabilir: bitişik veya ayrı yazım ve sesçe yakın terimler aynı noktadır.',
    userPrompt: `Sözlü deneme anlam değerlendirmesi. ${ORAL_JUDGE_RULES}\n\n${blocks}`,
    parse: (raw) => oralSemanticSchema.safeParse(raw).data ?? null,
  });
  if (!outcome.ok || !outcome.data?.items?.length) return null;
  return outcome.data.items.map((item) => ({
    index: item.index,
    points: item.points,
    firstAnswerIssue: item.firstAnswerIssue ?? null,
  }));
}

export function oralReviewFromPayload(payload: unknown): OralExamReport | null {
  if (!payload || typeof payload !== "object") return null;
  const meta = (payload as { gradeMeta?: unknown }).gradeMeta;
  if (!meta || typeof meta !== "object") return null;
  const report = meta as OralExamReport;
  return Array.isArray(report.items) ? report : null;
}
