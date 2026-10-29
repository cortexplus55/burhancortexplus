import { z } from "zod";
import {
  unsupportedQuantities,
} from "@/lib/learning/teacher-brain";
import type { OralReviewItem, OralTeacherMoodId } from "@/lib/learning/oral-exam-chrome";
import {
  parseExaminerVibe,
  vibeGivesHints,
  type ExaminerVibe,
} from "@/lib/learning/examiner-vibe";
import {
  fluencyIssues,
  repairTurkishSurface,
} from "@/lib/learning/learner-fluency";
import {
  auditQuantitative,
  gradeStudentClaim,
  repairQuantitative,
} from "@/lib/learning/tutor-quant";
import { announcedExampleGap, exampleIsComplete } from "@/lib/learning/example-completeness";
import { speechNear } from "@/lib/learning/speech-tolerance";
import {
  isScoreLabel,
  polishLearnerText,
} from "@/lib/learning/question-verifier";
import {
  sanitizeGap,
  textOverlapsPrompt,
} from "@/lib/learning/oral-review";
import {
  firstAnswerErrorLine,
  type OralAnswerError,
} from "@/lib/learning/oral-first-answer";

export {
  firstAnswerErrorLine,
  oralFirstAnswer,
  oralFirstAnswerKey,
  oralFollowAnswer,
  oralFollowQuestion,
  oralFollowQuestionKey,
  type OralAnswerError,
} from "@/lib/learning/oral-first-answer";

/**
 * Sözlü denemenin notu, takip sorusu ve kaynak bağı.
 * Sayısal kısım kodla; anlam kısmı sınav sonunda tek model çağrısıyla.
 *
 * 29 Ekim 2026, ürün sahibinin kararı: doğruluk kararı tek hakemde. Hakem varsa oran yalnız
 * onun nokta kararlarından çıkar; kod hiçbir koşulda düşürmez (eski ilk-cevap tavanı, yarım örnek
 * tavanı ve yedek yoldaki sayı tavanları kalktı). Yükseltmeler (örnek çözümle örtüşme) ve
 * hakemin alıntısının cevapta bulunması şartı (kanıt şartı, puan kuralı değil) duruyor.
 */

/**
 * Hakem istemi kuralı — yol düğümü ve Araçlar stüdyosu aynı metni okur (yazar ve denetçiye aynı
 * kural ilkesi). Soru bloğu dışındaki metin (kaynak özeti, başka sorunun cümlesi) "doğrusu" olamaz.
 */
export const ORAL_JUDGE_RULES =
  "Her soruyu yalnız kendi bloğuyla değerlendir; dış metin ya da başka sorunun cümlesini doğrusu diye yazma. " +
  "Not İLK cevaba verilir: beklenen noktayı ilk cevap karşılıyorsa covered; ilk cevap beklenen noktayla DOĞRUDAN " +
  "çelişiyorsa o nokta missing kalır ve firstAnswerIssue {wrong: ilk cevaptan BİREBİR alıntı, correct: bu sorunun " +
  "beklenen cevabından} yazılır; takipte düzeltme noktayı geri kazandırmaz. Çelişki yoksa firstAnswerIssue yok.";

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
  /** Kaynaktan doğrulanmış örnek çözüm (2–5 cümle). */
  modelAnswer?: string;
  rubricCriteria?: string[];
  sourceFile?: string | null;
  sourcePage?: string | null;
  probeKind?: OralProbeKind;
};

/** Anlam çağrısının nokta kararı. Alıntı cevapta yoksa geçersiz sayılır. */
export type OralPointCoverage = {
  point: string;
  status: "covered" | "partial" | "missing";
  quote: string;
};

export type OralSemanticItem = {
  index: number;
  points: OralPointCoverage[];
  /** Hakemin ilk cevap notu: beklenen noktayla doğrudan çelişen ilk cevap. Çelişki yoksa yok. */
  firstAnswerIssue?: OralAnswerError | null;
};

export const APPROX_ORAL_GRADE_NOTE =
  "Bu soru otomatik değerlendirildi; puan yaklaşık.";

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
  /** Model başarısız olup kelime örtüşmesi yedeği kullanıldıysa true. */
  approximate?: boolean;
  /** Hakemin ilk cevap notu, biçimlenmiş; yalnız oran 0,99'un altındayken dolu. Puanı değiştirmez. */
  firstAnswerNote?: string;
};

export type OralExamReport = {
  /** Tam karşılanan soru sayısı. Kayıt bununla tutulur. */
  fullCount: number;
  total: number;
  /** Kısmi puanların toplamı (bir ondalık). Ekrandaki "Puan X/Y" kesri ve yüzde bundan. */
  points?: number;
  /** `round(points / total * 100)`: kesirle aynı pay ve payda. */
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
  const exact = ORAL_LENGTH_OPTIONS.find((option) => option.questions === questions);
  if (exact) return exact.minutes;
  if (questions <= 0) return 7;
  return Math.max(3, Math.round((questions * 7) / 3));
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

function clipAnswerSentences(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return text.trim();
  return parts.slice(0, 2).join(" ");
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

/** Beklenen noktanın anlamlı sözcükleri cevapta var mı. Konuşma tanımasının yazımı da sayılır. */
export function answerCoversPoint(answer: string, point: string): boolean {
  if (speechNear(answer, point)) return true;
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
  const surfaced = repairTurkishSurface(text);
  const audit = auditQuantitative(surfaced, source);
  if (audit.ok || !audit.issues.length) return surfaced;
  const repaired = repairQuantitative(surfaced, audit).trim();
  if (!repaired) return surfaced;
  const mustShip = audit.issues.some((issue) => issue.kind === "arithmetic" || issue.kind === "absolute");
  if (!mustShip && source.trim() && unsupportedQuantities(repaired, source).length) return surfaced;
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
  persona: OralTeacherMoodId | ExaminerVibe;
  alreadyProbed: boolean;
  hint?: string | null;
  question?: string | null;
}): { question: string; hint: string | null } | null {
  if (input.alreadyProbed) return null;
  const answer = input.answer.trim();
  if (!answer || isDontKnow(answer)) return null;
  const vibe = parseExaminerVibe(input.persona);
  const supportive = vibeGivesHints(vibe);
  const thin = answer.length < 80;
  let question: string | null = null;
  if (input.probeKind === "unit" && numbersIn(answer).length > 0 && !hasUnit(answer)) {
    question = "Birimi ne?";
  } else if (input.probeKind === "why" && thin) {
    question = vibe === "challenger" ? "Emin misin? Neden bu sonuç?" : "Neden?";
  } else if (input.probeKind === "detail" && answer.length < 40 && !/=/.test(answer)) {
    question = vibe === "challenger" ? "Emin misin? Ya soruda şu öncül değişseydi?" : "Biraz açar mısın?";
  } else if (thin && numbersIn(answer).length > 0 && !hasUnit(answer)) {
    question = "Birimi ne?";
  } else if (supportive && answerLooksIncomplete(input.question ?? "", answer)) {
    question = numbersIn(answer).length > 0 && !hasUnit(answer) ? "Birimi ne?" : "Eksik kalan adımı da yazar mısın?";
  } else if (vibe === "challenger" && thin) {
    question = "Emin misin? Ya soruda şu öncül değişseydi?";
  }
  if (!question) return null;
  const hint = supportive ? input.hint?.trim() || null : null;
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

/** Alıntı, cevabın içinde birebir, katlanmış ya da sesçe yakın geçiyor mu? */
function quoteInAnswer(answer: string, quote: string): boolean {
  const q = quote.trim();
  if (q.length < 3) return false;
  return fold(answer).includes(fold(q)) || speechNear(answer, q);
}

/**
 * Anlam çağrısı noktalarını doğrular: alıntı cevapta yoksa missing sayılır.
 */
export function validSemanticPoints(
  answer: string,
  points: OralPointCoverage[],
): OralPointCoverage[] {
  return points.map((row) => {
    if (row.status === "missing") return row;
    if (!quoteInAnswer(answer, row.quote)) {
      return { ...row, status: "missing" as const, quote: "" };
    }
    return row;
  });
}

function ratioFromSemantic(points: OralPointCoverage[]): number {
  if (!points.length) return 0;
  const score = points.reduce((sum, row) => {
    if (row.status === "covered") return sum + 1;
    if (row.status === "partial") return sum + 0.5;
    return sum;
  }, 0);
  return score / points.length;
}

/**
 * `judgeNote`: hakemin ilk cevap notu. Yalnız oran 0,99'un altındaysa gösterilir; oranı değiştirmez
 * (hakem çelişkiyi zaten o noktayı missing bırakarak puanlar).
 */
export function gradeOralAnswer(
  question: OralQuestionDraft,
  answerRaw: string,
  source: string,
  index: number,
  passages: OralGroundingPassage[] = [],
  semantic?: OralPointCoverage[] | null,
  judgeNote?: OralAnswerError | null,
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
  const hollowGap = !dontKnow && answer ? announcedExampleGap(answer) : null;
  const hollow = Boolean(hollowGap);
  const completeWork = Boolean(answer && exampleIsComplete(answer) && studentAudit?.ok && !hollow);
  const claim = !dontKnow && answer ? gradeStudentClaim({ student: answer, context: ground }) : null;
  const numeric = !dontKnow && answer && !sound ? unsupportedQuantities(answer, ground) : [];

  let approximate = false;
  let covered: string[] = [];
  let missed: string[] = points;
  let ratio = 0;

  const numericLock =
    claim?.verdict === "dogru" || claim?.verdict === "yanlis" || claim?.verdict === "kismen"
      ? claim.verdict
      : null;

  if (dontKnow || !answer) {
    ratio = 0;
  } else if (semantic && semantic.length) {
    const valid = validSemanticPoints(answer, semantic);
    ratio = ratioFromSemantic(valid);
    covered = valid.filter((row) => row.status === "covered" || row.status === "partial").map((row) => row.point);
    missed = valid.filter((row) => row.status === "missing").map((row) => row.point);
  } else if (numericLock === "dogru") {
    ratio = 1;
    covered = points.length ? points : [answer.slice(0, 120)];
    missed = [];
  } else if (numericLock === "yanlis") {
    ratio = 0;
    covered = [];
    missed = points;
  } else if (numericLock === "kismen") {
    ratio = 0.5;
  } else if (
    (sound || completeWork) && (asksQuantity(prompt) || points.length === 0)
  ) {
    ratio = 1;
    covered = points.length ? points : [answer.slice(0, 120)];
    missed = [];
  } else {
    // Model çağrısı yok/başarısız: kelime örtüşmesi yedeği. Sayı ve yarım örnek notu `numericIssue` /
    // `gap`te bilgi olarak kalır; oranı düşürmez (29 Ekim 2026).
    approximate = true;
    covered = points.filter((point) => answerCoversPoint(answer, point));
    missed = points.filter((point) => !covered.includes(point));
    ratio = !points.length ? 0 : covered.length / points.length;
  }

  const readable = (text: string) =>
    Boolean(text.trim()) && !announcedExampleGap(text) && fluencyIssues(text).length === 0;

  // Gösterilen doğru cevap bu sorunun kendi örnek çözümü. Kaynakta durmayan sayı elenir;
  // hesabı bozuk örnek çözüm düzeltilir. Ham sayfa metni buraya yazılmaz.
  const storedModel = clipAnswerSentences(question.modelAnswer?.trim() ?? "");
  const modelPoints = points
    .map((point) => groundedPoint(point, source))
    .filter((point): point is string => typeof point === "string" && !isScoreLabel(point) && readable(point))
    .slice(0, 2);
  let modelAnswer = "";
  if (storedModel && readable(storedModel) && !textOverlapsPrompt(storedModel, prompt)) {
    modelAnswer = clipAnswerSentences(repairModelAnswer(storedModel, source));
  } else if (modelPoints.length) {
    modelAnswer = modelPoints.join(" ");
  } else if (claim?.conclusion?.trim() && readable(claim.conclusion) && !textOverlapsPrompt(claim.conclusion, prompt)) {
    modelAnswer = clipAnswerSentences(claim.conclusion.trim());
  }
  if (!modelAnswer || isScoreLabel(modelAnswer) || textOverlapsPrompt(modelAnswer, prompt)) {
    modelAnswer = modelPoints[0] ?? "";
  }

  // Yükseltme kalır: hakem yokken örnek çözümle örtüşen cevap tam puan.
  const matchesSolution = Boolean(answer && modelAnswer && answerCoversPoint(answer, modelAnswer));
  if (!semantic?.length && matchesSolution) {
    ratio = 1;
    covered = points.length ? points : covered;
    missed = [];
  }

  const quantNotes = [
    ...numeric,
    ...(sound ? [] : studentAudit?.issues.map((issue) => issue.detail) ?? []),
    ...(claim && claim.verdict !== "dogru" ? claim.wrongParts : []),
  ];

  const rawGap = ratio >= 0.99
    ? ""
    : (claim?.wrongParts.find((part) => !isScoreLabel(part)) ||
      missed.find((part) => !isScoreLabel(part) && !textOverlapsPrompt(part, prompt)) ||
      hollowGap ||
      "");
  // Hakemin ilk cevap notu yalnız tam puan almayan soruda; tam puanda etiket yok.
  const firstAnswerNote = ratio < 0.99 && !dontKnow && answer ? firstAnswerErrorLine(judgeNote) : "";
  const gap = firstAnswerNote || (sanitizeGap(rawGap, prompt) ?? "");
  const right = ratio >= 0.99
    ? (claim?.rightParts[0] || covered[0] || answer.slice(0, 180))
    : (claim?.rightParts[0] || covered[0] || "");
  const cleanRight = textOverlapsPrompt(right, prompt) || isScoreLabel(right) ? "" : right;

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
    right: cleanRight,
    gap,
    missing: missed.filter((point) => !isScoreLabel(point) && !textOverlapsPrompt(point, prompt)),
    modelAnswer,
    citation: citationFromPassages({ ...question, prompt, expectedPoints: points }, passages),
    dontKnow,
    numericIssue: quantNotes.length ? [...new Set(quantNotes)].join(", ") : null,
    objective,
    ...(approximate ? { approximate: true } : {}),
    ...(firstAnswerNote ? { firstAnswerNote } : {}),
  };
}

/** Soru başına 0–1 kısmi puanların toplamı, bir ondalığa yuvarlı. */
export function oralPoints(items: readonly { ratio: number }[]): number {
  const sum = items.reduce((acc, item) => acc + (Number.isFinite(item.ratio) ? Math.max(0, Math.min(1, item.ratio)) : 0), 0);
  return Math.round(sum * 10) / 10;
}

export function oralPctFromPoints(points: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((points / total) * 100))) : 0;
}

/** Ekrandaki kesir: "7,4/8". Eski kayıtta `points` yoksa maddelerden hesaplanır. */
export function oralScoreFraction(report: Pick<OralExamReport, "items" | "total" | "points">): {
  points: number;
  total: number;
  label: string;
  pct: number;
} {
  const total = report.total || report.items.length || 1;
  const points = typeof report.points === "number" ? report.points : oralPoints(report.items);
  const shown = Number.isInteger(points) ? String(points) : points.toFixed(1).replace(".", ",");
  return { points, total, label: `${shown}/${total}`, pct: oralPctFromPoints(points, total) };
}

export function gradeOralExam(
  questions: OralQuestionDraft[],
  answers: Record<string, unknown>,
  source = "",
  passages: OralGroundingPassage[] = [],
  semantics: OralSemanticItem[] | null = null,
): OralExamReport {
  const byIndex = new Map((semantics ?? []).map((row) => [row.index, row]));
  const items = questions.map((question, index) =>
    gradeOralAnswer(
      question,
      String(answers[String(index)] ?? ""),
      source,
      index,
      passages,
      byIndex.get(index)?.points ?? null,
      byIndex.get(index)?.firstAnswerIssue ?? null,
    ),
  );
  const total = items.length || 1;
  const fullCount = items.filter((item) => item.ratio >= 0.99).length;
  const points = oralPoints(items);
  const pct = items.length ? oralPctFromPoints(points, total) : 0;
  const strengths = items
    .filter((item) => item.ratio >= 0.8)
    .map((item) => item.objective)
    .slice(0, 4);
  // Hakemin ilk cevap notları Eksikler'in başında (yalnız tam puan almayan sorularda dolu), sonra
  // yarıdan az karşılanan hedefler.
  const noteLines = items.map((item) => item.firstAnswerNote ?? "").filter(Boolean);
  const weaknesses = [
    ...new Set([
      ...noteLines,
      ...items.filter((item) => item.ratio < 0.5).map((item) => item.objective),
    ]),
  ].slice(0, Math.max(4, noteLines.length));
  return {
    fullCount,
    total,
    points,
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

/**
 * Sonuç ekranı ve yol aynı sayıyı gösterir (25 Ekim 2026): kayıt `pct / 100`. Önceden yol
 * "tam doğru / soru" (2/3 = %67) yazıyor, ekran kısmi puanlı yüzdeyi (%94) gösteriyordu.
 */
export function oralAttemptScore(report: Pick<OralExamReport, "pct">): { score: number; total: number; retried: number } {
  const pct = Number.isFinite(report.pct) ? Math.max(0, Math.min(100, Math.round(report.pct))) : 0;
  return { score: pct, total: 100, retried: 0 };
}

export type OralMisconceptionDraft = {
  claim: string;
  corrected: string | null;
  wrongType: string;
  questionPreview: string;
};

const UNVERIFIED_ANSWER = /doğrulanamadı|doğrulanmış bir çözüm cümlesi yok/i;

/**
 * Bu sözlü cevap yeniden sorulmaya değer mi: yanlış / kısmen / boş ve denetlenmiş bir çözüm cümlesi
 * var. Yanılgı kuyruğu ve günü gelen tekrar (20 Ekim 2026) aynı kuralı okur; ikisi ayrışmasın.
 */
export function oralItemReviewable(item: OralItemGrade): boolean {
  if (item.verdict !== "yanlis" && item.verdict !== "kismen" && item.verdict !== "bos") return false;
  const answer = typeof item.modelAnswer === "string" ? item.modelAnswer : "";
  if (answer.trim().length < 8) return false;
  return !isScoreLabel(answer) && !UNVERIFIED_ANSWER.test(answer);
}

/** Yalnızca yanlış / kısmen / boş. Doğru cevap ve çözümsüz kart kuyruğa girmez. */
export function oralMisconceptionDrafts(report: OralExamReport): OralMisconceptionDraft[] {
  return report.items
    .filter(oralItemReviewable)
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
    .split(/Eksik kalan:|Doğru kısım:|Örnek çözüm:|Hatanız şuradaydı:|Eksik:|\n+/)
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
  const model = isScoreLabel(item.modelAnswer) || textOverlapsPrompt(item.modelAnswer, item.question)
    ? ""
    : item.modelAnswer.trim();
  const gap = item.gap && !isScoreLabel(item.gap) && !textOverlapsPrompt(item.gap, item.question)
    ? item.gap.trim()
    : "";
  const right = item.right && !isScoreLabel(item.right) && !textOverlapsPrompt(item.right, item.question)
    ? item.right.trim()
    : "";
  const parsed = oralReviewSchema.safeParse({
    verdict: item.verdict,
    score: item.ratio,
    modelAnswer: model.slice(0, 500),
    gap: gap.slice(0, 400),
    right: right.slice(0, 400),
  });
  const scoreLabel = `%${Math.round(item.ratio * 100)}`;
  if (!parsed.success || reviewLooksGarbled(model, gap) || !model) {
    return {
      question: item.question,
      answer: item.answer,
      solution: ORAL_REVIEW_FALLBACK,
      scoreLabel,
      citation: null,
      verdict: item.verdict,
    };
  }
  const parts = [
    right ? `Doğru kısım: ${right}` : "",
    gap ? `Eksik kalan: ${gap}` : "",
    model ? `Örnek çözüm: ${model}` : "",
    item.approximate ? APPROX_ORAL_GRADE_NOTE : "",
  ].filter(Boolean);
  return presentOralReview({
    question: item.question,
    answer: item.answer,
    solution: parts.join(" "),
    scoreLabel,
    citation: item.citation,
    missing: gap || undefined,
    verdict: item.verdict,
  });
}
