/**
 * Öğrencinin gördüğü her alan kaynak sayfasına ve tanım denetimine girer.
 *
 * Canlı ders "kJ/kg toplam enerji, kJ özgül enerji" cümlesini geçirdi.
 * Bu cümle matematik iddiası değildi, nicelik taraması birim sözcüğüne
 * bakmıyordu, doğrulayıcı notu üslup sayıldı. Cümle burada kesilir;
 * dersin geri kalanı ilk denemede açılır.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { unsupportedQuantities } from "@/lib/learning/teacher-brain";
import {
  definitionalInversionIssues,
  mistakeTeachesInversion,
} from "@/lib/learning/unit-inversions";

type Alien = { label: string; pattern: RegExp };

const ALIEN_TOKENS: Alien[] = [
  { label: "kJ/kg", pattern: /k(?:j|cal)\s*\/\s*kg/i },
  { label: "kJ", pattern: /(?<![\w/])(?:kj|kcal|mj)(?!\s*\/)/i },
  { label: "kW", pattern: /(?<![\w/])(?:kw|mw)(?![\w/])/i },
  { label: "kg/s", pattern: /kg\s*\/\s*s/i },
  { label: "m3/kg", pattern: /m[³3]\s*\/\s*kg/i },
  { label: "entalpi", pattern: /entalpi|enthalpy/i },
  { label: "özgül enerji", pattern: /özgül\s+enerji|ozgul\s+enerji|specific\s+energy/i },
  { label: "özgül hacim", pattern: /özgül\s+hacim|ozgul\s+hacim|specific\s+volume/i },
];

export type GroundedLesson = { lesson: unknown; removed: string[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sourceHas(source: string, pattern: RegExp): boolean {
  const folded = foldTr(source);
  pattern.lastIndex = 0;
  if (pattern.test(folded)) return true;
  pattern.lastIndex = 0;
  return pattern.test(source);
}

function truncated(source: string): boolean {
  return source.includes("kısaltıldı");
}

function alienHit(text: string, source: string): string | null {
  if (!source.trim() || truncated(source)) return null;
  const folded = foldTr(text);
  for (const alien of ALIEN_TOKENS) {
    alien.pattern.lastIndex = 0;
    if (!alien.pattern.test(folded)) continue;
    if (!sourceHas(source, alien.pattern)) return alien.label;
  }
  return null;
}

function sentenceReason(sentence: string, source: string): string | null {
  if (definitionalInversionIssues(sentence).length) return "definition_inversion";
  const alien = alienHit(sentence, source);
  if (alien) return `off_topic:${alien}`;
  if (source.trim() && !truncated(source) && unsupportedQuantities(sentence, source).length) {
    return "unsupported_quantity";
  }
  return null;
}

function cleanProse(text: string, source: string, removed: string[], field: string): string {
  const kept = sentencesOf(text).filter((sentence) => {
    const reason = sentenceReason(sentence, source);
    if (!reason) return true;
    removed.push(`${field}:${reason}`);
    return false;
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Öğrenciye giden tek metin. Ters tanım, kaynakta olmayan birim ve sayı düşer.
 * Kalan cümle yoksa null. Kaynak boşsa yalnız tanım denetimi çalışır.
 */
export function groundLearnerText(text: string, source: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const removed: string[] = [];
  const cleaned = cleanProse(trimmed, source, removed, "text");
  if (!removed.length) return trimmed;
  return cleaned.length >= 8 ? cleaned : null;
}

function fieldFails(text: string, source: string): boolean {
  return sentencesOf(text).some((sentence) => sentenceReason(sentence, source) != null) ||
    definitionalInversionIssues(text).length > 0;
}

function mistakeHeading(heading: string): boolean {
  const folded = foldTr(heading).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return folded === "yaygin hata" || folded === "yaygin hatalar";
}

function corpusHas273(parts: string[]): boolean {
  return /273/.test(parts.join("\n"));
}

function isTrueFalse(check: Record<string, unknown>): boolean {
  if (check.type === "trueFalse") return true;
  const options = Array.isArray(check.options) ? check.options.map((item) => String(item).trim().toLocaleLowerCase("tr")) : [];
  return options.includes("doğru") && options.includes("yanlış");
}

function restatedConversion(prompt: string, body: string): boolean {
  if (/kullanılmalıdır|kullanilmalidir/i.test(prompt)) return true;
  const claim = prompt
    .replace(/doğru mu yanlış\??/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr");
  if (claim.length < 12) return false;
  const host = body.replace(/\*\*/g, "").replace(/\s+/g, " ").toLocaleLowerCase("tr");
  return host.includes(claim);
}

const CONCEPT_NEEDLES = [
  "hal fonksiyon",
  "yol fonksiyon",
  "cevrim",
  "adyabatik",
  "izotermal",
  "kapali sistem",
  "acik sistem",
  "yegin",
  "yaygin ozellik",
  "yari deng",
  "enerji degis",
  "doymus sivi",
  "doymus buhar",
  "kizgin buhar",
  "sikistirilmis",
  "sivi-buhar",
  "kuruluk",
  "t_sat",
  "tsat",
  "p_sat",
  "psat",
];

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}

function optionKey(value: unknown): string {
  return foldTr(String(value ?? "")).replace(/[^a-z]/g, "");
}

function keyedLabel(check: Record<string, unknown>): string {
  if (!Array.isArray(check.options) || typeof check.answerIndex !== "number") return "";
  return optionKey(check.options[check.answerIndex]);
}

/** Kaynakta aynı kavramı söyleyen, ters tanımsız cümle. */
function sourceSentenceFor(topic: string, source: string): string | null {
  if (!source.trim() || truncated(source)) return null;
  const topicFold = foldTr(topic);
  let needles = CONCEPT_NEEDLES.filter((needle) => topicFold.includes(needle));
  if (!needles.length && /faz|sicaklik|basinc|karisim|doymus|kizgin|sikistir/.test(topicFold)) {
    needles = ["t_sat", "tsat", "p_sat", "psat", "kuruluk", "doymus sivi", "doyma"];
  }
  if (!needles.length) return null;
  let best: { score: number; text: string } | null = null;
  for (const sentence of sentencesOf(source)) {
    if (sentence.length < 20) continue;
    if (definitionalInversionIssues(sentence).length) continue;
    const folded = foldTr(sentence);
    let score = 0;
    for (const needle of needles) {
      if (folded.includes(needle)) score += 1;
    }
    if (/karisim/.test(topicFold) && /kuruluk|(?<![a-z])x(?![a-z])/.test(folded)) score += 2;
    if (/karsilastir|faz karar/.test(topicFold) && /t[_ ]?sat|tsat|p[_ ]?sat|psat|doyma/.test(folded)) {
      score += 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, text: sentence };
  }
  return best?.text ?? null;
}

function sharpenCheck(check: Record<string, unknown>, source: string, body: string): Record<string, unknown> {
  if (!isTrueFalse(check) || typeof check.prompt !== "string") return check;
  if (!restatedConversion(check.prompt, body)) return check;
  const explanation = typeof check.explanation === "string" ? check.explanation : "";
  if (!corpusHas273([source, body, explanation, check.prompt])) return check;
  const options = Array.isArray(check.options) ? check.options.map((item) => String(item)) : [];
  const dogru = options.findIndex((option) => option.trim().toLocaleLowerCase("tr") === "doğru");
  if (dogru < 0 || check.answerIndex !== dogru) return check;
  if (/0\s*°\s*c/i.test(check.prompt) && /273/.test(check.prompt)) return check;
  return {
    ...check,
    prompt: "0 °C, 273.15 K eder. DOĞRU MU YANLIŞ?",
    answerIndex: dogru,
  };
}

function cleanCheck(
  value: unknown,
  source: string,
  body: string,
  removed: string[],
  field: string,
): Record<string, unknown> | undefined {
  const check = asRecord(value);
  if (!check || typeof check.prompt !== "string") return undefined;
  const sharpened = sharpenCheck(check, source, body);
  if (String(sharpened.prompt ?? "") !== String(check.prompt ?? "")) {
    removed.push(`${field}:check_rephrased`);
  }
  const prompt = String(sharpened.prompt ?? "");
  const explanation = typeof sharpened.explanation === "string" ? sharpened.explanation : "";
  const promptFails = fieldFails(prompt, source) || definitionalInversionIssues(prompt).length > 0;
  const explanationFails =
    fieldFails(explanation, source) || definitionalInversionIssues(explanation).length > 0;
  const taughtTrue = keyedLabel(sharpened) === "dogru";
  const taughtFalse = keyedLabel(sharpened) === "yanlis";
  let next = sharpened;
  if (explanationFails || (promptFails && taughtTrue)) {
    const fallback = sourceSentenceFor(`${prompt}\n${explanation}`, source);
    if (!fallback) {
      removed.push(`${field}:check`);
      return undefined;
    }
    if (explanationFails) {
      next = { ...next, explanation: clip(fallback, 600) };
      removed.push(`${field}:explanation_replaced`);
    }
    if (promptFails && taughtTrue) {
      const options = Array.isArray(next.options) ? next.options : [];
      const dogru = options.findIndex((option) => optionKey(option) === "dogru");
      next = {
        ...next,
        prompt: clip(fallback, 300),
        answerIndex: dogru >= 0 ? dogru : next.answerIndex,
      };
      removed.push(`${field}:prompt_replaced`);
    }
  } else if (promptFails && !taughtFalse) {
    removed.push(`${field}:check`);
    return undefined;
  }
  const review = asRecord(next.review);
  if (review && typeof review.prompt === "string" && fieldFails(review.prompt, source)) {
    removed.push(`${field}:review`);
    next = { ...next };
    delete next.review;
  }
  return next;
}

function cleanCards(value: unknown, source: string, removed: string[], field: string): unknown {
  if (!Array.isArray(value)) return value;
  const kept = value.filter((card) => {
    const row = asRecord(card);
    const text = `${row?.title ?? ""} ${row?.body ?? ""}`;
    if (!fieldFails(text, source)) return true;
    removed.push(`${field}:card`);
    return false;
  });
  return kept.length >= 2 ? kept : undefined;
}

/**
 * JSON taslağını olduğu gibi temizler. Ayrışmazsa metin geri döner.
 * Doğrulayıcı bu temiz hâli görür; ters tanım dersi düşürmez.
 */
export function groundLessonDraft(draft: string, source: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch {
    return draft;
  }
  const grounded = groundLearnerLesson(parsed, source);
  if (!grounded.removed.length) return draft;
  console.error("removed_for_source", { removed: grounded.removed });
  try {
    return JSON.stringify(grounded.lesson);
  } catch {
    return draft;
  }
}

export function groundLearnerLesson(lesson: unknown, source: string): GroundedLesson {
  const removed: string[] = [];
  const row = asRecord(lesson);
  if (!row) return { lesson, removed };
  const next: Record<string, unknown> = { ...row };

  if (typeof next.overview === "string") {
    const overview = cleanProse(next.overview, source, removed, "overview");
    if (overview.length >= 20) next.overview = overview;
    else if (overview !== next.overview.trim()) {
      removed.push("overview");
      delete next.overview;
    }
  }
  if (typeof next.objective === "string" && fieldFails(next.objective, source)) {
    removed.push("objective");
    delete next.objective;
  }

  const sections = Array.isArray(next.sections) ? next.sections : [];
  const cleanedSections = sections.flatMap((section, index) => {
    const item = asRecord(section);
    if (!item) return [];
    const heading = typeof item.heading === "string" ? item.heading : "";
    const body = typeof item.body === "string" ? item.body : "";
    const field = `sections[${index}]`;
    if (mistakeHeading(heading) && sections.length > 1) {
      removed.push(`${field}:scaffold`);
      return [];
    }
    const cleanedBody = cleanProse(body, source, removed, field);
    if (cleanedBody.length < 20) {
      removed.push(field);
      return [];
    }
    const copy: Record<string, unknown> = { ...item, body: cleanedBody };
    if (copy.check) {
      const check = cleanCheck(copy.check, source, cleanedBody, removed, field);
      if (check) copy.check = check;
      else delete copy.check;
    }
    if (copy.note) {
      const note = asRecord(copy.note);
      const noteBody = typeof note?.body === "string" ? note.body : "";
      if (!note || fieldFails(`${note.title ?? ""} ${noteBody}`, source)) {
        removed.push(`${field}:note`);
        delete copy.note;
      }
    }
    if (copy.cards) {
      const cards = cleanCards(copy.cards, source, removed, field);
      if (cards) copy.cards = cards;
      else delete copy.cards;
    }
    return [copy];
  });
  next.sections = cleanedSections;

  const example = asRecord(next.example);
  if (example) {
    const prompt = typeof example.prompt === "string" ? example.prompt : "";
    const solution = typeof example.solution === "string" ? example.solution : "";
    const cleanedSolution = cleanProse(solution, source, removed, "example");
    if (fieldFails(prompt, source) || cleanedSolution.length < 8) {
      removed.push("example");
      delete next.example;
    } else {
      next.example = { ...example, solution: cleanedSolution };
    }
  }

  const mistake = asRecord(next.commonMistake);
  if (mistake) {
    const claim = typeof mistake.claim === "string" ? mistake.claim : "";
    const correction = typeof mistake.correction === "string" ? mistake.correction : "";
    const offTopic = Boolean(alienHit(`${claim}\n${correction}`, source));
    if (mistakeTeachesInversion(claim, correction) || fieldFails(correction, source) || offTopic) {
      removed.push("commonMistake");
      delete next.commonMistake;
    }
  }

  const info = asRecord(next.infoCheck);
  if (info) {
    const prompt = typeof info.prompt === "string" ? info.prompt : "";
    const answer = typeof info.answer === "string" ? info.answer : "";
    if (fieldFails(`${prompt}\n${answer}`, source)) {
      removed.push("infoCheck");
      delete next.infoCheck;
    }
  }

  if (Array.isArray(next.summary)) {
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const item of next.summary) {
      if (typeof item !== "string") continue;
      const failing = fieldFails(item, source);
      const replacement = failing ? sourceSentenceFor(item, source) : null;
      const text = replacement ? clip(replacement, 240) : item;
      if (failing && !replacement) {
        removed.push("summary");
        continue;
      }
      if (failing && replacement) removed.push("summary:replaced");
      const key = foldTr(text);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(text);
    }
    if (kept.length) next.summary = kept;
    else delete next.summary;
  }

  return { lesson: next, removed };
}

/** Doğrulayıcıdan sonra öğrenciye giden nesne. İkinci geçiş değiştirmemeli. */
export function finalizeLearnerLesson<T>(lesson: T, source: string): T {
  return groundLearnerLesson(lesson, source).lesson as T;
}

/** Nicelik kapısının baktığı öğrenci metni. Şıklar yanlış inanç olabilir. */
export function collectLearnerVisibleText(lesson: unknown): string {
  const row = asRecord(lesson);
  if (!row) return typeof lesson === "string" ? lesson : "";
  const parts: string[] = [];
  for (const key of ["title", "overview", "objective"]) {
    if (typeof row[key] === "string") parts.push(row[key]);
  }
  const example = asRecord(row.example);
  if (example) parts.push(String(example.prompt ?? ""), String(example.solution ?? ""));
  const mistake = asRecord(row.commonMistake);
  if (mistake) parts.push(String(mistake.claim ?? ""), String(mistake.correction ?? ""));
  const info = asRecord(row.infoCheck);
  if (info) parts.push(String(info.prompt ?? ""), String(info.answer ?? ""));
  if (Array.isArray(row.summary)) parts.push(...row.summary.map((item) => String(item)));
  if (Array.isArray(row.sections)) {
    for (const section of row.sections) {
      const item = asRecord(section);
      if (!item) continue;
      parts.push(String(item.heading ?? ""), String(item.body ?? ""));
      const note = asRecord(item.note);
      if (note) parts.push(String(note.title ?? ""), String(note.body ?? ""));
      if (Array.isArray(item.cards)) {
        for (const card of item.cards) {
          const cardRow = asRecord(card);
          if (cardRow) parts.push(String(cardRow.title ?? ""), String(cardRow.body ?? ""));
        }
      }
      const check = asRecord(item.check);
      if (!check) continue;
      parts.push(String(check.prompt ?? ""), String(check.explanation ?? ""));
      const review = asRecord(check.review);
      if (review && typeof review.prompt === "string") parts.push(review.prompt);
    }
  }
  return parts.filter(Boolean).join("\n");
}
