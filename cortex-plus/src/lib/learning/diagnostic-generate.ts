import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachQuestionMeta,
  buildDiagnosticSkillPlan,
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
  loadSourceContext,
  SourceUnavailableError,
} from "@/lib/learning/source-context";

export type DocumentTopicRow = {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
};

export async function loadDocumentTopicPlans(
  service: SupabaseClient,
  documentId: string,
  prepTopics: { id: string; label: string; document_topic_node_id?: string | null }[],
): Promise<DiagnosticTopicPlan[]> {
  const { data: nodes } = await service
    .from("document_topic_nodes")
    .select("id, title, parent_id, sort_order")
    .eq("document_id", documentId)
    .order("sort_order");

  const rows = (nodes ?? []) as DocumentTopicRow[];
  if (!rows.length) return [];

  const main = pickMainTopics(
    rows.map((n) => ({ ...n, parentId: n.parent_id })),
  );

  const { data: links } = await service
    .from("document_topic_page_links")
    .select("topic_id, page_number")
    .eq("document_id", documentId)
    .in(
      "topic_id",
      main.map((n) => n.id),
    );

  const pagesByTopic = new Map<string, number[]>();
  for (const link of links ?? []) {
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
}): Promise<
  | { ok: true; questions: DiagnosticQuestion[]; plans: DiagnosticTopicPlan[] }
  | { ok: false; status: number; error: string }
> {
  const slots = buildDiagnosticSkillPlan(input.plans);
  if (!slots.length) {
    return { ok: false, status: 400, error: "no_measurable_topics" };
  }

  const query = slots.map((s) => s.topic.title).join(" ");
  let source;
  try {
    source = await loadSourceContext(input.service, input.userId, query, {
      documentId: input.documentId,
      limit: Math.min(8, Math.max(4, slots.length)),
      sourceBoundaryMode: input.sourceBoundaryMode ?? "documents_only",
    });
  } catch (err) {
    if (err instanceof SourceUnavailableError) {
      return { ok: false, status: 503, error: "source_unavailable" };
    }
    throw err;
  }

  const boundaryNote =
    input.sourceBoundaryMode === "allow_supporting"
      ? "destekleyici genel bilgi sınırlı kullanılabilir"
      : "documents_only — kaynak dışı uydurma yok";

  // Smaller batches pass educational verification more reliably than one long multi-topic quiz.
  const BATCH = 4;
  const rawQuestions: QuizQuestion[] = [];
  for (let start = 0; start < slots.length; start += BATCH) {
    const batch = slots.slice(start, start + BATCH);
    const blueprint = batch
      .map(
        (s, i) =>
          `${i + 1}) Konu: "${s.topic.title}" · beceri: ${SKILL_HINT[s.skill]} (${s.skill})`,
      )
      .join("\n");
    const userPrompt = `Sınav: ${input.prepTitle ?? input.examType}. Kısa TANİ (başlangıç) soruları.
Ustalık iddiası yok; her satır için TAM BİR basit soru yaz; sıra bozulmasın.
${blueprint}
${source.block}
Kurallar:
- Yalnızca kaynak alıntılarına dayan (${boundaryNote}).
- Tercihen multi false (tek doğru); en fazla bir soruda multi true.
- 4 net şık; correct options içinde; kısa Türkçe explanation.
- Bilimsel/matematiksel doğruluğu kontrol et.`;

    let outcome = await generateExamQuiz({
      service: input.service,
      userId: input.userId,
      isPremium: input.isPremium,
      userPrompt,
    });
    if (!outcome.ok && outcome.error === "content_verification_failed") {
      outcome = await generateExamQuiz({
        service: input.service,
        userId: input.userId,
        isPremium: input.isPremium,
        userPrompt: `${userPrompt}
Önceki taslak reddedildi. Daha kısa, tek doğru şıklı, belgedeki açık cümlelere dayalı sorular yaz.`,
      });
    }
    if (!outcome.ok) return outcome;
    rawQuestions.push(...outcome.questions.slice(0, batch.length));
  }

  let questions = attachQuestionMeta(rawQuestions, slots);

  // If model returned fewer questions, still keep meta alignment for what we have.
  if (questions.length < slots.length) {
    questions = questions.slice(0, questions.length);
  }

  // Prefer model-provided skill tags when present on raw objects (best-effort).
  questions = questions.map((q, i) => {
    const rawSkill = (rawQuestions[i] as QuizQuestion & { skill?: unknown })?.skill;
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
