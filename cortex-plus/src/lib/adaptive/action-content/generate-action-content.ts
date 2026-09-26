/**
 * Generate structured ActionContent for every LearningAction.
 */

import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADAPTIVE_MODEL_ROUTER_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { generateAdaptiveJson } from "@/lib/adaptive/action-content/openai-content";
import { loadActionSourceContext } from "@/lib/adaptive/action-content/source";
import type {
  ActionContent,
  ActionQuestion,
  DifficultyLevel,
  GovernorAction,
  LearningAction,
  TeachingMode,
} from "@/lib/adaptive/types";

export type GenerateActionContentInput = {
  userId: string;
  examPrepId: string;
  sessionId: string;
  action: GovernorAction;
  topicTitle: string;
  misconception?: string | null;
  documentId?: string | null;
};

type LlmPayload = {
  title?: string;
  body_markdown?: string;
  steps?: string[];
  misconception_addressed?: string | null;
  question?: {
    prompt?: string;
    format?: string;
    choices?: string[];
    correct_answer?: string;
    accept?: string[];
    explanation?: string;
    transfer?: boolean;
  } | null;
};

function parsePayload(raw: unknown): LlmPayload | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as LlmPayload;
}

function buildQuestion(
  q: LlmPayload["question"],
  fallbackPrompt: string,
): ActionQuestion | null {
  if (!q?.prompt && !fallbackPrompt) return null;
  const format =
    q?.format === "mcq" || q?.format === "numeric" || q?.format === "short_text"
      ? q.format
      : q?.choices?.length
        ? "mcq"
        : "short_text";
  return {
    id: randomUUID(),
    prompt: String(q?.prompt ?? fallbackPrompt).slice(0, 800),
    format,
    choices: Array.isArray(q?.choices)
      ? q!.choices!.map((c) => String(c).slice(0, 200)).slice(0, 6)
      : undefined,
    correctAnswer: String(q?.correct_answer ?? "").slice(0, 400),
    accept: Array.isArray(q?.accept)
      ? q!.accept!.map((a) => String(a).slice(0, 200)).slice(0, 8)
      : undefined,
    explanation: q?.explanation ? String(q.explanation).slice(0, 600) : undefined,
    transfer: Boolean(q?.transfer),
  };
}

function kindFor(action: LearningAction): ActionContent["kind"] {
  if (action === "advance") return "advance_notice";
  if (
    action === "practice" ||
    action === "retrieval_practice" ||
    action === "mini_assessment" ||
    action === "easier_example" ||
    action === "scheduled_review"
  ) {
    return "question";
  }
  if (action === "worked_example") return "worked_example";
  return "explanation";
}

function actionBrief(
  action: LearningAction,
  mode: TeachingMode,
  difficulty: DifficultyLevel,
): string {
  switch (action) {
    case "teach":
      return `Kısa anlatım (${mode}), zorluk ${difficulty}. En fazla 4 kısa paragraf.`;
    case "worked_example":
      return "Çözümlü örnek: adım adım çözüm + aynı kavramı test eden transfer sorusu (yüzey detayları değişik).";
    case "easier_example":
      return "Daha kolay örnek soru; tek kavram, düşük bilişsel yük.";
    case "practice":
      return "Pratik soru; mevcut zorlukta, kaynakla uyumlu.";
    case "retrieval_practice":
      return "Hatırlama sorusu; ipucu yok, kısa cevap.";
    case "prerequisite_review":
      return "Yalnızca gerekli önkoşul minimum tekrarı — tüm eski bölümü yeniden anlatma.";
    case "reteach":
      return "Aynı konuyu farklı yöntemle yeniden anlat; önceki yanlış anlamayı düzelt.";
    case "mini_assessment":
      return "Kısa değerlendirme sorusu (1 soru).";
    case "advance":
      return "Konuya hazır; kısa ilerleme notu, yeni konu yok.";
    case "scheduled_review":
      return "Aralıklı tekrar sorusu.";
    default:
      return "Kısa öğrenme adımı.";
  }
}

function fallbackContent(
  input: GenerateActionContentInput,
  sourceRefs: ActionContent["sourceRefs"],
): ActionContent {
  const a = input.action;
  const needsQ =
    a.action === "practice" ||
    a.action === "retrieval_practice" ||
    a.action === "mini_assessment" ||
    a.action === "easier_example" ||
    a.action === "scheduled_review" ||
    a.action === "worked_example";

  return {
    id: randomUUID(),
    action: a.action,
    kind: kindFor(a.action),
    topicId: a.topicId,
    topicKey: a.topicKey,
    title: input.topicTitle,
    bodyMarkdown:
      a.action === "advance"
        ? `**${input.topicTitle}** için mevcut kanıt yeterli görünüyor. Bir sonraki konuya geçebilirsin.`
        : a.action === "worked_example"
          ? `**${input.topicTitle}** için çözümlü bir örnek üzerinden gideceğiz.\n\n1. Verilenleri yaz\n2. İlgili bağıntıyı seç\n3. Hesabı adım adım yap\n4. Sonucu birimle kontrol et`
          : `**${input.topicTitle}** konusunda kısa bir adım. Kaynağına dayalı temel noktaları gözden geçir, ardından devam et.`,
    steps:
      a.action === "worked_example"
        ? [
            "Verilenleri listele",
            "Doğru bağıntıyı seç",
            "Hesabı adım adım yap",
            "Sonucu kontrol et",
          ]
        : undefined,
    misconceptionAddressed: input.misconception ?? null,
    question: needsQ
      ? {
          id: randomUUID(),
          prompt: `${input.topicTitle} için kendi cümlelerinle temel fikri kısaca yaz.`,
          format: "short_text",
          correctAnswer: "",
          transfer: a.action === "worked_example",
        }
      : null,
    sourceRefs,
    model: a.model,
    escalationReasons: ["DEFAULT_MINI"],
    decisionTraceId: a.decisionTraceId,
  };
}

export async function generateActionContent(
  service: SupabaseClient,
  input: GenerateActionContentInput,
): Promise<ActionContent> {
  const { block, sourceRefs } = await loadActionSourceContext(
    service,
    input.userId,
    input.topicTitle,
    input.documentId,
  );

  const routerEnabled = await isFeatureEnabled(
    service,
    ADAPTIVE_MODEL_ROUTER_FLAG,
    input.userId,
  );

  const a = input.action;
  const needsQuestion =
    a.action !== "advance" &&
    a.action !== "teach" &&
    a.action !== "reteach" &&
    a.action !== "prerequisite_review";

  const { data: priorContent } = await service
    .from("adaptive_learning_events")
    .select("payload")
    .eq("session_id", input.sessionId)
    .eq("event_type", "action_content")
    .order("created_at", { ascending: false })
    .limit(15);
  const priorFingerprints: string[] = [];
  for (const row of priorContent ?? []) {
    const payload = (row.payload ?? {}) as {
      content?: { question?: { prompt?: string } };
    };
    const prompt = payload.content?.question?.prompt;
    if (prompt) priorFingerprints.push(questionFingerprint(prompt));
  }

  // teach/reteach/prerequisite still can end without a question; worked_example always has one
  const forceQuestion =
    needsQuestion ||
    a.action === "worked_example" ||
    a.action === "practice" ||
    a.action === "retrieval_practice" ||
    a.action === "mini_assessment" ||
    a.action === "easier_example" ||
    a.action === "scheduled_review";

  const system = [
    "Sen Cortex Plus sınav hazırlık öğretmenisin. Türkçe yanıt ver.",
    "Yalnızca JSON döndür. Anahtarlar: title, body_markdown, steps (string[]), misconception_addressed, question.",
    "question: { prompt, format: mcq|numeric|short_text, choices?, correct_answer, accept?, explanation?, transfer? }",
    "Kaynak alıntıları varsa onlara dayan; uydurma formül/sayı yazma.",
    "Metni kısa tut; ders kitabı uzunluğunda yazma.",
    "Transfer sorusu örnekle aynı sayıları kopyalamasın; kavramı yeni yüzeyle test etsin.",
    priorFingerprints.length > 0
      ? "Aynı kavramı test et ama önceki soruların yüzeysel kopyası olma: sayıları, bağlamı ve muhakeme yapısını değiştir."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const user = JSON.stringify({
    action: a.action,
    teaching_mode: a.teachingMode,
    difficulty: a.difficulty,
    topic: input.topicTitle,
    topic_key: a.topicKey,
    misconception: input.misconception ?? null,
    brief: actionBrief(a.action, a.teachingMode, a.difficulty),
    require_question: forceQuestion || a.action === "worked_example",
    worked_example_flow:
      a.action === "worked_example"
        ? "MISCONCEPTION → WORKED EXAMPLE STEPS → GUIDED EXPLANATION → TRANSFER QUESTION"
        : null,
    source_excerpts: block.slice(0, 4500),
  });

  const result = await generateAdaptiveJson({
    service,
    userId: input.userId,
    actionCode: "ADAPTIVE_ACTION_CONTENT",
    system,
    user,
    parse: parsePayload,
    routerEnabled,
    advancedReasoning:
      a.action === "worked_example" || a.difficulty === "exam_level",
    highImpactAssessment: a.action === "mini_assessment",
  });

  if (!result.ok) {
    return fallbackContent(input, sourceRefs.length ? sourceRefs : a.sourceRefs);
  }

  const data = result.data;
  let question = forceQuestion || a.action === "worked_example"
    ? buildQuestion(
        data.question,
        `${input.topicTitle}: bu kavramı yeni bir durumda kısaca uygula.`,
      )
    : data.question
      ? buildQuestion(data.question, "")
      : null;

  // Soft diversity: if fingerprint matches a recent question, nudge surface variation.
  if (
    question?.prompt &&
    isNearDuplicateQuestion(question.prompt, priorFingerprints)
  ) {
    question = {
      ...question,
      prompt: `${question.prompt} (Farklı bir bağlamda: sayıları ve örnek durumu değiştirerek yeniden düşün.)`.slice(
        0,
        800,
      ),
    };
  }

  // For teach-like actions without forced question, allow continue without Q
  const explanationOnly =
    a.action === "teach" ||
    a.action === "reteach" ||
    a.action === "prerequisite_review";

  return {
    id: randomUUID(),
    action: a.action,
    kind: kindFor(a.action),
    topicId: a.topicId,
    topicKey: a.topicKey,
    title: String(data.title ?? input.topicTitle).slice(0, 200),
    bodyMarkdown: String(
      data.body_markdown ??
        `**${input.topicTitle}** için hazırlanan kısa adım.`,
    ).slice(0, 6000),
    steps: Array.isArray(data.steps)
      ? data.steps.map((s) => String(s).slice(0, 400)).slice(0, 8)
      : undefined,
    misconceptionAddressed:
      data.misconception_addressed ?? input.misconception ?? null,
    question: explanationOnly && !question ? null : question,
    sourceRefs: sourceRefs.length ? sourceRefs : a.sourceRefs,
    model: result.model,
    escalationReasons: result.escalationReasons,
    decisionTraceId: a.decisionTraceId,
  };
}

/** Strip grading keys and internal model fields before browser. */
export function publicActionContent(content: ActionContent): Omit<
  ActionContent,
  "question" | "model" | "escalationReasons"
> & {
  question: Omit<ActionQuestion, "correctAnswer" | "accept"> | null;
} {
  const q = content.question;
  const {
    model: _model,
    escalationReasons: _esc,
    question: _q,
    ...rest
  } = content;
  return {
    ...rest,
    question: q
      ? {
          id: q.id,
          prompt: q.prompt,
          format: q.format,
          choices: q.choices,
          explanation: undefined,
          transfer: q.transfer,
        }
      : null,
  };
}

/** Normalize question text for near-duplicate detection. */
export function questionFingerprint(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[0-9]+([.,][0-9]+)?/g, "#")
    .replace(/[^a-zçğıöşü0-9#\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function isNearDuplicateQuestion(
  candidate: string,
  priorFingerprints: string[],
): boolean {
  const fp = questionFingerprint(candidate);
  if (!fp) return false;
  return priorFingerprints.some(
    (p) => p === fp || (p.length > 20 && fp.includes(p.slice(0, 40))),
  );
}
