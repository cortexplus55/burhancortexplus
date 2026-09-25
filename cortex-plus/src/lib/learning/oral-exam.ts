import { unsupportedQuantities } from "@/lib/learning/teacher-brain";
import type { OralTeacherMoodId } from "@/lib/learning/oral-exam-chrome";

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

export type OralItemGrade = {
  index: number;
  question: string;
  answer: string;
  /** 0 ile 1 arası. Beklenen noktaların kaçının karşılandığı. */
  ratio: number;
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
export function visibleProbe(input: {
  answer: string;
  probeKind: OralProbeKind;
  persona: OralTeacherMoodId;
  alreadyProbed: boolean;
  hint?: string | null;
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
  } else if (input.probeKind === "detail" && answer.length < 40) {
    question = "Biraz açar mısın?";
  } else if (thin && numbersIn(answer).length > 0 && !hasUnit(answer)) {
    question = "Birimi ne?";
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

export function gradeOralAnswer(
  question: OralQuestionDraft,
  answerRaw: string,
  source: string,
  index: number,
): OralItemGrade {
  const answer = answerRaw.trim();
  const prompt = question.prompt?.trim() || `Soru ${index + 1}`;
  const points = (question.expectedPoints ?? []).map((point) => point.trim()).filter(Boolean);
  const ground = [source, prompt, ...points].filter(Boolean).join("\n");
  const dontKnow = isDontKnow(answer);
  const numeric = !dontKnow && answer ? unsupportedQuantities(answer, ground) : [];
  const covered = dontKnow ? [] : points.filter((point) => answerCoversPoint(answer, point));
  const missing = dontKnow ? points : points.filter((point) => !covered.includes(point));
  const ratio = !points.length || dontKnow ? 0 : covered.length / points.length;
  const modelPoints = points
    .map((point) => supportedPoint(point, source))
    .filter((point): point is string => Boolean(point));
  const modelAnswer = modelPoints.length
    ? modelPoints.join(" ")
    : "Kaynakta bu soru için doğrulanmış bir çözüm cümlesi yok.";
  const objective = question.learningObjective?.trim() || prompt;
  return {
    index,
    question: prompt,
    answer,
    ratio: numeric.length ? Math.min(ratio, 0.5) : ratio,
    missing,
    modelAnswer,
    citation: citationLabel(question.sourceFile, question.sourcePage),
    dontKnow,
    numericIssue: numeric.length ? numeric.join(", ") : null,
    objective,
  };
}

export function gradeOralExam(
  questions: OralQuestionDraft[],
  answers: Record<string, unknown>,
  source = "",
): OralExamReport {
  const items = questions.map((question, index) =>
    gradeOralAnswer(question, String(answers[String(index)] ?? ""), source, index),
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
      ...new Set(items.flatMap((item) => item.missing.map((point) => point.slice(0, 180)))),
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

/** Eksik veya yanlış sözlü cevap, tekrar kuyruğuna gidecek taslak. */
export function oralMisconceptionDrafts(report: OralExamReport): OralMisconceptionDraft[] {
  return report.items
    .filter((item) => item.ratio < 0.99)
    .map((item) => ({
      claim: item.dontKnow ? "Bilmiyorum" : item.answer.slice(0, 240) || "(boş)",
      corrected: item.modelAnswer,
      wrongType: item.dontKnow ? "oral_blank" : item.numericIssue ? "oral_quantity" : "oral_miss",
      questionPreview: item.question.slice(0, 160),
    }));
}

export function fitOralCount<T>(questions: T[], count: number): T[] | null {
  if (!isOralLength(count)) return questions.length >= 3 ? questions.slice(0, Math.min(questions.length, 8)) : null;
  if (questions.length < count) return null;
  return questions.slice(0, count);
}
