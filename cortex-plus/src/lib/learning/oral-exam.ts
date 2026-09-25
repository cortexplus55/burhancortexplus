import { z } from "zod";
import {
  quantityClaimGrounded,
  sourceContainsNumber,
  unsupportedQuantities,
} from "@/lib/learning/teacher-brain";
import type { OralReviewItem, OralTeacherMoodId } from "@/lib/learning/oral-exam-chrome";
import {
  auditQuantitative,
  gradeStudentClaim,
  repairQuantitative,
} from "@/lib/learning/tutor-quant";
import {
  isScoreLabel,
  polishLearnerText,
  verifyOralPrompt,
} from "@/lib/learning/question-verifier";

/**
 * Sözlü denemenin notu, takip sorusu ve kaynak bağı.
 * Model çağrısı yok: puan, öğrencinin cümlesi ile sorunun beklenen
 * noktaları ve yüklenen kaynak karşılaştırılarak çıkar.
 */

export const ORAL_LENGTH_OPTIONS = [
  { questions: 3, minutes: 7 },
  { questions: 5, minutes: 12 },
  { questions: 8, minutes: 18 },
] as const;

export type OralLength = (typeof ORAL_LENGTH_OPTIONS)[number]["questions"];

export const ORAL_ALL_TOPICS = "tum-sinav";

export type OralProbeKind = "why" | "unit" | "detail";

export type OralQuestionDraft = {
  prompt?: string;
  hint?: string;
  learningObjective?: string;
  expectedPoints?: string[];
  rubricCriteria?: string[];
  sourceFile?: string | null;
  sourcePage?: string | null;
  probeKind?: OralProbeKind;
};

export type OralCitation = {
  file: string | null;
  pages: number[];
};

/** Korpus pasajı. Sunucu `loadPrepChatGrounding` ile doldurur. */
export type OralGroundingPassage = {
  documentName: string;
  pageNumber: number | null;
  slide?: boolean;
  content: string;
};

export type OralVerdict = "dogru" | "kismen" | "yanlis" | "bos";

export type OralItemGrade = {
  index: number;
  question: string;
  answer: string;
  /** 0 ile 1 arası. Doğru sayısal cevap 1'dir. */
  ratio: number;
  verdict: OralVerdict;
  /** Öğrencinin tutan kısmı. Boş kalabilir. */
  right: string;
  /** Eksik ya da yanlış olanın kısa gerekçesi. Puan etiketi değildir. */
  gap: string;
  missing: string[];
  modelAnswer: string;
  citation: string | null;
  dontKnow: boolean;
  numericIssue: string | null;
  objective: string;
};

export type OralExamReport = {
  /** Tam karşılanan soru sayısı. Kayıt bununla tutulur. */
  fullCount: number;
  total: number;
  /** Kısmi puan dahil genel yüzde. */
  pct: number;
  items: OralItemGrade[];
  strengths: string[];
  weaknesses: string[];
  missingObjectives: string[];
  correctIndices: number[];
  nextStep: { label: string; href: string } | null;
};

const UNIT_RE =
  /(?:^|[\s(])(\d+(?:[.,]\d+)?)\s*(mol|kg|mg|g|ml|l|cm|mm|km|m|sn|dk|s|kpa|mpa|pa|atm|bar|kj|kcal|j|°c|c)\b/i;

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOralLength(value: number): value is OralLength {
  return value === 3 || value === 5 || value === 8;
}

export function minutesForOralLength(questions: number): number {
  return ORAL_LENGTH_OPTIONS.find((option) => option.questions === questions)?.minutes ?? 7;
}

export function isDontKnow(answer: string): boolean {
  const text = fold(answer);
  if (!text) return true;
  return /^(bilmiyorum|bilmem|fikrim yok|hatirlamiyorum|emin degilim|bos birak|pas|pass|i don't know|i dont know|idk)\b/.test(
    text,
  );
}

export function dontKnowNote(): string {
  return "Tamam. Bilmediğini kaydettim; bu soru eksik sayılacak. Sonraki soruya geçebilirsin.";
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((raw) => raw.replace(",", "."));
}

function hasUnit(text: string): boolean {
  return UNIT_RE.test(` ${text}`);
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9%]+/)
    .filter((token) => token.length >= 4);
}

/** Beklenen noktanın anlamlı sözcükleri cevapta var mı. */
export function answerCoversPoint(answer: string, point: string): boolean {
  const needed = tokens(point);
  const hay = fold(answer);
  const pointNumbers = numbersIn(point);
  if (pointNumbers.length && !pointNumbers.every((num) => numbersIn(answer).includes(num))) {
    return false;
  }
  if (hasUnit(point) && pointNumbers.length && !hasUnit(answer)) return false;
  if (!needed.length) return fold(point).length > 0 && hay.includes(fold(point));
  const hit = needed.filter((token) => hay.includes(token)).length;
  return hit / needed.length >= 0.6;
}

export function probeKindForPoints(points: string[]): OralProbeKind {
  const text = points.join(" ");
  if (UNIT_RE.test(` ${text}`) || (/\d/.test(text) && /mol|birim|kg|gram|litre/i.test(text))) {
    return "unit";
  }
  if (/neden|çünkü|cunku|sebep|gerek/i.test(text)) return "why";
  return "detail";
}

export function citationLabel(
  file: string | null | undefined,
  page: string | null | undefined,
): string | null {
  const name = file?.trim() ?? "";
  const where = page?.trim() ?? "";
  if (name && where) return `${name} · ${where}`;
  if (name) return name;
  if (where) return where;
  return null;
}

function passageWhere(passage: OralGroundingPassage): string | null {
  if (!passage.pageNumber || passage.pageNumber < 1) return null;
  return passage.slide ? `slayt ${passage.pageNumber}` : `s.${passage.pageNumber}`;
}

/**
 * Kaynak, soruyla örtüşen pasajdır. Her soruya yapıştırılmış ilk sayfa
 * damgası, pasaj örtüşmezse gösterilmez.
 */
export function citationFromPassages(
  question: OralQuestionDraft,
  passages: OralGroundingPassage[],
): string | null {
  const needles = tokens(`${question.prompt ?? ""} ${(question.expectedPoints ?? []).join(" ")}`).filter(
    (token) => !isScoreLabel(token),
  );
  if (passages.length && needles.length) {
    let best: OralGroundingPassage | null = null;
    let bestScore = 0;
    for (const passage of passages) {
      const hay = fold(passage.content);
      const score = needles.filter((token) => hay.includes(token)).length;
      if (score > bestScore) {
        best = passage;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) return citationLabel(best.documentName, passageWhere(best));
    return null;
  }
  return citationLabel(question.sourceFile, question.sourcePage);
}

/**
 * Model cümlesindeki sayıyı kaynağa karşı düzeltir.
 * Düzeltme kaynakta olmayan nicelik taşıyorsa cümle olduğu gibi kalır.
 * Ayrıştırılamayan örnek için ikinci model çağrısı yok.
 */
function repairModelAnswer(text: string, source: string): string {
  const audit = auditQuantitative(text, source);
  if (audit.ok || !audit.issues.length) return text;
  const repaired = repairQuantitative(text, audit).trim();
  if (!repaired) return text;
  if (source.trim() && unsupportedQuantities(repaired, source).length) return text;
  return repaired;
}

export function stampOralQuestions<T extends OralQuestionDraft>(
  questions: T[],
  citation: OralCitation | null | undefined,
): (T & { probeKind: OralProbeKind; sourceFile: string | null; sourcePage: string | null })[] {
  const pages = (citation?.pages ?? [])
    .filter((page) => Number.isInteger(page) && page > 0)
    .slice(0, 6);
  const sourcePage = pages.length ? `s.${pages.join(",")}` : null;
  const sourceFile = citation?.file?.trim() || null;
  return questions.map((question) => ({
    ...question,
    probeKind: probeKindForPoints(question.expectedPoints ?? []),
    sourceFile,
    sourcePage,
  }));
}

/**
 * Müfredat ağırlığı. Çekirdek önce sorulur; az önemli konu listeden
 * çıkmaz. Başlıklar öğrencinin konularıdır, koda gömülü ders adı yok.
 */
export function syllabusWeightLine(
  topics: { title: string; emphasis: "core" | "support" | "skim" }[],
): string {
  const rank = { core: 0, support: 1, skim: 2 } as const;
  const seen = new Map<string, "core" | "support" | "skim">();
  for (const topic of topics) {
    const title = topic.title.trim();
    if (!title) continue;
    const have = seen.get(title);
    if (!have || rank[topic.emphasis] < rank[have]) seen.set(title, topic.emphasis);
  }
  if (!seen.size) {
    return "Yalnızca verilen kaynak sayfalarındaki olguları sor. Kaynakta olmayan konu yazma.";
  }
  const lines = [...seen.entries()]
    .sort((a, b) => rank[a[1]] - rank[b[1]] || a[0].localeCompare(b[0], "tr"))
    .map(([title, emphasis]) => `${title} (${emphasis})`);
  return `Soru ağırlığı şu sırayla, çekirdek daha çok: ${lines.join("; ")}. Az önemli konuyu eleme, daha az sor. Bu listede olmayan konu sorma.`;
}

export function syllabusWeightLineFromChecklist(
  items: { topicTitle: string; priority: "important" | "medium" | "less" }[],
): string {
  const emphasis = {
    important: "core",
    medium: "support",
    less: "skim",
  } as const;
  return syllabusWeightLine(
    items
      .filter((item) => item.topicTitle.trim())
      .map((item) => ({ title: item.topicTitle, emphasis: emphasis[item.priority] })),
  );
}

/**
 * Tek takip. İpucu yalnızca yardımcı kişide ve soruda hazır ipucu varsa.
 * Yeni olgu üretilmez.
 */
/** Yardımcı öğretmenin bir kez soracağı eksik cevap. Tam hesap probe açmaz. */
export function answerLooksIncomplete(question: string, answer: string): boolean {
  const foldedAnswer = fold(answer);
  const foldedQuestion = fold(question);
  if (
    /\b(hesaplamadim|hesaplayamadim|emin degilim|tam bilmiyorum|oranini ayrica|adimi atladim|eksik biraktim)\b/.test(
      foldedAnswer,
    )
  ) {
    return true;
  }
  const asksQuantity = /(kac|hesapla|calculate|how many|how much)/.test(foldedQuestion);
  if (asksQuantity && numbersIn(answer).length === 0) return true;
  const asksReason = /(neden|nicin|why|hangi|hangisi|acikla)/.test(foldedQuestion);
  const hasReason = /(cunku|dolayi|icin|nedeni|oran|bolun|katsay)/.test(foldedAnswer);
  if (asksReason && !hasReason && answer.trim().length < 160) return true;
  return false;
}

export function visibleProbe(input: {
  answer: string;
  probeKind: OralProbeKind;
  persona: OralTeacherMoodId;
  alreadyProbed: boolean;
  hint?: string | null;
  question?: string | null;
}): { question: string; hint: string | null } | null {
  if (input.alreadyProbed) return null;
  const answer = input.answer.trim();
  if (!answer || isDontKnow(answer)) return null;
  const thin = answer.length < 80;
  let question: string | null = null;
  if (input.probeKind === "unit" && numbersIn(answer).length > 0 && !hasUnit(answer)) {
    question = "Birimi ne?";
  } else if (input.probeKind === "why" && thin) {
    question = "Neden?";
  } else if (input.probeKind === "detail" && answer.length < 40 && !/=/.test(answer)) {
    question = "Biraz açar mısın?";
  } else if (thin && numbersIn(answer).length > 0 && !hasUnit(answer)) {
    question = "Birimi ne?";
  } else if (
    input.persona === "helpful" &&
    answerLooksIncomplete(input.question ?? "", answer)
  ) {
    question = numbersIn(answer).length > 0 && !hasUnit(answer) ? "Birimi ne?" : "Eksik kalan adımı da yazar mısın?";
  }
  if (!question) return null;
  const hint =
    input.persona === "helpful" ? input.hint?.trim() || null : null;
  return { question, hint };
}

function supportedPoint(point: string, source: string): string | null {
  const text = point.trim();
  if (!text) return null;
  if (source.trim() && unsupportedQuantities(text, source).length) return null;
  return text;
}

/** Önce kaynağa uyan cümle. Uymuyorsa sayı denetimi düzeltir; o da uymuyorsa düşer. */
function groundedPoint(point: string, source: string): string | null {
  const direct = supportedPoint(point, source);
  if (direct) {
    const repaired = repairModelAnswer(direct, source);
    return supportedPoint(repaired, source) ?? direct;
  }
  const repaired = repairModelAnswer(point, source);
  if (!repaired || repaired === point.trim()) return null;
  return supportedPoint(repaired, source);
}

function asksQuantity(prompt: string): boolean {
  return /(kac|hesapla|calculate|how many|how much)/.test(fold(prompt));
}

export function gradeOralAnswer(
  question: OralQuestionDraft,
  answerRaw: string,
  source: string,
  index: number,
  passages: OralGroundingPassage[] = [],
): OralItemGrade {
  const answer = answerRaw.trim();
  const prompt = polishLearnerText(question.prompt?.trim() || `Soru ${index + 1}`);
  const points = (question.expectedPoints ?? [])
    .map((point) => point.trim())
    .filter((point) => point.length >= 2 && !isScoreLabel(point));
  const ground = [source, prompt, ...points].filter(Boolean).join("\n");
  const dontKnow = isDontKnow(answer);
  const studentAudit = !dontKnow && answer ? auditQuantitative(answer, source) : null;
  const sound = Boolean(studentAudit?.checked && studentAudit.ok);
  const claim = !dontKnow && answer ? gradeStudentClaim({ student: answer, context: ground }) : null;
  const numeric = !dontKnow && answer && !sound ? unsupportedQuantities(answer, ground) : [];
  const covered = dontKnow ? [] : points.filter((point) => answerCoversPoint(answer, point));
  const missed = dontKnow ? points : points.filter((point) => !covered.includes(point));
  let ratio = !points.length || dontKnow ? 0 : covered.length / points.length;
  if (claim?.verdict === "yanlis") ratio = 0;
  else if (claim?.verdict === "kismen") ratio = Math.min(Math.max(ratio, 0.5), 0.5);
  else if (claim?.verdict === "dogru" || (sound && (asksQuantity(prompt) || points.length === 0))) ratio = 1;
  else {
    if (studentAudit && !studentAudit.ok) ratio = Math.min(ratio, 0.5);
    if (numeric.length) ratio = Math.min(ratio, 0.5);
  }
  const modelPoints = points
    .map((point) => groundedPoint(point, source))
    .filter((point): point is string => typeof point === "string" && !isScoreLabel(point));
  let modelAnswer = modelPoints.length
    ? modelPoints.join(" ")
    : "Kaynakta bu soru için doğrulanmış bir çözüm cümlesi yok.";
  if (claim && claim.verdict !== "dogru" && claim.conclusion.trim()) {
    const conclusion = claim.conclusion.trim();
    const backed = !source.trim() || unsupportedQuantities(conclusion, source).length === 0;
    if (backed && !fold(modelAnswer).includes(fold(conclusion).slice(0, 48))) {
      modelAnswer = modelAnswer.startsWith("Kaynakta") ? conclusion : `${modelAnswer} ${conclusion}`;
    }
  } else if (ratio >= 0.99 && !modelPoints.length) {
    modelAnswer = claim?.conclusion?.trim() || answer.slice(0, 240);
  }
  if (isScoreLabel(modelAnswer)) {
    modelAnswer = claim?.conclusion?.trim() || "Kaynakta bu soru için doğrulanmış bir çözüm cümlesi yok.";
  }
  const quantNotes = [
    ...numeric,
    ...(sound ? [] : studentAudit?.issues.map((issue) => issue.detail) ?? []),
    ...(claim && claim.verdict !== "dogru" ? claim.wrongParts : []),
  ];
  const gap = ratio >= 0.99
    ? ""
    : (claim?.wrongParts.find((part) => !isScoreLabel(part)) ||
      numeric.find((part) => !isScoreLabel(part)) ||
      missed.find((part) => !isScoreLabel(part)) ||
      "");
  const right = ratio >= 0.99
    ? (claim?.rightParts[0] || covered[0] || answer.slice(0, 180))
    : (claim?.rightParts[0] || covered[0] || "");
  const verdict: OralVerdict = dontKnow || !answer
    ? "bos"
    : ratio >= 0.99
      ? "dogru"
      : ratio >= 0.5
        ? "kismen"
        : "yanlis";
  const objective = question.learningObjective?.trim() || prompt;
  return {
    index,
    question: prompt,
    answer,
    ratio,
    verdict,
    right: isScoreLabel(right) ? "" : right,
    gap: isScoreLabel(gap) ? "" : gap,
    missing: missed.filter((point) => !isScoreLabel(point)),
    modelAnswer,
    citation: citationFromPassages({ ...question, prompt, expectedPoints: points }, passages),
    dontKnow,
    numericIssue: quantNotes.length ? [...new Set(quantNotes)].join(", ") : null,
    objective,
  };
}

export function gradeOralExam(
  questions: OralQuestionDraft[],
  answers: Record<string, unknown>,
  source = "",
  passages: OralGroundingPassage[] = [],
): OralExamReport {
  const items = questions.map((question, index) =>
    gradeOralAnswer(
      question,
      String(answers[String(index)] ?? ""),
      source,
      index,
      passages,
    ),
  );
  const total = items.length || 1;
  const fullCount = items.filter((item) => item.ratio >= 0.99).length;
  const pct = items.length
    ? Math.round((items.reduce((sum, item) => sum + item.ratio, 0) / items.length) * 100)
    : 0;
  const strengths = items
    .filter((item) => item.ratio >= 0.8)
    .map((item) => item.objective)
    .slice(0, 4);
  const weaknesses = items
    .filter((item) => item.ratio < 0.5)
    .map((item) => item.objective)
    .slice(0, 4);
  return {
    fullCount,
    total,
    pct,
    items,
    strengths,
    weaknesses,
    missingObjectives: [
      ...new Set(
        items.flatMap((item) =>
          item.missing.filter((point) => !isScoreLabel(point)).map((point) => point.slice(0, 180)),
        ),
      ),
    ].slice(0, 8),
    correctIndices: items.filter((item) => item.ratio >= 0.99).map((item) => item.index),
    nextStep: null,
  };
}

export type OralMisconceptionDraft = {
  claim: string;
  corrected: string | null;
  wrongType: string;
  questionPreview: string;
};

const UNVERIFIED_ANSWER = /doğrulanamadı|doğrulanmış bir çözüm cümlesi yok/i;

/** Yalnızca gerçekten kaçırılan cevap. Doğru not ve puan etiketi kuyruğa girmez. */
export function oralMisconceptionDrafts(report: OralExamReport): OralMisconceptionDraft[] {
  return report.items
    .filter((item) => item.ratio < 0.99 && item.verdict !== "dogru")
    .filter((item) => !isScoreLabel(item.modelAnswer) && !UNVERIFIED_ANSWER.test(item.modelAnswer))
    .map((item) => ({
      claim: item.dontKnow ? "Bilmiyorum" : item.answer.slice(0, 240) || "(boş)",
      corrected: item.modelAnswer,
      wrongType: item.dontKnow ? "oral_blank" : item.numericIssue ? "oral_quantity" : "oral_miss",
      questionPreview: item.question.slice(0, 160),
    }));
}

export const ORAL_REVIEW_FALLBACK = "Bu cevap için ayrıntılı inceleme kurulamadı.";

const oralReviewSchema = z.object({
  verdict: z.enum(["dogru", "kismen", "yanlis", "bos"]),
  score: z.number().min(0).max(1),
  modelAnswer: z.string().min(8).max(500),
  gap: z.string().max(400),
  right: z.string().max(400),
});

/** Çözüm metninin her parçası puan etiketiyse kart çizilmez. */
export function reviewLooksGarbled(solution: string, missing = ""): boolean {
  const bits = `${solution}\n${missing}`
    .split(/Hatanız şuradaydı:|Eksik:|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return bits.length > 0 && bits.every((part) => isScoreLabel(part));
}

export function presentOralReview(item: OralReviewItem): OralReviewItem {
  if (!reviewLooksGarbled(item.solution, item.missing ?? "")) return item;
  return {
    ...item,
    solution: ORAL_REVIEW_FALLBACK,
    missing: undefined,
    citation: null,
    scoreLabel: item.scoreLabel && isScoreLabel(item.scoreLabel) ? undefined : item.scoreLabel,
  };
}

/** Şema tutmazsa veya metin puan etiketiyse öğrenciye o kart çizilmez. */
export function oralReviewItemFromGrade(item: OralItemGrade): OralReviewItem {
  const model = isScoreLabel(item.modelAnswer) ? "" : item.modelAnswer.trim();
  const gap = item.gap && !isScoreLabel(item.gap) ? item.gap.trim() : "";
  const right = item.right && !isScoreLabel(item.right) ? item.right.trim() : "";
  const parsed = oralReviewSchema.safeParse({
    verdict: item.verdict,
    score: item.ratio,
    modelAnswer: model.slice(0, 500),
    gap: gap.slice(0, 400),
    right: right.slice(0, 400),
  });
  const scoreLabel = `%${Math.round(item.ratio * 100)} puan`;
  if (!parsed.success || reviewLooksGarbled(model, gap)) {
    return {
      question: item.question,
      answer: item.answer,
      solution: ORAL_REVIEW_FALLBACK,
      scoreLabel,
      citation: null,
      verdict: item.verdict,
    };
  }
  const solution = [right && right !== model ? right : "", model, gap ? `Hatanız şuradaydı: ${gap}` : ""]
    .filter(Boolean)
    .join(" ");
  return presentOralReview({
    question: item.question,
    answer: item.answer,
    solution,
    scoreLabel,
    citation: item.citation,
    missing: gap || undefined,
    verdict: item.verdict,
  });
}

function pointText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const BINARY_EQUATION =
  /(?<![\d.,\w])([−-]?\d+(?:[.,]\d+)?)\s*([+\-−×x*÷/])\s*([−-]?\d+(?:[.,]\d+)?)\s*=\s*([−-]?\d+(?:[.,]\d+)?)(?![\d.,/])/g;

function keepOralPoint(point: string, source: string): boolean {
  if (point.length < 2) return false;
  if (!source.trim()) return true;
  if (unsupportedQuantities(point, source).length && !quantityClaimGrounded(point, source)) {
    return false;
  }
  const residue = point.replace(BINARY_EQUATION, " ");
  for (const raw of residue.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const value = Number(raw.replace("−", "-").replace(",", "."));
    if (!Number.isFinite(value) || value < 3) continue;
    if (!sourceContainsNumber(source, raw)) return false;
  }
  return true;
}

/**
 * Reddedilen sözlü taslağı bir kez yerinde düzeltir.
 * Eksik rubrik ve beklenen nokta sorunun kendisinden kurulur.
 * Kaynakta durmayan sayı düşer; doğru işlemin sonucu kalır.
 * İstenen sayı kurulamazsa null döner ve üretim bir kez daha denenir.
 */
export function publishOralQuestions(
  raw: unknown,
  asked: number,
  source = "",
): {
  prompt: string;
  hint?: string;
  learningObjective?: string;
  rubricCriteria: string[];
  expectedPoints: string[];
}[] | null {
  const row = raw && typeof raw === "object" ? (raw as { questions?: unknown }) : null;
  const list = Array.isArray(row?.questions) ? row.questions : null;
  if (!list) return null;
  const questions = list.flatMap((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const prompt = pointText(record?.prompt);
    if (prompt.length < 8) return [];
    if (source.trim() && !keepOralPoint(prompt, source) && unsupportedQuantities(prompt, source).length) {
      return [];
    }
    const given = (Array.isArray(record?.expectedPoints) ? record.expectedPoints : [])
      .map(pointText)
      .filter((point) => !isScoreLabel(point) && keepOralPoint(point, source));
    const bare = prompt.replace(/\d+(?:[.,]\d+)?/g, " ").replace(/\s+/g, " ").trim();
    const points = (given.length ? given : bare.length >= 8 ? [bare.slice(0, 180)] : []).slice(0, 6);
    if (!points.length) return [];
    const verified = verifyOralPrompt(prompt, points, source);
    if (!verified) return [];
    const givenRubric = (Array.isArray(record?.rubricCriteria) ? record.rubricCriteria : [])
      .map(pointText)
      .filter((line) => line.length >= 2 && !isScoreLabel(line) && keepOralPoint(line, source));
    const rubric = (
      givenRubric.length ? givenRubric : verified.expectedPoints.map((point) => point.slice(0, 120))
    ).slice(0, 5);
    const objective = pointText(record?.learningObjective);
    const hint = pointText(record?.hint);
    return [
      {
        prompt: verified.prompt,
        ...(hint ? { hint } : {}),
        ...(objective.length >= 8 ? { learningObjective: objective.slice(0, 200) } : {}),
        rubricCriteria: rubric.length ? rubric : [verified.prompt.slice(0, 120)],
        expectedPoints: verified.expectedPoints,
      },
    ];
  });
  return fitOralCount(questions, asked);
}

export function fitOralCount<T>(questions: T[], count: number): T[] | null {
  if (!isOralLength(count)) return questions.length >= 3 ? questions.slice(0, Math.min(questions.length, 8)) : null;
  if (questions.length < count) return null;
  return questions.slice(0, count);
}
