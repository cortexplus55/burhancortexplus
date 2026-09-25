/**
 * Bozuk ders parçasını bir kez onarır; onarım da tutmazsa o parça düşer.
 *
 * Tüm ders yeniden yazılmaz. Çelişen cümle, eksik soru, yarım örnek,
 * zayıf özet ve eksik çizim bu kapıdan geçer.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import {
  ambiguousEnergyClaim,
  claimsFromVerify,
  claimVerifyPrompt,
  missingCoverage,
  overgeneralCorrection,
  summaryQuantityMismatch,
} from "@/lib/learning/lesson-claims";
import { diagramIssues, lessonDiagramSchema, needsDiagram } from "@/lib/learning/lesson-diagram";
import { groundLearnerLesson, summaryLineProblem } from "@/lib/learning/lesson-grounding";
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

function usableSummaryLine(text: string, source: string, example = ""): boolean {
  const cleaned = alignBounds(text.trim(), source);
  if (cleaned.length < 8 || cleaned.length > 240) return false;
  if (summaryLineProblem(cleaned) || vacuousSentence(cleaned)) return false;
  if (cleaned.includes("|") || foldTr(cleaned).includes("bu sayfadaki formuller")) return false;
  if (/[=+×*/\-−]\s*$/.test(cleaned)) return false;
  if (contradictorySentences(cleaned, source).length || placeholderWork(cleaned)) return false;
  if (summaryQuantityMismatch(cleaned, example, source)) return false;
  return true;
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
  if (
    (lesson.example && !exampleIsComplete(exampleText)) ||
    restatedResult(exampleText) ||
    restatedResult(sectionExample) ||
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
      if (ambiguousEnergyClaim(sentence, input.source) || overgeneralCorrection(sentence, input.source)) {
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
  const weak = summary.filter((line) => !usableSummaryLine(line, input.source, exampleText));
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

function cleanSentences(text: string, source: string, quotes: string[] = []): string {
  const kept = sentencesOf(text).filter((sentence) => {
    if (contradictorySentences(sentence, source).length) return false;
    if (vacuousSentence(sentence)) return false;
    if (placeholderWork(sentence) || restatedResult(sentence)) return false;
    if (ambiguousEnergyClaim(sentence, source) || overgeneralCorrection(sentence, source)) return false;
    if (quoteHits(sentence, quotes)) return false;
    if (/veri\s*:/i.test(sentence) && /ad[ıi]m\s*\d+/i.test(sentence) && !exampleIsComplete(sentence)) {
      return false;
    }
    return true;
  });
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
      .map((item) => alignBounds(item.trim(), source))
      .filter((item) => usableSummaryLine(item, source, examplePool(next)));
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
    const cleaned = alignBounds(line, source);
    if (!usableSummaryLine(cleaned, source, example)) continue;
    const key = foldTr(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    summary.push(cleaned);
    if (summary.length >= 5) return summary;
  }
  for (const sentence of teachingSentences(lesson, source)) {
    if (summary.length >= 5) break;
    const key = foldTr(sentence);
    if (seen.has(key) || !usableSummaryLine(sentence, source, example)) continue;
    seen.add(key);
    summary.push(sentence);
  }
  return summary;
}

function teachingSentences(lesson: LessonV2, source: string): string[] {
  const pool = [lesson.overview ?? "", ...lesson.sections.map((section) => section.body), source];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of pool) {
    for (const sentence of sentencesOf(text)) {
      const cleaned = alignBounds(sentence, source);
      if (summaryLineProblem(cleaned) || vacuousSentence(cleaned)) continue;
      if (contradictorySentences(cleaned, source).length) continue;
      if (placeholderWork(cleaned) || restatedResult(cleaned)) continue;
      if (ambiguousEnergyClaim(cleaned, source) || overgeneralCorrection(cleaned, source)) continue;
      if (summaryQuantityMismatch(cleaned, examplePool(lesson), source)) continue;
      const key = foldTr(cleaned);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

/** Onarımdan sonra hâlâ bozuk olan parça düşer. Soru uydurulmaz. */
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
          (/veri\s*:/i.test(sentence) && /ad[ıi]m\s*\d+/i.test(sentence)),
      )
    ) {
      strippedPlaceholder = true;
    }
    if (parts.some((sentence) => ambiguousEnergyClaim(sentence, source) || overgeneralCorrection(sentence, source) || quoteHits(sentence, quotes))) {
      mark("claim_wrong");
    }
    return cleanSentences(text, source, quotes);
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
  const exampleText = `${next.example?.prompt ?? ""}\n${next.example?.solution ?? ""}`;
  if (next.example && (!exampleIsComplete(exampleText) || restatedResult(exampleText))) {
    delete next.example;
    mark("example_incomplete");
  } else if (strippedPlaceholder && !exampleIsComplete(exampleText)) {
    mark("example_incomplete");
  }
  if (next.commonMistake) {
    const correction = next.commonMistake.correction;
    const correctionBad =
      overgeneralCorrection(correction, source) ||
      ambiguousEnergyClaim(correction, source) ||
      quoteHits(correction, quotes);
    if (correctionBad) {
      delete next.commonMistake;
      mark("claim_wrong");
    }
  }
  const summary = filledSummary(next, source);
  const previous = (lesson.summary ?? []).filter((line) => usableSummaryLine(line, source)).length;
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
    "Örnek ya tam olsun (verilen, yerine koyma, sayısal sonuç) ya da null.",
    "Tek cümlelik tekrar yazma. Verileni ve işlemi aynı sayıda göster: sonuç = bağıntı = verilen − sıfır.",
    "Adım 1 / Sonucu hesapla gibi yer tutucu yazma.",
    "Özet 3 ile 5 madde olsun. Her madde bildiren bir cümle olsun. Soru:, Cevap: ve ?: yazma.",
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

export async function repairLearnerLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
  complete: (prompt: string) => Promise<unknown>,
  verify?: (prompt: string) => Promise<unknown>,
): Promise<{ lesson: LessonV2; requested: LessonCheckCode[]; succeeded: LessonCheckCode[]; dropped: LessonCheckCode[] }> {
  const bounded = applyBoundFix(lesson, input.source);
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
  const remaining = new Set(auditLearnerLesson(finalized.lesson, input).map((issue) => issue.code));
  const removed = new Set(finalized.dropped);
  const succeeded = requested.filter((code) => !remaining.has(code) && !removed.has(code));
  const dropped = [...new Set([...finalized.dropped, ...remaining])];
  return { lesson: finalized.lesson, requested, succeeded, dropped };
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
