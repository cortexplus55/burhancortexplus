/**
 * Bozuk ders parçasını bir kez onarır; onarım da tutmazsa o parça düşer.
 *
 * Tüm ders yeniden yazılmaz. Çelişen cümle, eksik soru, yarım örnek,
 * zayıf özet ve eksik çizim bu kapıdan geçer.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import {
  incompleteFormulaLine,
  repairGappedFrame,
  restoreMathNotation,
  separateRunOnFormulas,
} from "@/lib/learning/lesson-board";
import {
  ambiguousEnergyClaim,
  claimsFromVerify,
  claimVerifyPrompt,
  conceptInText,
  foreignToTopic,
  missingCoverage,
  overgeneralCorrection,
  realGasPrecisionIssue,
  rewriteSignFlip,
  signConventionFlip,
  summaryQuantityMismatch,
  titleConcepts,
} from "@/lib/learning/lesson-claims";
import { diagramIssues, lessonDiagramSchema, needsDiagram } from "@/lib/learning/lesson-diagram";
import { groundLearnerLesson, normalizeSummaryText, summaryLineProblem } from "@/lib/learning/lesson-grounding";
import type { LessonDiagram } from "@/lib/learning/lesson-diagram";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

export type LessonCheckCode =
  | "source_contradiction"
  | "stem_grammar"
  | "check_count"
  | "example_incomplete"
  | "summary_weak"
  | "vacuous"
  | "bound_mismatch"
  | "diagram_missing"
  | "diagram_unreadable"
  | "claim_wrong"
  | "coverage_gap";

export type LessonCheck = { code: LessonCheckCode; detail: string };

const NEGATION = /\b(olamaz|bulunamaz|gerceklesemez|imkansiz|mumkun degildir)\b/;

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function stems(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 4) continue;
    if (/^(olan|olarak|birlikte|dengede|dengededir|olamaz|bulunamaz)$/.test(word)) continue;
    const stem = word.slice(0, 5);
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

function affirmsCoexistence(sentence: string, wanted: string[]): boolean {
  const folded = foldTr(sentence);
  if (NEGATION.test(folded)) return false;
  if (!/(birlikte|dengede|bir arada|bulunur|yer alir)/.test(folded)) return false;
  const shared = wanted.filter((stem) => folded.includes(stem));
  return shared.length >= 2;
}

/** Kaynak bir arada duran şeyi ders "olamaz" diyorsa cümle yayımlanmaz. */
export function contradictorySentences(text: string, source: string): string[] {
  if (!source.trim()) return [];
  const sourceSentences = sentencesOf(source);
  const found: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const folded = foldTr(sentence);
    if (!NEGATION.test(folded)) continue;
    const wanted = stems(sentence);
    if (wanted.length < 2) continue;
    if (sourceSentences.some((item) => affirmsCoexistence(item, wanted))) found.push(sentence);
  }
  return found;
}

/** "T-v diyagramında … değildir" gibi öznesiz yüklem. */
export function stemLacksSubject(prompt: string): boolean {
  const claim = prompt
    .replace(/aşağıdakilerden hangisi doğrudur\??/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!claim) return true;
  const words = claim.replace(/[?.!]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 4) return true;
  const locative = words.findIndex((word) => /(ında|inde|unda|ünde|nda|nde)$/i.test(word));
  if (locative < 0 || locative > 2) return false;
  if (!/(değildir|olamaz|yoktur)\s*\.?$/i.test(claim)) return false;
  return !/\sve\s/i.test(claim);
}

export function vacuousSentence(text: string): boolean {
  const folded = foldTr(text);
  if (/\d/.test(text) || /=/.test(text)) return false;
  if (/belirgin bir yon/.test(folded)) return true;
  return /^sonuc[,:]/.test(folded) && folded.split(/\s+/).length < 14 && /goster/.test(folded);
}

function placeholderWork(text: string): boolean {
  const folded = foldTr(text);
  return /adim\s*\d+/.test(folded) && /sonucu hesapla/.test(folded);
}

/** Verilen, yerine koyma ve sayısal sonuç yoksa örnek yarım kalmıştır. */
export function exampleIsComplete(text: string): boolean {
  if (!text.trim() || placeholderWork(text)) return false;
  const given = /\d+(?:[.,]\d+)?\s*(?:kg|kj|kpa|mpa|pa|°\s*c|m3\/kg|%)/i.test(text);
  const substituted = /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²]+)?\s*[/×*·+\-−]\s*\d/.test(text);
  const result = /=\s*\d+(?:[.,]\d+)?\b/.test(text);
  return given && substituted && result;
}

function energyFormulaSymbol(sentence: string, context: string): "ΔE" | "ΔU" | null {
  const blob = `${context}\n${sentence}`;
  const hasE = /ΔE\s*=\s*Q\s*[−–-]\s*W/i.test(blob);
  const hasU = /ΔU\s*=\s*Q\s*[−–-]\s*W/i.test(blob);
  const equivalent = /ΔE\s*=\s*ΔU|ΔU\s*=\s*ΔE/i.test(blob);
  const mentionsU = /iç enerji|ΔU/i.test(sentence);
  const mentionsE = /ΔE|toplam enerji/i.test(sentence);
  if (mentionsU && hasU) return "ΔU";
  if (mentionsU && hasE && equivalent) return "ΔU";
  if (mentionsE && hasE) return "ΔE";
  if (mentionsE && hasU && equivalent) return "ΔE";
  if (hasE) return "ΔE";
  if (hasU) return "ΔU";
  return null;
}

/** Sayı var, formül → yerine koyma → sonuç yok. Tam zincir ve basınç hesabı burada değildir. */
export function workedExampleNeedsFormula(text: string): boolean {
  if (/Q\s*[−–-]\s*W\s*=\s*\d/i.test(text)) return false;
  if (/(?:Δ[EU]|sonuç|sonuc)\s*=\s*\d+(?:[.,]\d+)?\s*[-−]\s*\d+(?:[.,]\d+)?\s*=\s*\d/i.test(text)) {
    return true;
  }
  const folded = foldTr(text);
  const amounts = text.match(/\d+(?:[.,]\d+)?\s*kJ/gi) ?? [];
  return amounts.length >= 2 && /isi/.test(folded) && /\bis\b/.test(folded);
}

function heatWorkTriple(text: string): { q: string; w: string; result: string; unit: string } | null {
  const heat = text.match(/(\d+(?:[.,]\d+)?)\s*kJ\s+ısı/i);
  const work = text.match(/(\d+(?:[.,]\d+)?)\s*kJ\s+iş/i);
  const gained =
    text.match(/iç enerji(?:si)?\s+(\d+(?:[.,]\d+)?)\s*kJ/i) ??
    text.match(/(\d+(?:[.,]\d+)?)\s*kJ\s+art/i);
  if (heat && work && gained) return { q: heat[1], w: work[1], result: gained[1], unit: "kJ" };
  const bare = text.match(
    /(\d+(?:[.,]\d+)?)\s*[-−]\s*(\d+(?:[.,]\d+)?)\s*=\s*(\d+(?:[.,]\d+)?)\s*(kJ|kPa|Pa)?/i,
  );
  if (!bare) return null;
  return { q: bare[1], w: bare[2], result: bare[3], unit: bare[4] ?? "kJ" };
}

function differenceMatches(q: string, w: string, result: string): boolean {
  const left = Number(q.replace(",", "."));
  const right = Number(w.replace(",", "."));
  const total = Number(result.replace(",", "."));
  return [left, right, total].every((value) => Number.isFinite(value)) && Math.abs(left - right - total) < 0.051;
}

/** Verilen ve sonuç duruyorsa satır, dersteki formülden kurulur. Formül yoksa satır düşer. */
export function polishWorkedExample(text: string, context: string): string | null {
  if (!workedExampleNeedsFormula(text)) return text;
  const symbol = energyFormulaSymbol(text, context);
  const nums = heatWorkTriple(text);
  if (!symbol || !nums || !differenceMatches(nums.q, nums.w, nums.result)) return null;
  return `${symbol} = Q − W = ${nums.q} ${nums.unit} − ${nums.w} ${nums.unit} = ${nums.result} ${nums.unit}`;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function completeDanglingFormula(sentence: string, context: string): string | null {
  if (!incompleteFormulaLine(sentence)) return sentence;
  const left = sentence.match(/((?:Δ[EU]|[A-Za-z][A-Za-z0-9_]*))\s*=\s*$/);
  if (!left) return null;
  const symbol = left[1];
  const re = new RegExp(`${escapeReg(symbol)}\\s*=\\s*([^\\n.;]{1,80})`, "gi");
  let found: RegExpExecArray | null;
  while ((found = re.exec(context))) {
    const right = found[1]
      .trim()
      .replace(
        /\s+(?:formülü|formulu|formülüne|formulune|bağıntısı|bagintisi|şeklinde|seklinde|ile|olarak)\b.*/i,
        "",
      )
      .trim();
    const formula = `${symbol} = ${right}`.replace(/\s+/g, " ").trim();
    if (!right || incompleteFormulaLine(formula) || signConventionFlip(formula)) continue;
    if (new RegExp(`^${escapeReg(symbol)}\\s*=\\s*$`).test(sentence.trim())) return formula;
    const replaced = sentence.replace(new RegExp(`${escapeReg(symbol)}\\s*=\\s*$`), formula);
    if (!incompleteFormulaLine(replaced) && !signConventionFlip(replaced)) return replaced;
  }
  return null;
}

/**
 * "30 kJ ısı alıyorsa ΔU = 30 kJ olur" verileni sonuç diye tekrar eder.
 * 25 °C = 298 K ve içinde işlem olan eşitlik burada yakalanmaz.
 */
export function restatedResult(text: string): boolean {
  if (exampleIsComplete(text)) return false;
  return sentencesOf(text).some((sentence) => {
    if (!/\bolur\b/i.test(sentence) || exampleIsComplete(sentence)) return false;
    const result = sentence.match(/=\s*(\d+(?:[.,]\d+)?)\s*(?:kJ|kPa|MPa|Pa|kg|°\s*C|K|m3\/kg)/i);
    if (!result) return false;
    const value = result[1];
    const mentioned = [
      ...sentence.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kJ|kPa|MPa|Pa|kg|°\s*C|K|m3\/kg)/gi),
    ].map((match) => match[1]);
    if (!mentioned.includes(value)) return false;
    return !/\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²]+)?\s*[/×*·+\-−]\s*\d/.test(sentence);
  });
}

function examplePool(lesson: LessonV2): string {
  return `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
}

/**
 * "Örnek:" bloğu ya da hesaplanıp bulunur denilen senaryo,
 * yerine koyma ve sonuç taşımıyorsa örnek değildir.
 */
export function isIncompleteExample(text: string): boolean {
  if (!text.trim() || exampleIsComplete(text)) return false;
  const folded = foldTr(text);
  if (/\bornek\s*:/.test(folded)) return true;
  return /hesaplanarak/.test(folded) && /\d/.test(text) && /\bbulunur\b/.test(folded);
}

function workedCalculation(text: string): boolean {
  return (
    /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²]+)?\s*[/×*·+\-−]\s*\d/.test(text) &&
    /=\s*\d/.test(text)
  );
}

/** Kaynak sabiti birimiyle duruyorsa örnekte de birimiyle durur. */
function withConstantUnits(text: string, source: string): string {
  const normalizedSource = source.replace(/\bc\s*_?\s*([vp])\b/gi, "c_$1");
  let next = text;
  for (const symbol of ["c_v", "c_p"] as const) {
    const match = normalizedSource.match(
      new RegExp(`${symbol}\\s*=\\s*(\\d+(?:[.,]\\d+)?)\\s*kJ\\s*/\\s*kg\\s*[·.]?\\s*K`, "i"),
    );
    if (!match) continue;
    const value = match[1].replace(",", ".");
    const comma = value.replace(".", ",");
    if (!next.includes(value) && !next.includes(comma)) continue;
    if (new RegExp(`${symbol}\\s*=\\s*${value.replace(".", "[.,]")}\\s*kJ\\s*/\\s*kg`, "i").test(next)) {
      continue;
    }
    next = `${next.replace(/[.\s]+$/g, "")}. ${symbol} = ${value} kJ/kg·K.`;
  }
  return next.replace(/\s+/g, " ").trim();
}

/** Özet satırı kabul ediliyorsa alt simgeleri ve kapanış noktasını da taşır. */
function acceptSummaryLine(text: string, source: string, example = ""): string | null {
  const rewritten = rewriteSignFlip(text.trim());
  if (!rewritten) return null;
  let cleaned = alignBounds(normalizeSummaryText(rewritten), source);
  if (cleaned.length < 8 || cleaned.length > 240) return null;
  if (summaryLineProblem(cleaned) || vacuousSentence(cleaned) || signConventionFlip(cleaned)) return null;
  if (cleaned.includes("|") || foldTr(cleaned).includes("bu sayfadaki formuller")) return null;
  if (/[=+×*/\-−]\s*$/.test(cleaned)) return null;
  if (contradictorySentences(cleaned, source).length || placeholderWork(cleaned)) return null;
  if (ambiguousEnergyClaim(cleaned, source) || overgeneralCorrection(cleaned, source)) return null;
  if (summaryQuantityMismatch(cleaned, example, source)) return null;
  if (isIncompleteExample(cleaned) || workedCalculation(cleaned) || workedExampleNeedsFormula(cleaned)) return null;
  if (incompleteFormulaLine(cleaned)) return null;
  if (!/[.!?]\s*$/.test(cleaned) && !/[=≤≥]/.test(cleaned)) {
    cleaned = `${cleaned}.`;
    if (cleaned.length > 240) return null;
  }
  return cleaned;
}

function alignBounds(text: string, source: string): string {
  if (!/0\s*(?:≤|<=)\s*x\s*(?:≤|<=)\s*1/.test(source)) return text;
  return text.replace(/0\s*<\s*x\s*<\s*1/g, "0 ≤ x ≤ 1");
}

function checkCount(lesson: LessonV2): number {
  return lesson.sections.filter((section) => section.check).length;
}

function readableDiagram(lesson: LessonV2): boolean {
  return lesson.sections.some(
    (section) => section.diagram && diagramIssues(section.diagram).length === 0,
  );
}

export function auditLearnerLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
): LessonCheck[] {
  const issues: LessonCheck[] = [];
  const blobs = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    ...(lesson.summary ?? []),
  ];
  for (const text of blobs) {
    for (const sentence of contradictorySentences(text, input.source)) {
      issues.push({ code: "source_contradiction", detail: sentence.slice(0, 160) });
    }
    for (const sentence of sentencesOf(text)) {
      if (vacuousSentence(sentence)) issues.push({ code: "vacuous", detail: sentence.slice(0, 160) });
      if (signConventionFlip(sentence) || realGasPrecisionIssue(sentence, input.source)) {
        issues.push({ code: "claim_wrong", detail: sentence.slice(0, 160) });
      }
      if (incompleteFormulaLine(sentence) || workedExampleNeedsFormula(sentence)) {
        issues.push({ code: "example_incomplete", detail: sentence.slice(0, 160) });
      }
    }
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 2 && trimmed.length < 8 && incompleteFormulaLine(trimmed)) {
        issues.push({ code: "example_incomplete", detail: trimmed });
      }
    }
  }
  if (/0\s*<\s*x\s*<\s*1/.test(blobs.join("\n")) && /0\s*(?:≤|<=)\s*x\s*(?:≤|<=)\s*1/.test(input.source)) {
    issues.push({ code: "bound_mismatch", detail: "0 < x < 1" });
  }
  lesson.sections.forEach((section, index) => {
    if (!section.check) return;
    if (stemLacksSubject(section.check.prompt)) {
      issues.push({ code: "stem_grammar", detail: `section:${index}` });
    }
  });
  if (checkCount(lesson) < 3) {
    issues.push({ code: "check_count", detail: String(checkCount(lesson)) });
  }
  const exampleText = examplePool(lesson);
  const sectionExample = lesson.sections.map((section) => section.body).join("\n");
  const incompleteInSection = sentencesOf(sectionExample).some((sentence) => isIncompleteExample(sentence));
  if (
    (lesson.example && !exampleIsComplete(exampleText)) ||
    restatedResult(exampleText) ||
    restatedResult(sectionExample) ||
    incompleteInSection ||
    placeholderWork(sectionExample) ||
    (/veri\s*:/i.test(sectionExample) && /ad[ıi]m\s*\d+/i.test(sectionExample) && !exampleIsComplete(sectionExample))
  ) {
    issues.push({ code: "example_incomplete", detail: "example" });
  }
  const claim = foldTr(lesson.commonMistake?.claim ?? "");
  const claimTexts = [
    lesson.commonMistake?.correction ?? "",
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    ...(lesson.summary ?? []),
  ];
  for (const text of claimTexts) {
    if (text && text === lesson.commonMistake?.correction && overgeneralCorrection(text, input.source)) {
      issues.push({ code: "claim_wrong", detail: text.slice(0, 160) });
    }
    for (const sentence of sentencesOf(text)) {
      if (claim && foldTr(sentence) === claim) continue;
      if (
        ambiguousEnergyClaim(sentence, input.source) ||
        overgeneralCorrection(sentence, input.source) ||
        signConventionFlip(sentence) ||
        realGasPrecisionIssue(sentence, input.source)
      ) {
        issues.push({ code: "claim_wrong", detail: sentence.slice(0, 160) });
      }
    }
  }
  const covered = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading} ${section.body}`),
    exampleText,
  ].join("\n");
  for (const concept of missingCoverage(covered, input.source, input.topicLabel)) {
    issues.push({ code: "coverage_gap", detail: concept });
  }
  const summary = lesson.summary ?? [];
  const weak = summary.filter((line) => !acceptSummaryLine(line, input.source, exampleText));
  if (weak.length || summary.length < 3 || summary.length > 5) {
    issues.push({ code: "summary_weak", detail: String(weak.length || summary.length) });
  }
  if (needsDiagram(input.topicLabel)) {
    const drawn = lesson.sections.some((section) => section.diagram);
    if (!drawn) issues.push({ code: "diagram_missing", detail: "diagram" });
    else if (!readableDiagram(lesson)) issues.push({ code: "diagram_unreadable", detail: "diagram" });
  }
  return issues;
}

function quoteHits(sentence: string, quotes: string[]): boolean {
  const folded = foldTr(sentence);
  return quotes.some((quote) => {
    const needle = foldTr(quote);
    return needle.length >= 12 && (sentence.includes(quote) || folded.includes(needle));
  });
}

function publishSentence(sentence: string, source: string, quotes: string[], context: string): string | null {
  let next = rewriteSignFlip(sentence);
  if (!next || signConventionFlip(next)) return null;
  if (incompleteFormulaLine(next)) {
    const completed = completeDanglingFormula(next, context);
    if (!completed) return null;
    const fixed = rewriteSignFlip(completed);
    if (!fixed || signConventionFlip(fixed) || incompleteFormulaLine(fixed)) return null;
    next = fixed;
  }
  if (contradictorySentences(next, source).length) return null;
  if (vacuousSentence(next)) return null;
  if (placeholderWork(next) || restatedResult(next) || isIncompleteExample(next)) return null;
  if (ambiguousEnergyClaim(next, source) || overgeneralCorrection(next, source)) return null;
  if (realGasPrecisionIssue(next, source)) return null;
  const repairedGap = repairGappedFrame(next);
  if (!repairedGap) return null;
  next = repairedGap;
  if (quoteHits(next, quotes)) return null;
  if (/veri\s*:/i.test(next) && /ad[ıi]m\s*\d+/i.test(next) && !exampleIsComplete(next)) return null;
  if (workedExampleNeedsFormula(next)) {
    const polished = polishWorkedExample(next, context);
    if (!polished || workedExampleNeedsFormula(polished)) return null;
    next = polished;
  }
  if (incompleteFormulaLine(next) || signConventionFlip(next)) return null;
  return exampleIsComplete(next) ? withConstantUnits(next, source) : next;
}

function cleanSentences(text: string, source: string, quotes: string[] = [], context = text): string {
  const parts = sentencesOf(text);
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index] ?? "";
    const following = parts[index + 1] ?? "";
    const pair = following ? `${current} ${following}` : "";
    const currentLine = polishWorkedExample(current, context);
    if (
      pair &&
      !currentLine &&
      /\d/.test(current) &&
      /\d/.test(following) &&
      workedExampleNeedsFormula(pair) &&
      !/Δ[EU]\s*=\s*Q\s*[−–-]\s*W/i.test(current)
    ) {
      const line = polishWorkedExample(pair, context);
      if (line && !workedExampleNeedsFormula(line)) {
        kept.push(line);
        index += 1;
        continue;
      }
    }
    const published = publishSentence(current, source, quotes, context);
    if (published) kept.push(published);
  }
  return alignBounds(kept.join(" "), source).replace(/\s+/g, " ").trim();
}

function validCheck(value: unknown): SectionCheck | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SectionCheck;
  if (typeof row.prompt !== "string" || row.prompt.trim().length < 12) return null;
  if (!Array.isArray(row.options) || row.options.length < 2) return null;
  if (!Number.isInteger(row.answerIndex) || row.answerIndex < 0 || row.answerIndex >= row.options.length) {
    return null;
  }
  if (typeof row.explanation !== "string" || row.explanation.trim().length < 12) return null;
  if (stemLacksSubject(row.prompt)) return null;
  const options = row.options.map((option) => String(option).trim()).filter(Boolean);
  if (new Set(options.map((option) => option.toLocaleLowerCase("tr"))).size !== options.length) return null;
  return {
    type: row.type === "trueFalse" ? "trueFalse" : "mcq",
    prompt: row.prompt.trim(),
    options,
    answerIndex: row.answerIndex,
    explanation: row.explanation.trim(),
  };
}

function validDiagram(value: unknown): LessonDiagram | null {
  const parsed = lessonDiagramSchema.safeParse(value);
  if (!parsed.success) return null;
  if (diagramIssues(parsed.data).length) return null;
  return parsed.data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Modelin yaması yalnızca istenen alanları değiştirir. */
export function mergeLessonRepair(lesson: LessonV2, patch: unknown, source: string): LessonV2 {
  const row = asRecord(patch);
  if (!row) return lesson;
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const sections = Array.isArray(row.sections) ? row.sections : [];
  for (const item of sections) {
    const section = asRecord(item);
    if (!section || !Number.isInteger(section.index)) continue;
    const index = section.index as number;
    const target = next.sections[index];
    if (!target) continue;
    if (typeof section.body === "string" && section.body.trim().length >= 20) {
      target.body = alignBounds(section.body.trim(), source);
    }
    const check = validCheck(section.check);
    if (check) target.check = check;
    const diagram = validDiagram(section.diagram);
    if (diagram) target.diagram = diagram;
  }
  const added = Array.isArray(row.addedSections) ? row.addedSections : [];
  for (const item of added) {
    if (next.sections.length >= 8) break;
    const section = asRecord(item);
    if (!section) continue;
    const heading = typeof section.heading === "string" ? section.heading.trim() : "";
    const body = typeof section.body === "string" ? section.body.trim() : "";
    const check = validCheck(section.check);
    if (heading.length < 2 || body.length < 20 || !check) continue;
    next.sections.push({ heading, body: alignBounds(body, source), check });
  }
  if (row.example === null) {
    delete next.example;
  } else {
    const example = asRecord(row.example);
    const prompt = typeof example?.prompt === "string" ? example.prompt.trim() : "";
    const solution = typeof example?.solution === "string" ? example.solution.trim() : "";
    if (prompt.length >= 8 && exampleIsComplete(`${prompt}\n${solution}`)) {
      next.example = { prompt, solution: alignBounds(solution, source) };
    }
  }
  const mistake = asRecord(row.commonMistake);
  if (row.commonMistake === null) {
    delete next.commonMistake;
  } else if (mistake) {
    const claim = typeof mistake.claim === "string" ? mistake.claim.trim() : next.commonMistake?.claim ?? "";
    const correction = typeof mistake.correction === "string" ? mistake.correction.trim() : "";
    if (
      claim.length >= 8 &&
      correction.length >= 8 &&
      !overgeneralCorrection(correction, source) &&
      !ambiguousEnergyClaim(correction, source)
    ) {
      next.commonMistake = { claim, correction: alignBounds(correction, source) };
    }
  }
  if (Array.isArray(row.summary)) {
    const lines = row.summary
      .filter((item): item is string => typeof item === "string")
      .map((item) => acceptSummaryLine(item, source, examplePool(next)))
      .filter((item): item is string => Boolean(item));
    if (lines.length) next.summary = lines.slice(0, 5);
  }
  const diagram = validDiagram(row.diagram);
  if (diagram && !readableDiagram(next)) {
    const host = next.sections[0];
    if (host) host.diagram = diagram;
  }
  return next;
}

function filledSummary(lesson: LessonV2, source: string): string[] {
  const seen = new Set<string>();
  const summary: string[] = [];
  const example = examplePool(lesson);
  for (const line of lesson.summary ?? []) {
    const cleaned = acceptSummaryLine(line, source, example);
    if (!cleaned) continue;
    const key = foldTr(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    summary.push(cleaned);
    if (summary.length >= 5) return summary;
  }
  for (const sentence of teachingSentences(lesson, source)) {
    if (summary.length >= 5) break;
    const key = foldTr(sentence);
    if (seen.has(key)) continue;
    seen.add(key);
    summary.push(sentence);
  }
  return summary;
}

function teachingSentences(lesson: LessonV2, source: string): string[] {
  const pool = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.solution ?? "",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  const example = examplePool(lesson);
  for (const text of pool) {
    for (const sentence of sentencesOf(text)) {
      const cleaned = acceptSummaryLine(sentence, source, example);
      if (!cleaned) continue;
      const key = foldTr(cleaned);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

/** Onarımdan sonra hâlâ bozuk olan parça düşer. Eksik soru ayrıca tamamlanır. */
export function dropUnresolvedLesson(
  lesson: LessonV2,
  source: string,
  quotes: string[] = [],
): { lesson: LessonV2; dropped: LessonCheckCode[] } {
  const dropped: LessonCheckCode[] = [];
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const mark = (code: LessonCheckCode) => {
    if (!dropped.includes(code)) dropped.push(code);
  };
  let strippedPlaceholder = false;
  const formulaContext = [
    next.overview ?? "",
    ...next.sections.map((section) => section.body),
    next.example?.prompt ?? "",
    next.example?.solution ?? "",
  ].join("\n");
  const stripField = (text: string) => {
    const parts = sentencesOf(text);
    if (parts.some((sentence) => contradictorySentences(sentence, source).length)) {
      mark("source_contradiction");
    }
    if (parts.some((sentence) => vacuousSentence(sentence))) mark("vacuous");
    if (
      parts.some(
        (sentence) =>
          placeholderWork(sentence) ||
          restatedResult(sentence) ||
          isIncompleteExample(sentence) ||
          (/veri\s*:/i.test(sentence) && /ad[ıi]m\s*\d+/i.test(sentence)),
      )
    ) {
      strippedPlaceholder = true;
    }
    if (parts.some((sentence) => ambiguousEnergyClaim(sentence, source) || overgeneralCorrection(sentence, source) || quoteHits(sentence, quotes))) {
      mark("claim_wrong");
    }
    return cleanSentences(text, source, quotes, formulaContext);
  };
  if (next.overview) {
    const overview = stripField(next.overview);
    if (overview) next.overview = overview;
    else delete next.overview;
  }
  next.sections = next.sections.flatMap((section) => {
    const body = stripField(section.body);
    if (body.length < 20) return [];
    const check = section.check && stemLacksSubject(section.check.prompt) ? undefined : section.check;
    if (section.check && !check) mark("stem_grammar");
    let diagram = section.diagram;
    if (diagram && diagramIssues(diagram).length) {
      diagram = undefined;
      mark("diagram_unreadable");
    }
    return [{ ...section, body, check, diagram }];
  });
  if (next.example) {
    const combined = `${next.example.prompt}\n${next.example.solution}`;
    let prompt = next.example.prompt;
    let solution = next.example.solution;
    if (workedExampleNeedsFormula(combined)) {
      const lines = [prompt, solution]
        .map((part) => polishWorkedExample(part, formulaContext))
        .filter((line): line is string => {
          if (!line) return false;
          return !workedExampleNeedsFormula(line) && exampleIsComplete(line);
        });
      const unique = [...new Set(lines)];
      if (unique.length) {
        solution = unique.join(" ");
        if (workedExampleNeedsFormula(prompt)) prompt = "Isı ve iş verildiğinde enerji değişimi nedir?";
      } else {
        prompt = "";
        solution = "";
      }
    }
    const exampleText = `${prompt}\n${solution}`;
    if (
      !prompt ||
      !solution ||
      !exampleIsComplete(exampleText) ||
      restatedResult(exampleText) ||
      isIncompleteExample(exampleText) ||
      workedExampleNeedsFormula(exampleText)
    ) {
      delete next.example;
      mark("example_incomplete");
    } else {
      next.example = { prompt, solution: withConstantUnits(solution, source) };
    }
  } else if (strippedPlaceholder) {
    mark("example_incomplete");
  }
  if (next.commonMistake) {
    const rewritten = rewriteSignFlip(next.commonMistake.correction);
    const correction = rewritten ?? "";
    const correctionBad =
      !rewritten ||
      signConventionFlip(correction) ||
      overgeneralCorrection(correction, source) ||
      ambiguousEnergyClaim(correction, source) ||
      quoteHits(correction, quotes);
    if (correctionBad) {
      delete next.commonMistake;
      mark("claim_wrong");
    } else {
      next.commonMistake = { ...next.commonMistake, correction };
    }
  }
  const summary = filledSummary(next, source);
  const previous = (lesson.summary ?? []).filter((line) => acceptSummaryLine(line, source)).length;
  if (summary.length) next.summary = summary;
  else delete next.summary;
  if (summary.length < 3 && previous < 3) mark("summary_weak");
  return { lesson: next, dropped };
}

export function lessonRepairPrompt(
  lesson: LessonV2,
  issues: LessonCheck[],
  source: string,
  quotes: string[] = [],
): string {
  const codes = [...new Set(issues.map((issue) => issue.code))];
  const gaps = issues.filter((issue) => issue.code === "coverage_gap").map((issue) => issue.detail);
  return [
    "Yalnızca bozuk parçaları yeniden yaz. Dersin tamamını yazma.",
    "Kaynakta olmayan sayı, tanım ve formül uydurma. Türkçe, tam cümle.",
    "Her kontrol sorusunun kökü öznesi olan bitmiş bir cümle olsun.",
    "Kontrol sorusu üçten azsa, dersteki bağıntılardan kaynakta duran sorular ekle. Üçten az soruyla bitirme.",
    "Örnek ya tam olsun (verilen, yerine koyma, sayısal sonuç, sabitin birimi) ya da null. Her örnek bloğu için geçerli.",
    "Örnekte sıra formül, yerine koyma, sonuç olsun: ΔU = Q − W = 80 kJ − 30 kJ = 50 kJ. Formül dersin içinde yoksa örneği sil.",
    "Sağ tarafı boş formül yazma. ΔE = gibi satır ya tamamlanır ya da silinir.",
    "Q − (−W) = Q + W yazma. W negatifse ΔE = Q − W = Q + |W| yaz.",
    "Özet 3 ile 5 bildiren cümle olsun. Her cümle nokta ile bitsin. Başlık, öğrenme hedefi, etiket zinciri, Soru:, Cevap:, ifade doğrudur, doğru cevap, seçenek, diğerleri, yanlış ve çünkü ile biten satır yazma.",
    "Pv = ZRT özgül hacim kullanır. Toplam hacimde PV = mZRT yaz. Kaynak söylemiyorsa Z = 1.03 varsayımı bozmaz deme.",
    "Kontrol sorularının en fazla biri doğru/yanlış olsun. Diğerleri dört şıklı çoktan seçmeli olsun.",
    "Tek cümlelik tekrar yazma. Verileni ve işlemi aynı sayıda göster: sonuç = bağıntı = verilen − sıfır.",
    "Adım 1 / Sonucu hesapla gibi yer tutucu yazma.",
    "Özetteki sayı, örneğin ve kaynağın sayısıyla aynı olsun.",
    "Sık yapılan hatanın doğrusu kaynak cümlesiyle desteklensin. Isı alımı da iç enerjiyi değiştirir. Destekleyemiyorsan commonMistake yazma.",
    "Başlıkta olup kaynakta duran her kavram bir bölümde geçsin. Kaynakta yoksa ekleme.",
    "Çizim gerekiyorsa diagram koy: en az iki etiket, en az iki şekil.",
    `Düzeltilecek kodlar: ${codes.join(", ")}.`,
    gaps.length ? `Eksik kavramlar: ${gaps.join(", ")}.` : "",
    quotes.length ? `Kaynağa uymayan cümleler: ${quotes.join(" | ")}` : "",
    `Ayrıntı: ${issues
      .map((issue) => `${issue.code}: ${issue.detail}`)
      .slice(0, 8)
      .join(" | ")}`,
    "JSON: {\"sections\":[{\"index\":0,\"body\":\"...\",\"check\":{\"type\":\"mcq\",\"prompt\":\"...\",\"options\":[\"...\"],\"answerIndex\":0,\"explanation\":\"...\"},\"diagram\":{\"caption\":\"...\",\"shapes\":[]}}],\"addedSections\":[],\"example\":{\"prompt\":\"...\",\"solution\":\"...\"},\"summary\":[\"...\"],\"diagram\":null}",
    `Kaynak:\n${source.slice(0, 6000)}`,
    `Mevcut ders:\n${JSON.stringify({
      title: lesson.title,
      overview: lesson.overview,
      sections: lesson.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
        check: section.check ?? null,
      })),
      example: lesson.example ?? null,
      summary: lesson.summary ?? [],
    }).slice(0, 8000)}`,
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

const MODEL_CODES = new Set<LessonCheckCode>([
  "source_contradiction",
  "stem_grammar",
  "check_count",
  "example_incomplete",
  "summary_weak",
  "vacuous",
  "diagram_missing",
  "diagram_unreadable",
  "claim_wrong",
  "coverage_gap",
]);

const RELATION_SENTENCE: { pattern: RegExp }[] = [
  { pattern: /c_?p\s*[−–-]\s*c_?v\s*=\s*r/i },
  { pattern: /k\s*=\s*c_?p\s*\/\s*c_?v/i },
];

/** Kaynak cümlesinde duran iki bağıntı derste yoksa o cümle eklenir. */
function coverSourceRelations(lesson: LessonV2, source: string): LessonV2 {
  let next = lesson;
  const blob = () =>
    [next.overview ?? "", ...next.sections.map((section) => section.body)].join("\n");
  for (const relation of RELATION_SENTENCE) {
    if (!relation.pattern.test(source) || relation.pattern.test(blob())) continue;
    const sentence = sentencesOf(source).find((item) => relation.pattern.test(item));
    if (!sentence || sentence.length < 20) continue;
    const host = next.sections[next.sections.length - 1];
    if (!host) continue;
    const combined = `${host.body} ${sentence}`.replace(/\s+/g, " ").trim();
    if (combined.length <= 2400) {
      next = {
        ...next,
        sections: next.sections.map((section, index) =>
          index === next.sections.length - 1 ? { ...section, body: combined } : section,
        ),
      };
      continue;
    }
    if (next.sections.length >= 8) continue;
    next = {
      ...next,
      sections: [...next.sections, { heading: "Özgül ısı bağıntısı", body: sentence.slice(0, 2400) }],
    };
  }
  return next;
}

const FORMULA_STOP = new Set([
  "ve",
  "ic",
  "ile",
  "bir",
  "bu",
  "su",
  "da",
  "de",
  "ki",
  "mi",
  "mu",
  "her",
  "ya",
  "ise",
  "veya",
  "icin",
  "olan",
  "olarak",
  "is",
  "isi",
  "gibi",
]);

function formulaToken(token: string): boolean {
  if (/[∫Δδ()[\]+\-−–×*/^₀-₉⁰-⁹0-9_]/.test(token)) return true;
  const bare = token.replace(/^[.(]+|[.,;:)]+$/g, "");
  if (!bare || FORMULA_STOP.has(foldTr(bare))) return false;
  if (/^d[A-Za-z]$/.test(bare)) return true;
  return bare.length <= 2 && /^[A-Za-zΔδ]+$/.test(bare);
}

function trimFormula(raw: string): string {
  let equation = raw.replace(/\s+/g, " ").trim();
  equation = equation
    .replace(/[,.;:].*$/, "")
    .replace(
      /\s+(?:formül\w*|formul\w*|ba[gğ]lant[ıi]\w*|ba[gğ]ınt[ıi]\w*|şeklinde|seklinde|yazılır|yazilir|bulunur|hesaplanır|hesaplanir|ile|olarak|eşitliği|esitligi|eşitliğe|esitlige).*$/i,
      "",
    )
    .replace(/[,\s]+$/g, "")
    .trim();
  const eq = equation.indexOf("=");
  if (eq < 0) return equation;
  const words = equation
    .slice(eq + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && !formulaToken(words[words.length - 1])) words.pop();
  return `${equation.slice(0, eq).trim()} = ${words.join(" ")}`.replace(/\s+/g, " ").trim();
}

function symbolicEquations(sentence: string): string[] {
  const normalized = sentence.replace(/\bc\s*_?\s*([vp])\b/gi, "c_$1");
  const start =
    /(?:(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*[-−–+]\s*)?(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*=\s*/g;
  const starts = [...normalized.matchAll(start)];
  const out: string[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const begin = match?.index ?? 0;
    const end = starts[index + 1]?.index ?? normalized.length;
    for (const piece of trimFormula(normalized.slice(begin, end)).split(/\s+ve\s+/i)) {
      const trimmed = trimFormula(piece);
      if (!trimmed || (trimmed.match(/=/g) ?? []).length !== 1) continue;
      if (/\d|[|]/.test(trimmed)) continue;
      const right = trimmed.split("=").slice(1).join("=");
      if (!/[A-Za-zΔδ∫]/.test(right) || trimmed.length < 5 || trimmed.length > 120) continue;
      out.push(trimmed);
    }
  }
  return out;
}

/** Kısa ya da birden fazla şıkkın solundaki simge soru kökü olamaz. */
export function ambiguousRelationQuestion(prompt: string, options: string[]): boolean {
  const match = prompt.match(/^(.{1,16}?)\s+(?:büyüklüğü\s+)?hangi bağıntıyla\s+hesaplanır/i);
  if (!match) return false;
  const symbol = match[1].trim();
  const letters = symbol.replace(/[^A-Za-zΔδ]/g, "");
  const short =
    letters.length <= 1 ||
    (letters.length <= 2 && !symbol.includes("Δ") && !symbol.includes("δ") && !symbol.includes("_"));
  if (!short) return false;
  const stem = foldTr(symbol).replace(/[^a-z0-9]/g, "");
  const hits = options.filter((option) => {
    const side = foldTr((option.split("=")[0] ?? "").trim()).replace(/[^a-z0-9]/g, "");
    return side.length > 0 && side === stem;
  });
  return letters.length <= 2 || hits.length > 1;
}

function equationPrompt(equation: string): string | null {
  const left = equation.split("=")[0]?.trim() || "";
  if (!left) return null;
  let prompt = `${left} hangi bağıntıyla hesaplanır?`;
  if (ambiguousRelationQuestion(prompt, [])) return null;
  if (prompt.replace(/[?.!]/g, "").split(/\s+/).filter(Boolean).length < 4) {
    prompt = `${left} büyüklüğü hangi bağıntıyla hesaplanır?`;
  }
  if (ambiguousRelationQuestion(prompt, [])) return null;
  if (stemLacksSubject(prompt)) prompt = `${left} için doğru bağıntı hangisidir?`;
  if (ambiguousRelationQuestion(prompt, []) || stemLacksSubject(prompt)) return null;
  return prompt.slice(0, 300);
}

function safeRelationPrompt(equation: string): string | null {
  if (/W\s*=\s*P\s*\(\s*V/i.test(equation)) return "Sabit basınçta sınır işi hangi eşitlikle yazılır?";
  if (/W\s*=\s*∫/.test(equation)) return "Sınır işinin genel tanımı hangi eşitliktir?";
  return null;
}

function boundaryDistractors(equation: string): string[] {
  if (!/W\s*=/.test(equation) || !/dV|V\s*[₂2]|∫/.test(equation)) return [];
  return ["W = V(P₂ − P₁)", "W = P(V₂ + V₁)", "W = P / (V₂ − V₁)"];
}

function heatSwap(equation: string): string | null {
  if (!/c_[vp]/i.test(equation)) return null;
  const swapped = equation.replace(/c_v/gi, "\u0000").replace(/c_p/gi, "c_v").replace(/\u0000/g, "c_p");
  return foldTr(swapped) === foldTr(equation) ? null : swapped;
}

function signDistractors(equation: string): string[] {
  if (!/Q\s*[−–-]\s*W/i.test(equation)) return [];
  return [
    equation.replace(/Q\s*[−–-]\s*W/i, "Q + W"),
    equation.replace(/Q\s*[−–-]\s*W/i, "W − Q"),
    equation.replace(/Q\s*[−–-]\s*W/i, "−Q − W"),
  ];
}

function optionsForEquation(equation: string, equations: { equation: string }[]): string[] {
  const options = [equation];
  const others = equations
    .map((row) => row.equation)
    .filter((item) => foldTr(item.replace(/\s+/g, "")) !== foldTr(equation.replace(/\s+/g, "")));
  for (const alt of [...others, ...signDistractors(equation)]) {
    if (options.length >= 4) break;
    const key = foldTr(alt.replace(/\s+/g, ""));
    if (options.some((item) => foldTr(item.replace(/\s+/g, "")) === key)) continue;
    options.push(alt);
  }
  const swapped = heatSwap(equation);
  if (swapped && options.length < 4 && !options.some((item) => foldTr(item) === foldTr(swapped))) {
    options.push(swapped);
  }
  return options;
}

function isBinaryCheck(check: SectionCheck): boolean {
  if (check.type === "trueFalse") return true;
  const options = check.options.map((option) => option.trim().toLocaleLowerCase("tr"));
  if (options.length <= 2 && options.includes("doğru") && options.includes("yanlış")) return true;
  return options.length <= 2 && /\bm[ıi]d[ıi]r\s*\??$/i.test(check.prompt.trim());
}

function equationCheck(
  item: { equation: string; sentence: string },
  equations: { equation: string }[],
): SectionCheck | null {
  const prompt = equationPrompt(item.equation) ?? safeRelationPrompt(item.equation);
  if (!prompt || prompt.length < 12 || stemLacksSubject(prompt)) return null;
  if (ambiguousRelationQuestion(prompt, [])) return null;
  const options = [...optionsForEquation(item.equation, equations)];
  for (const alt of boundaryDistractors(item.equation)) {
    if (options.length >= 4) break;
    if (options.some((itemOption) => foldTr(itemOption) === foldTr(alt))) continue;
    options.push(alt);
  }
  if (options.length < 2 || ambiguousRelationQuestion(prompt, options)) return null;
  const explanation =
    item.sentence.length >= 12 ? item.sentence.slice(0, 580) : `${item.equation} dersin anlatımında verilir.`;
  return validCheck({
    type: "mcq",
    prompt,
    options,
    answerIndex: 0,
    explanation,
  });
}

/**
 * Model üçüncü soruyu yazmadıysa dersin kendi cümlelerinden kurulur.
 * Yeni bir model çağrısı yok. Çeldirici, dersteki başka bağıntı ya da c_v/c_p değişimidir.
 */
export function ensureThreeChecks(lesson: LessonV2): LessonV2 {
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const used = new Set(
    next.sections.map((section) => foldTr(section.check?.prompt ?? "")).filter(Boolean),
  );
  const pool = [next.overview ?? "", ...next.sections.map((section) => section.body)];
  const equations: { equation: string; sentence: string }[] = [];
  const seenEq = new Set<string>();
  const statements: string[] = [];
  for (const text of pool) {
    for (const sentence of sentencesOf(text)) {
      if (isIncompleteExample(sentence) || vacuousSentence(sentence)) continue;
      if (sentence.length >= 24 && sentence.length <= 220 && !summaryLineProblem(sentence)) {
        statements.push(sentence.replace(/\s+/g, " ").trim());
      }
      for (const equation of symbolicEquations(sentence)) {
        const key = foldTr(equation).replace(/\s+/g, "");
        if (seenEq.has(key)) continue;
        seenEq.add(key);
        equations.push({ equation, sentence });
      }
    }
  }
  const queue: SectionCheck[] = [];
  const needed = () => checkCount(next) + queue.length < 3;
  for (const item of equations) {
    if (!needed()) break;
    const check = equationCheck(item, equations);
    if (!check || used.has(foldTr(check.prompt))) continue;
    used.add(foldTr(check.prompt));
    queue.push(check);
  }
  for (const sentence of statements) {
    if (!needed()) break;
    const prompt = `${sentence.replace(/[.!?]+$/g, "")} Bu ifade doğru mudur?`.slice(0, 300);
    if (prompt.length < 12 || used.has(foldTr(prompt)) || stemLacksSubject(prompt)) continue;
    const check = validCheck({
      type: "trueFalse",
      prompt,
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: sentence.slice(0, 580),
    });
    if (!check) continue;
    used.add(foldTr(prompt));
    queue.push(check);
  }
  for (const section of next.sections) {
    if (!queue.length) break;
    if (section.check) continue;
    section.check = queue.shift();
  }
  while (queue.length && checkCount(next) < 3 && next.sections.length < 8) {
    const check = queue.shift();
    if (!check) break;
    const body = check.explanation.length >= 20 ? check.explanation : `${check.explanation} Bu bağıntı dersin anlatımındadır.`;
    const heading = check.prompt.replace(/[?]/g, "").split(/\s+/).slice(0, 4).join(" ").slice(0, 80);
    next.sections.push({
      heading: heading.length >= 2 ? heading : "Bağıntı",
      body: body.slice(0, 2400),
      check,
    });
  }
  const spare: SectionCheck[] = [];
  for (const item of equations) {
    const check = equationCheck(item, equations);
    if (!check || used.has(foldTr(check.prompt))) continue;
    if (spare.some((row) => foldTr(row.prompt) === foldTr(check.prompt))) continue;
    spare.push(check);
  }
  let keptBinary = 0;
  for (const section of next.sections) {
    if (!section.check || !isBinaryCheck(section.check)) continue;
    if (keptBinary < 1) {
      keptBinary += 1;
      continue;
    }
    const replacement = spare.shift();
    if (!replacement) break;
    used.add(foldTr(replacement.prompt));
    section.check = replacement;
  }
  return next;
}

function alignedTopicTitle(title: string, topicLabel: string): string {
  const concepts = titleConcepts(topicLabel);
  if (!concepts.length) return title || topicLabel;
  const longest = concepts.reduce((best, item) => (item.length > best.length ? item : best));
  if (title && conceptInText(longest, title)) return title;
  return topicLabel;
}

function keepTopicSentence(sentence: string, source: string, topicLabel: string): string | null {
  const gapped = repairGappedFrame(restoreMathNotation(sentence));
  if (!gapped) return null;
  if (realGasPrecisionIssue(gapped, source) || foreignToTopic(gapped, source, topicLabel)) return null;
  return gapped;
}

function cleanTopicText(text: string, source: string, topicLabel: string): string {
  const parts = text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts
    .map((part) => (part.length < 8 ? restoreMathNotation(part) : keepTopicSentence(part, source, topicLabel)))
    .filter((part): part is string => Boolean(part));
  return separateRunOnFormulas(kept.join(" ").replace(/\s+/g, " ").trim());
}

function checkLeavesTopic(check: SectionCheck, source: string, topicLabel: string): boolean {
  if (ambiguousRelationQuestion(check.prompt, check.options)) return true;
  const blob = [check.prompt, check.explanation, ...check.options].join(" ");
  return foreignToTopic(blob, source, topicLabel) || realGasPrecisionIssue(blob, source);
}

function withBoundaryExample(lesson: LessonV2, source: string): LessonV2 {
  const existing = `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
  if (lesson.example && exampleIsComplete(existing)) return lesson;
  const blob = [lesson.overview ?? "", ...lesson.sections.map((section) => section.body)].join("\n");
  if (!/W\s*=\s*P\s*\(\s*V\s*(?:₂|2|_2)\s*[−–-]\s*V\s*(?:₁|1|_1)\s*\)/i.test(blob)) return lesson;
  const pressure = source.match(/P\s*=\s*(\d+(?:[.,]\d+)?)\s*kPa/i);
  const start = source.match(/V\s*(?:₁|1|_1)\s*=\s*(\d+(?:[.,]\d+)?)\s*m/i);
  const end = source.match(/V\s*(?:₂|2|_2)\s*=\s*(\d+(?:[.,]\d+)?)\s*m/i);
  if (!pressure || !start || !end) return lesson;
  const read = (raw: string) => Number(raw.replace(",", "."));
  const p = read(pressure[1]);
  const v1 = read(start[1]);
  const v2 = read(end[1]);
  const work = p * (v2 - v1);
  if (![p, v1, v2, work].every((value) => Number.isFinite(value))) return lesson;
  const shown = Math.abs(work - Math.round(work)) < 0.051 ? String(Math.round(work)) : work.toFixed(1);
  if (Math.abs(work - Number(shown)) > 0.051) return lesson;
  const solution = `W = P(V₂ − V₁) = ${pressure[1]} kPa × (${end[1]} − ${start[1]}) m³ = ${shown} kJ.`;
  if (!exampleIsComplete(solution)) return lesson;
  return {
    ...lesson,
    example: {
      prompt: `Sabit ${pressure[1]} kPa basınçta hacim ${start[1]} m³ değerinden ${end[1]} m³ değerine değişirse sınır işi nedir?`,
      solution,
    },
  };
}

/**
 * Ders, tıklanan konunun kendi sayfalarında kalır.
 * Başlık uymuyorsa istenen ad gelir. Kapsam dışı cümle ve soru düşer.
 * Yeni bir model çağrısı yok.
 */
export function scopeLessonToTopic(lesson: LessonV2, source: string, topicLabel: string): LessonV2 {
  const clean = (text: string) => cleanTopicText(text, source, topicLabel);
  const next: LessonV2 = {
    ...lesson,
    title: alignedTopicTitle(lesson.title, topicLabel),
    sections: [],
  };
  delete next.overview;
  delete next.summary;
  delete next.example;
  delete next.commonMistake;
  if (lesson.overview) {
    const overview = clean(lesson.overview);
    if (overview) next.overview = overview;
  }
  next.sections = lesson.sections.flatMap((section) => {
    const body = clean(section.body);
    if (body.length < 20) return [];
    let check = section.check;
    if (check && checkLeavesTopic(check, source, topicLabel)) check = undefined;
    else if (check) {
      check = {
        ...check,
        prompt: restoreMathNotation(check.prompt),
        explanation: restoreMathNotation(check.explanation),
        options: check.options.map((option) => restoreMathNotation(option)),
      };
      if (ambiguousRelationQuestion(check.prompt, check.options)) check = undefined;
    }
    return [{ ...section, heading: restoreMathNotation(section.heading), body, check }];
  });
  if (lesson.commonMistake) {
    const correction = clean(lesson.commonMistake.correction);
    if (correction && !foreignToTopic(correction, source, topicLabel) && !realGasPrecisionIssue(correction, source)) {
      next.commonMistake = {
        claim: restoreMathNotation(lesson.commonMistake.claim),
        correction,
      };
    }
  }
  if (lesson.summary?.length) {
    const summary = lesson.summary
      .map((line) => clean(line))
      .filter((line) => line.length >= 8 && !summaryLineProblem(line));
    if (summary.length) next.summary = summary;
  }
  if (lesson.example) {
    const prompt = clean(lesson.example.prompt);
    const solution = clean(lesson.example.solution);
    const blob = `${prompt}\n${solution}`;
    if (prompt && solution && !foreignToTopic(blob, source, topicLabel) && !realGasPrecisionIssue(blob, source)) {
      next.example = { prompt, solution };
    }
  }
  return withBoundaryExample(next, source);
}

export async function repairLearnerLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
  complete: (prompt: string) => Promise<unknown>,
  verify?: (prompt: string) => Promise<unknown>,
): Promise<{ lesson: LessonV2; requested: LessonCheckCode[]; succeeded: LessonCheckCode[]; dropped: LessonCheckCode[] }> {
  const bounded = applyBoundFix(scopeLessonToTopic(lesson, input.source, input.topicLabel), input.source);
  const filled = filledSummary(bounded, input.source);
  const prepared: LessonV2 = filled.length ? { ...bounded, summary: filled } : bounded;
  let quotes: string[] = [];
  if (verify && input.source.trim()) {
    try {
      quotes = claimsFromVerify(await verify(claimVerifyPrompt(prepared, input.source)), prepared);
    } catch {
      quotes = [];
    }
  }
  const audit = auditLearnerLesson(prepared, input);
  if (quotes.length && !audit.some((issue) => issue.code === "claim_wrong")) {
    audit.push({ code: "claim_wrong", detail: quotes[0].slice(0, 160) });
  }
  const requested = [...new Set(audit.map((issue) => issue.code))];
  if (!requested.length) {
    return { lesson: prepared, requested, succeeded: [], dropped: [] };
  }
  let merged = prepared;
  const needsModel = requested.some((code) => MODEL_CODES.has(code));
  if (needsModel) {
    try {
      const patch = await complete(lessonRepairPrompt(prepared, audit, input.source, quotes));
      if (patch) {
        const patched = mergeLessonRepair(prepared, patch, input.source);
        merged = groundLearnerLesson(patched, input.source).lesson as LessonV2;
      }
    } catch {
      merged = prepared;
    }
  }
  const finalized = dropUnresolvedLesson(applyBoundFix(merged, input.source), input.source, quotes);
  const covered = ensureThreeChecks(coverSourceRelations(finalized.lesson, input.source));
  const summary = filledSummary(covered, input.source);
  const drafted = summary.length ? { ...covered, summary } : covered;
  const published = scopeLessonToTopic(drafted, input.source, input.topicLabel);
  const remaining = new Set(auditLearnerLesson(published, input).map((issue) => issue.code));
  const removed = new Set(finalized.dropped);
  const succeeded = requested.filter((code) => !remaining.has(code) && !removed.has(code));
  const dropped = [...new Set([...finalized.dropped, ...remaining])];
  return { lesson: published, requested, succeeded, dropped };
}

function applyBoundFix(lesson: LessonV2, source: string): LessonV2 {
  const fix = (text: string) => alignBounds(text, source);
  return {
    ...lesson,
    overview: lesson.overview ? fix(lesson.overview) : lesson.overview,
    sections: lesson.sections.map((section) => ({ ...section, body: fix(section.body) })),
    example: lesson.example
      ? { prompt: fix(lesson.example.prompt), solution: fix(lesson.example.solution) }
      : lesson.example,
    summary: lesson.summary?.map((line) => fix(line)),
  };
}
