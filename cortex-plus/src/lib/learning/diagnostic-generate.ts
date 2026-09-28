import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachQuestionMeta,
  firstLessonDiagnosticSlots,
  selectDiagnosticSkillQuestions,
  isDiagnosticSkill,
  pickMainTopics,
  planDiagnosticTopics,
  scoreDiagnosticAnswers,
  type DiagnosticQuestion,
  type DiagnosticSkill,
  type DiagnosticTopicPlan,
} from "@/lib/learning/diagnostic";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import {
  normalizeQuizQuestion,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import {
  loadPageSourceContext,
  SourceUnavailableError,
} from "@/lib/learning/source-context";

export type DocumentTopicRow = {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
  common_mistakes?: string[] | null;
};

export async function loadDocumentTopicPlans(
  service: SupabaseClient,
  documentId: string,
  prepTopics: { id: string; label: string; document_topic_node_id?: string | null }[],
): Promise<DiagnosticTopicPlan[]> {
  const { data: nodes } = await service
    .from("document_topic_nodes")
    .select("id, title, parent_id, sort_order, common_mistakes")
    .eq("document_id", documentId)
    .order("sort_order");

  const rows = (nodes ?? []) as DocumentTopicRow[];
  if (!rows.length) return [];

  const main = pickMainTopics(
    rows.map((n) => ({ ...n, parentId: n.parent_id })),
  );

  // A long book can have more than PostgREST's default 1,000 topic/page
  // links. The active chapter may be beyond that first response.
  const links: { topic_id: string; page_number: number }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await service
      .from("document_topic_page_links")
      .select("topic_id, page_number")
      .eq("document_id", documentId)
      .in("topic_id", main.map((n) => n.id))
      .order("page_number", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new SourceUnavailableError();
    links.push(...((data ?? []) as typeof links));
    if ((data ?? []).length < 500) break;
  }

  const pagesByTopic = new Map<string, number[]>();
  for (const link of links) {
    const list = pagesByTopic.get(link.topic_id) ?? [];
    list.push(link.page_number);
    pagesByTopic.set(link.topic_id, list);
  }

  const { data: unreadPages } = await service
    .from("document_pages")
    .select("page_number")
    .eq("document_id", documentId)
    .or("page_kind.eq.unreadable,extraction_ok.eq.false");

  const unreadable = (unreadPages ?? []).map((p) => p.page_number as number);

  const byNodeId = new Map(
    prepTopics
      .filter((t) => t.document_topic_node_id)
      .map((t) => [t.document_topic_node_id as string, t.id]),
  );
  const byLabel = new Map(
    prepTopics.map((t) => [t.label.trim().toLocaleLowerCase("tr"), t.id]),
  );

  const inputs = main.map((n) => ({
    id: n.id,
    title: n.title,
    examPrepTopicId:
      byNodeId.get(n.id) ??
      byLabel.get(n.title.trim().toLocaleLowerCase("tr")) ??
      null,
    pageNumbers: [...new Set(pagesByTopic.get(n.id) ?? [])].sort((a, b) => a - b),
    commonMistakes: Array.isArray(n.common_mistakes) ? n.common_mistakes : [],
  }));

  return planDiagnosticTopics(inputs, unreadable);
}

const SKILL_HINT: Record<DiagnosticSkill, string> = {
  definition: "tanım / anahtar terim",
  concept: "kavram açıklaması",
  application: "temel uygulama",
  multi_step: "çok adımlı problem",
  misconception: "sık yapılan yanılgı",
};

export async function generateTopicMapDiagnostic(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  examType: string;
  documentId: string;
  sourceBoundaryMode: "documents_only" | "allow_supporting" | null;
  plans: DiagnosticTopicPlan[];
  /** The learner opens one lesson; other chapters remain explicitly unmeasured. */
  activePrepTopicId: string;
}): Promise<
  | { ok: true; questions: DiagnosticQuestion[]; plans: DiagnosticTopicPlan[] }
  | { ok: false; status: number; error: string }
> {
  const slots = firstLessonDiagnosticSlots(input.plans, input.activePrepTopicId);
  if (!slots.length) {
    return { ok: false, status: 400, error: "no_measurable_topics" };
  }
  const active = slots[0].topic;

  let source;
  try {
    source = await loadPageSourceContext(
      input.service,
      input.userId,
      input.documentId,
      active.pageNumbers,
      {
        sourceBoundaryMode: input.sourceBoundaryMode ?? "documents_only",
        topicLabel: active.title,
      },
    );
    if (!source.block.trim()) throw new SourceUnavailableError();
  } catch (err) {
    if (err instanceof SourceUnavailableError) {
      return { ok: false, status: 503, error: "source_unavailable" };
    }
    throw err;
  }

  // This is a content limitation, not an AI outage. No credit is reserved and
  // no invented questions are shown for a workbook that repeats one fact.
  if (source.repetitiveSparseEvidence) {
    return { ok: false, status: 422, error: "insufficient_source_variety" };
  }

  const boundaryNote =
    input.sourceBoundaryMode === "allow_supporting"
      ? "destekleyici genel bilgi sınırlı kullanılabilir"
      : "documents_only — kaynak dışı uydurma yok";

  // A bounded first-topic probe. Each other document topic stays unmeasured
  // until its own lesson instead of forcing a whole-book quiz into one call.
  const BATCH = 3;
  const rawQuestions: QuizQuestion[] = [];
  for (let start = 0; start < slots.length; start += BATCH) {
    const batch = slots.slice(start, start + BATCH);
    const blueprint = batch
      .map((s, i) => {
        const line = `${i + 1}) Konu: "${s.topic.title}" · beceri: ${SKILL_HINT[s.skill]} (${s.skill})`;
        // Belgenin kendi "yaygın hata" satırları. Bunlar olmadan model
        // çeldiricileri uyduruyordu ve "bir sayıyı yansıtmak için" gibi
        // elemesi bedava şıklar çıkıyordu.
        const mistakes = (s.topic.commonMistakes ?? []).slice(0, 3);
        if (!mistakes.length) return line;
        return `${line}\n   Belgedeki yanılgılar (çeldirici olarak kullan): ${mistakes.join(" | ")}`;
      })
      .join("\n");
    const userPrompt = `Sınav: ${input.prepTitle ?? input.examType}. Kısa TANI (başlangıç) soruları.
Ustalık iddiası yok; her satır için İKİ bağımsız kısa soru yaz (toplam 6); doğrulama sorunlu soruları eleyeceği için yedek soru gerekir.
Her sorunun topic alanına satırdaki beceri kodunu (definition, concept veya application) aynen yaz.
${blueprint}
${source.block}
Kurallar:
- Yalnızca kaynak alıntılarına dayan (${boundaryNote}).
- Kaynakta bulunmayan "sadece", "yalnızca", "her zaman" gibi kesin iddiaları doğru cevap veya gerekçe diye yazma. Yanlış seçeneği açıklarken açıkça yanlış olduğunu belirt.
- Tercihen multi false (tek doğru); en fazla bir soruda multi true.
- 4 net şık; correct options içinde; kısa Türkçe explanation.
- ÇELDİRİCİLER GERÇEK HATA OLSUN: yukarıda konuya ait yanılgı verildiyse onu
  şıklaştır; verilmediyse öğrencinin o konuda gerçekten yapacağı hatayı yaz.
  Konuyla ilgisiz uydurma şık ("bir sayıyı yansıtmak için", "sabitlemek için")
  ve "hepsi/hiçbiri" yasak — elemesi bedava olan şık seviyeyi ölçmez.
- Bilimsel/matematiksel doğruluğu kontrol et.`;

    const outcome = await generateExamQuiz({
      service: input.service,
      userId: input.userId,
      isPremium: input.isPremium,
      difficulty: "hard",
      teachingV2: true,
      maxDraftAttempts: 3,
      verifyOptionReasoning: true,
      schemaHintExtra: "Bu tanıda questions dizisi 6 soru içerir. Her sorunun topic alanı definition, concept veya application kodudur.",
      sourceExcerpt: source.block,
      requireSourceSupport: true,
      userPrompt,
    });
    // Stage 7: retries + independent-only accept live inside generateExamQuiz / generateJson
    // under one credit reservation. Do not call again (would risk double-charge).
    if (!outcome.ok) return outcome;
    if (outcome.questions.length < batch.length) {
      return { ok: false, status: 422, error: "insufficient_verified_questions" };
    }
    rawQuestions.push(...selectDiagnosticSkillQuestions(outcome.questions, batch.map((slot) => slot.skill)));
  }

  let questions = attachQuestionMeta(rawQuestions, slots);

  // Prefer model-provided skill tags when present on raw objects (best-effort).
  questions = questions.map((q, i) => {
    const rawSkill = rawQuestions[i]?.topic;
    return {
      ...q,
      skill: isDiagnosticSkill(rawSkill) ? rawSkill : slots[i].skill,
    };
  });

  return { ok: true, questions, plans: input.plans };
}

export function scoreAndNormalizeDiagnostic(
  questions: DiagnosticQuestion[],
  answers: Record<string, unknown>,
  plans: DiagnosticTopicPlan[],
) {
  return scoreDiagnosticAnswers(questions, answers, plans);
}

export function parseStoredDiagnosticQuestions(
  raw: unknown,
): DiagnosticQuestion[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: DiagnosticQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const base = normalizeQuizQuestion({
      text: String(row.text ?? ""),
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      correct: row.correct as string | string[],
      multi: Boolean(row.multi),
      explanation: typeof row.explanation === "string" ? row.explanation : undefined,
    });
    if (!base || typeof row.topicId !== "string" || !isDiagnosticSkill(row.skill)) {
      return null;
    }
    out.push({
      ...base,
      topicId: row.topicId,
      topicLabel: String(row.topicLabel ?? ""),
      examPrepTopicId:
        typeof row.examPrepTopicId === "string" ? row.examPrepTopicId : null,
      skill: row.skill,
    });
  }
  return out.length ? out : null;
}
