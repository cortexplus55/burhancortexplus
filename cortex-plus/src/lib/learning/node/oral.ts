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
import { prepTopicLabels } from "@/lib/documents/generation-context";
import { narrowPagesToTopic, oralTopicScopeLine } from "@/lib/learning/topic-section";
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
  /*
    Konu kilidi (10 Kasım 2026). Canlıda tek konu seçilen sözlüde sorular belgedeki öbür konulardan geldi: ders,
    konu testi ve podcast kaynağı konunun bölümüne daraltıp kapsam satırı ekliyordu (6 Kasım 2026), sözlü ise
    sayfanın tamamını kapsamsız okuyordu; kısa notta bütün konular aynı sayfadadır. Tek konulu sözlüde kaynak
    konunun kendi bölümüne iner ve yazar açık kapsam kuralını okur. "Tüm sınav" ve çok konulu sözlü değişmez.
  */
  const siblings =
    input.oralSingleTopic && input.prepId ? await prepTopicLabels(input.service, input.prepId).catch(() => [] as string[]) : [];
  const rawBlock = input.sourceBlock.trim();
  const narrowed =
    input.oralSingleTopic && rawBlock && siblings.length
      ? narrowPagesToTopic([{ page: 0, text: rawBlock }], input.topicLabel, siblings)
      : null;
  const block = narrowed?.narrowed ? (narrowed.pages[0]?.text.trim() ?? rawBlock) : rawBlock;
  const scopeLine = input.oralSingleTopic ? oralTopicScopeLine(input.topicLabel, siblings) : "";
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
  // 1. soru önce (3 Kasım 2026, t260u; canlı ölçüm: bütün sorular tek çağrıda yazılıp denetlenirken ilk soru ~30 sn).
  // Öğrenci bekliyorsa yalnız ilk soru düşük düşünme düzeyiyle yazılır ve ekran açılır; kalan sorular yanıttan
  // sonra aynı kurallarla (aynı yapı denetimi, aynı kaynak) arkada yazılıp kayda eklenir. Kredi bir kez (ilk
  // çağrıda); arka yazım ek kredi düşmez. Önceden yazımda bugünkü gibi hepsi birlikte.
  const split = input.charge !== false && asked >= 3 && Boolean(input.onOralRestLater);
  const firstCount = split ? 1 : asked;
  const loopInput = (count: number, extraAvoid: string[]) => ({
    topicLabel: input.topicLabel,
    prepTitle: input.prepTitle,
    pages: [],
    sourceBlock: block || undefined,
    mode: (block ? "document" : "topic") as "document" | "topic",
    brief: [scopeLine, input.syllabusLine?.trim() ?? ""].filter(Boolean).join("\n") || undefined,
    learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
    examPoints: input.examPoints,
    examPointsUse: "oral" as const,
    count,
    urgent: input.charge !== false,
    avoid: [...avoid, ...extraAvoid],
  });
  const outcome = await runWithTeacherModel(input.service, {
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `oral:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    startedAt,
    label: "teacher_oral",
    topic: input.topicLabel,
    ...(split ? { reasoningEffort: "low" as const } : {}),
    work: async (ask, started) => {
      const loop = await teacherOralLoop(ask, loopInput(firstCount, []), started);
      const log = { kept: loop.items.length, rejected: loop.rejected.length, rounds: loop.rounds, split };
      return loop.items.length >= Math.min(firstCount, 3)
        ? { ok: true as const, result: loop.items, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  const first = stampOralQuestions(outcome.result, input.oralCitation);
  if (split && input.onOralRestLater) {
    const firstPrompts = first.map((q) => String(q.prompt ?? "")).filter(Boolean);
    input.onOralRestLater(async () => {
      const rest = await runWithTeacherModel(input.service, {
        userId: input.userId,
        actionCode: actionForKind(input.kind),
        idempotencyKey: `oral_rest:${input.idempotencyKey ?? startedAt}`,
        charge: false,
        startedAt: Date.now(),
        label: "teacher_oral_rest",
        topic: input.topicLabel,
        work: async (ask, started) => {
          const loop = await teacherOralLoop(ask, loopInput(asked - first.length, firstPrompts), started);
          return loop.items.length
            ? { ok: true as const, result: loop.items }
            : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun") };
        },
      });
      return rest.ok ? stampOralQuestions(rest.result, input.oralCitation).slice(0, asked - first.length) : [];
    });
  }
  return {
    type: "oral",
    testedTopic: input.topicLabel,
    questions: first,
    ...(split ? { oralPending: { target: asked } } : {}),
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
/**
 * Sözlüde değerlendirilecek bir cevap var mı (3 Kasım 2026 kök neden: boş cevapla bitirilen sözlü yine de arka plan
 * hakemine gidiyor, hakem boş girdide iki kez düşüp ekran uzun süre "Değerlendiriliyor…"da kalıyordu).
 */
export function oralHasAnswerText(questions: readonly unknown[], answers: Record<string, unknown>): boolean {
  return questions.some((_, index) => Boolean(oralFirstAnswer(answers, index).trim() || oralFollowAnswer(answers, index).trim()));
}

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
