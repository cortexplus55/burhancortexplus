/**
 * Ders parçası cümle cümle silinince göndereni olmayan artık kalıyordu.
 *
 * "Bu sayı…", "Böylece…" ve "Örnek 2" tek başına yayına çıkıyordu; kontrol
 * sorusu da aynı artığın sonuna "Bu ifade doğru mudur?" eklenerek kuruluyordu.
 * Kapı öğretim birimine bakar: tanım, açıklama paragrafı ya da adımlı örnek.
 * Birim bozulursa kaynak metinden yeniden kurulur. Kaynak da yetmezse parça
 * düşer. Kırık cümle öğrenciye gitmez.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { auditQuantitative, repairQuantitative } from "@/lib/learning/tutor-quant";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const STOP = new Set([
  "bir",
  "bu",
  "su",
  "ile",
  "icin",
  "olan",
  "olarak",
  "gibi",
  "daha",
  "ise",
  "veya",
  "her",
  "hem",
  "gore",
  "sonra",
  "once",
  "kadar",
  "cok",
  "degil",
  "eden",
  "diye",
  "uzere",
  "yani",
  "maddenin",
  "madde",
]);

/** Bölümün ilk cümlesi bunlar ile başlıyorsa gönderen yoktur. */
const DANGLING =
  /^(?:bu\s+(?:sayi|ifade|kavram|ornek(?:lerle)?|formuller|yontem|islem|sonuc)|boylece|dolayisiyla|bu\s+yuzden|bu\s+nedenle|oysa|halbuki)\b/;

export function splitTeachingSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8);
}

function opener(sentence: string): string {
  return foldTr(sentence).replace(/^[^a-z0-9]+/, "");
}

/** "Bu sayı", "Böylece", "Bu örneklerle" — önceki cümle yoksa artık. */
export function danglingOpener(sentence: string): boolean {
  return DANGLING.test(opener(sentence));
}

function priorSupports(sentence: string, prior: string): boolean {
  if (!prior.trim()) return false;
  const folded = opener(sentence);
  const hay = foldTr(prior);
  if (/^bu sayi\b/.test(folded)) return /\d|avogadro|\bsayi\b/.test(hay);
  if (/ornek/.test(folded)) return /ornek/.test(hay);
  return true;
}

/**
 * Doğrulama bir cümleyi silince arkada kalan gönderensiz cümle de gider.
 * Göndereni duran "Bu sayıya Avogadro sayısı denir" kalır.
 */
export function retainAnchoredSentences(sentences: string[]): string[] {
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (!danglingOpener(sentence)) {
      kept.push(sentence);
      continue;
    }
    if (!priorSupports(sentence, kept.join(" "))) continue;
    kept.push(sentence);
  }
  return kept;
}

function hasWorkedSteps(text: string): boolean {
  const substituted =
    /\d+(?:[.,]\d+)?\s*[×xX*/÷]\s*\d/.test(text) ||
    /\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*=\s*\d/.test(text);
  const result = /(?:=|≈)\s*\d+(?:[.,]\d+)?/.test(text);
  return substituted && result;
}

/** "Örnek 2:" veya "hesaplayalım" var, yerine koyma ve sonuç yok. */
export function announcesIncompleteExample(text: string): boolean {
  const folded = foldTr(text);
  const announced = /\bornek\s*\d*\s*:/.test(folded) || /hesaplayalim/.test(folded);
  if (!announced) return false;
  return !hasWorkedSteps(text);
}

/**
 * "Bir maddenin kütlesi ise … buna mol kütlesi denir."
 * Özne, tanımlanan terimin sözcüklerini taşımıyorsa cümle bağlamından kesilmiştir.
 */
export function clippedContrastDefinition(sentence: string): boolean {
  const match = sentence.match(/^([\s\S]{0,90}?)\s+ise\s+[\s\S]{0,240}?\bbuna\s+(.{2,60}?)\s+denir\b/i);
  if (!match) return false;
  const subject = foldTr(match[1]);
  const termWords = foldTr(match[2])
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
  if (!termWords.length) return false;
  return termWords.some((word) => !subject.includes(word));
}

export function missingEarlierExample(text: string, lessonText: string): boolean {
  const match = foldTr(text).match(/\bornek\s*(\d+)\b/);
  if (!match) return false;
  const index = Number(match[1]);
  if (!Number.isFinite(index) || index <= 1) return false;
  const pool = foldTr(lessonText);
  for (let cursor = 1; cursor < index; cursor += 1) {
    if (!new RegExp(`\\bornek\\s*${cursor}\\b`).test(pool)) return true;
  }
  return false;
}

function gluedPrompt(prompt: string): boolean {
  return /bu ifade doğru mudur/i.test(prompt) || /[a-zçğıöşü]\s+Bu\s+(?:ifade|yargı)/.test(prompt);
}

function explanationRepeats(check: SectionCheck): boolean {
  const prompt = foldTr(check.prompt)
    .replace(/bu ifade dogru mudur\??/g, "")
    .replace(/bu yargi dogru mudur\??/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const explanation = foldTr(check.explanation).replace(/[^a-z0-9]+/g, "");
  if (prompt.length < 12 || explanation.length < 12) return false;
  return explanation === prompt;
}

export function bodyCoherenceIssue(text: string, lessonText = text): string | null {
  const sentences = splitTeachingSentences(text);
  if (!sentences.length && text.trim().length >= 20) return "empty";
  let prior = "";
  for (const sentence of sentences) {
    if (danglingOpener(sentence) && !priorSupports(sentence, prior)) return "anaphor";
    if (clippedContrastDefinition(sentence)) return "clipped_definition";
    if (announcesIncompleteExample(sentence)) return "incomplete_example";
    if (missingEarlierExample(sentence, lessonText) && announcesIncompleteExample(text)) {
      return "missing_example";
    }
    prior = `${prior} ${sentence}`;
  }
  if (missingEarlierExample(text, lessonText) && !hasWorkedSteps(text)) return "missing_example";
  return null;
}

export function checkCoherenceIssue(check: SectionCheck): string | null {
  if (gluedPrompt(check.prompt)) return "glued_prompt";
  if (danglingOpener(check.prompt)) return "anaphor";
  if (clippedContrastDefinition(check.prompt)) return "clipped_definition";
  if (announcesIncompleteExample(check.prompt)) return "incomplete_example";
  if (explanationRepeats(check)) return "repeated_feedback";
  if (/kendi anlamina bagliyor/.test(foldTr(`${check.explanation} ${check.whyRight ?? ""}`))) {
    return "echo_feedback";
  }
  return null;
}

function lessonBlob(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading}\n${section.body}`),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
}

/** Öğrenciye gidecek metindeki kırıklar. Sağlam ders boş dizi döner. */
export function coherenceFailures(lesson: LessonV2): string[] {
  const issues: string[] = [];
  const blob = lessonBlob(lesson);
  if (lesson.overview && bodyCoherenceIssue(lesson.overview, blob)) issues.push("overview");
  lesson.sections.forEach((section, index) => {
    const body = bodyCoherenceIssue(section.body, blob);
    if (body) issues.push(`section:${index}:${body}`);
    if (section.check) {
      const check = checkCoherenceIssue(section.check);
      if (check) issues.push(`check:${index}:${check}`);
    }
  });
  if (lesson.example) {
    const example = `${lesson.example.prompt}\n${lesson.example.solution}`;
    if (announcesIncompleteExample(example) || (hasWorkedSteps(example) && !quantitativeOk(example, example))) {
      issues.push("example");
    }
  }
  const summary = lesson.summary ?? [];
  if (summary.some((line) => bodyCoherenceIssue(line, blob))) issues.push("summary");
  if (summaryRelistsFragments(lesson)) issues.push("summary_relist");
  return issues;
}

function summaryRelistsFragments(lesson: LessonV2): boolean {
  const lines = lesson.summary ?? [];
  if (lines.length < 3) return false;
  const broken = lesson.sections.some((section) => bodyCoherenceIssue(section.body, lessonBlob(lesson)));
  if (!broken) return false;
  const bodies = lesson.sections.map((section) => foldTr(section.body));
  const copies = lines.filter((line) => {
    const folded = foldTr(line);
    return bodies.some((body) => body.includes(folded));
  });
  return copies.length >= Math.min(3, lines.length);
}

function quantitativeOk(text: string, source: string): boolean {
  const audit = auditQuantitative(text, source);
  if (audit.ok) return true;
  const repaired = repairQuantitative(text, audit);
  return auditQuantitative(repaired, source).ok;
}

function verifyQuantitative(text: string, source: string): string | null {
  const audit = auditQuantitative(text, source);
  const repaired = repairQuantitative(text, audit);
  if (!auditQuantitative(repaired, source).ok) return null;
  return repaired;
}

export function honestReadingMinutes(lesson: Pick<LessonV2, "overview" | "sections" | "example" | "summary" | "commonMistake" | "infoCheck">): number {
  const text = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading} ${section.body} ${section.check?.prompt ?? ""}`),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
    lesson.infoCheck?.prompt ?? "",
    ...(lesson.summary ?? []),
  ].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(40, Math.round(words / 130)));
}

/** Plan 27 dk deyip metin 6 cümleyse yol etiketi okuma süresine iner. */
export function shouldReplacePlannedMinutes(planned: number, honest: number): boolean {
  if (!Number.isFinite(planned) || !Number.isFinite(honest)) return false;
  if (planned < 8 || honest < 1) return false;
  return honest * 2 < planned;
}

function finishSentence(text: string): string {
  let next = text.replace(/\s+/g, " ").trim();
  next = next.replace(/([a-zçğıöşü0-9])\s+(Bu\s+(?:ifade|yargı|sayı))/g, "$1. $2");
  if (!/[.!?…]["”']?$/.test(next)) next = `${next.replace(/[;,\s]+$/g, "")}.`;
  return next;
}

/** Kavramın kendi cümlesinden doğru/yanlış. Artığa soru eklenmez. */
export function conceptCheck(statement: string): SectionCheck | null {
  const stripped = statement
    .replace(/\s*bu ifade doğru mudur\??/gi, "")
    .replace(/\s*bu yargı doğru mudur\??/gi, "")
    .trim();
  const prompt = finishSentence(stripped);
  if (prompt.length < 12 || prompt.length > 300) return null;
  if (danglingOpener(prompt) || clippedContrastDefinition(prompt) || announcesIncompleteExample(prompt)) {
    return null;
  }
  const words = prompt.replace(/[?.!]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 4) return null;
  const whyRight = "Bu yargı kaynağın kurduğu tanımla uyumludur.";
  const whyWrong = "Bu yargı kaynağın kurduğu tanımla çelişir.";
  const misconception = "Tanımı başka bir büyüklüğe bağlamak hatadır";
  const hint = "Özneyi ve yüklemi ayrı ayrı oku.";
  return {
    type: "trueFalse",
    prompt,
    options: ["Doğru", "Yanlış"],
    answerIndex: 0,
    explanation: `${whyWrong} Yanılgı: ${misconception}. İpucu: ${hint}`,
    whyRight,
    whyWrong,
    misconception,
    hint,
  };
}

type SourceUnit = { cite: string; text: string };

function parseSourceUnits(source: string): SourceUnit[] {
  const blocks: SourceUnit[] = [];
  const marked = [...source.matchAll(/\[s\.(\d+)\]\s*([^:\n]{1,80}):\s*([\s\S]*?)(?=\n?\[s\.\d+\]|$)/g)];
  if (marked.length) {
    for (const match of marked) {
      blocks.push({ cite: `${match[2].trim()}, s.${match[1]}`, text: match[3].trim() });
    }
  } else if (source.trim()) {
    blocks.push({ cite: "", text: source.trim() });
  }
  const units: SourceUnit[] = [];
  for (const block of blocks) {
    const sentences = splitTeachingSentences(block.text.replace(/\[Sayfa metni kısaltıldı\.\]/gi, ""));
    let bucket: string[] = [];
    const flush = () => {
      let text = retainAnchoredSentences(bucket).join(" ").replace(/\s+/g, " ").trim();
      bucket = [];
      if (missingEarlierExample(text, text) && hasWorkedSteps(text)) {
        text = text.replace(/örnek\s*\d+\s*:/gi, "Örnek:");
      }
      if (text.length < 40) return;
      if (bodyCoherenceIssue(text, text)) return;
      units.push({ cite: block.cite, text });
    };
    for (const sentence of sentences) {
      const folded = foldTr(sentence);
      if (bucket.length && /\bornek\s*\d*\s*:/.test(folded)) flush();
      bucket.push(sentence);
      if (bucket.length >= 5 && !announcesIncompleteExample(bucket.join(" "))) flush();
    }
    flush();
  }
  return units;
}

function stemSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 4 || STOP.has(word)) continue;
    out.add(word.slice(0, 6));
  }
  return out;
}

function overlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function withCitation(text: string, cite: string): string {
  if (!cite || foldTr(text).includes(foldTr(cite))) return text;
  const line = `Kaynak: ${cite}.`;
  if (text.includes(line)) return text;
  return `${text.replace(/\s+$/g, "")} ${line}`.trim();
}

function formulaNote(text: string): { title: string; body: string; tone: "info" } | null {
  const equation = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find((part) => /=/.test(part) && /[A-Za-z]/.test(part) && part.length >= 10 && part.length <= 180);
  if (!equation) return null;
  const body = finishSentence(equation.replace(/^kaynak:.*$/i, "").trim());
  if (body.length < 10 || body.length > 320) return null;
  return { title: "Temel bağıntı", body, tone: "info" };
}

function distinctiveNumbers(text: string): Set<string> {
  const stripped = text.replace(/örnek\s*\d+/gi, " ");
  const found = new Set<string>();
  for (const match of stripped.matchAll(/\d+(?:[.,]\d+)?/g)) {
    found.add(match[0].replace(",", "."));
  }
  return found;
}

/** İlan edilen örneğin sayıları duran pencere, daha uzun başka bir örnekten önce gelir. */
function workedWindow(source: string, hint = ""): string | null {
  const units = parseSourceUnits(source);
  const pool = units.length ? units.map((unit) => unit.text) : splitTeachingSentences(source);
  const wanted = distinctiveNumbers(hint);
  let best = "";
  let bestRank = -1;
  for (const text of pool) {
    if (!hasWorkedSteps(text)) continue;
    if (!quantitativeOk(text, source)) continue;
    let shared = 0;
    if (wanted.size) {
      const have = distinctiveNumbers(text);
      for (const value of wanted) if (have.has(value)) shared += 1;
    }
    const rank = shared * 1000 + text.length;
    if (rank > bestRank) {
      bestRank = rank;
      best = text;
    }
  }
  return best || null;
}

function exampleFromSource(source: string, hint = ""): { prompt: string; solution: string } | null {
  const window = workedWindow(source, hint);
  if (!window) return null;
  const solution = verifyQuantitative(window, source);
  if (!solution || !hasWorkedSteps(solution)) return null;
  const stepped = formatWorkedSteps(solution);
  const shown = verifyQuantitative(stepped, source) ?? solution;
  const given = shown.match(/\d+(?:[.,]\d+)?\s*[A-Za-z°µ%³²/]+/)?.[0] ?? "";
  const prompt = given
    ? finishSentence(`${given} verildiğine göre sonuç nedir?`).replace(/\.$/, "?")
    : "Verilenlere göre sonuç nedir?";
  if (!prompt.endsWith("?")) return null;
  return { prompt: prompt.slice(0, 300), solution: shown.slice(0, 1500) };
}

type GlossaryEntry = { term: string; sentence: string };

function definitionEntries(text: string): GlossaryEntry[] {
  const found: GlossaryEntry[] = [];
  for (const sentence of retainAnchoredSentences(splitTeachingSentences(text))) {
    if (danglingOpener(sentence) || clippedContrastDefinition(sentence) || announcesIncompleteExample(sentence)) {
      continue;
    }
    const match = sentence.match(/^([A-ZÇĞİÖŞÜ][^,]{1,48}),\s+\S/);
    if (!match) continue;
    const folded = foldTr(sentence);
    if (!/denir|tanimlan|sayisidir|kutlesidir|birimidir|birimdir|anlamina gelir/.test(folded)) continue;
    const term = match[1].trim();
    if (term.length < 2 || term.length > 60) continue;
    if (found.some((item) => foldTr(item.term) === foldTr(term))) continue;
    found.push({ term, sentence: finishSentence(sentence) });
  }
  return found;
}

/**
 * "Çekirdek: genetik bilgiyi taşır." gibi kardeş maddeler kart olur.
 * Kaynakta bu kalıp yoksa kart üretilmez.
 */
export function parallelCards(text: string): { title: string; body: string }[] | null {
  const found: { title: string; body: string }[] = [];
  for (const sentence of splitTeachingSentences(text)) {
    const match = sentence.match(/^([A-ZÇĞİÖŞÜ][^:]{1,40}):\s+(.{8,220})/);
    if (!match) continue;
    const title = match[1].trim();
    const body = finishSentence(match[2]);
    if (foldTr(title) === "kaynak" || /^ornek\b/.test(foldTr(title))) continue;
    if (title.length < 2 || found.some((card) => foldTr(card.title) === foldTr(title))) continue;
    found.push({ title: title.slice(0, 80), body: body.slice(0, 320) });
  }
  if (found.length < 2 || found.length > 6) return null;
  return found;
}

/** Çözüm, verilen / bağıntı / yerine koyma / sonuç satırlarına ayrılır. Sayılar değişmez. */
export function formatWorkedSteps(solution: string): string {
  if (/verilen\s*:|yerine koyma\s*:|ad[ıi]m\s*1/i.test(solution)) return solution;
  if (!hasWorkedSteps(solution)) return solution;
  const symbolic = solution.match(
    /([A-Za-zΔδ][A-Za-z0-9_Δδ]*)\s*=\s*([A-Za-z0-9_Δδ\s×*/÷+().]+?)(?=\s*=\s*\d)/,
  );
  const numeric = solution.match(
    /(\d+(?:[.,]\d+)?(?:\s*[×xX*/÷+\-−]\s*\d+(?:[.,]\d+)?)+)\s*=\s*(\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ%/³²]+)?)/,
  );
  if (!numeric) return solution;
  const given = solution.match(/(\d+(?:[.,]\d+)?\s*[A-Za-z°µ%³²/]+(?:\s+[A-Za-z0-9₀-₉]+){0,3})/);
  const lines = [
    given ? `Verilen: ${given[1].trim()}.` : "",
    "İstenen: işlemin sonucu, birimiyle.",
    symbolic ? `Bağıntı: ${symbolic[0].replace(/\s+/g, " ").trim()}.` : "",
    `Yerine koyma: ${numeric[1].replace(/\s+/g, " ")} = ${numeric[2].trim()}.`,
    `Sonuç: ${numeric[2].trim()}.`,
  ].filter(Boolean);
  return lines.join("\n");
}

function glossaryScore(option: string, entry: GlossaryEntry): number {
  return overlap(stemSet(option), stemSet(`${entry.term} ${entry.sentence}`));
}

function withOptionReasons(check: SectionCheck, glossary: GlossaryEntry[]): SectionCheck {
  if (check.type !== "mcq" || check.options.length < 3) return check;
  if (check.optionWhy && check.optionWhy.length === check.options.length) return check;
  const answer = glossary.slice().sort(
    (left, right) => glossaryScore(check.options[check.answerIndex] ?? "", right) - glossaryScore(check.options[check.answerIndex] ?? "", left),
  )[0];
  const why = check.options.map((option, index) => {
    if (index === check.answerIndex) {
      const reason = answer && glossaryScore(option, answer) > 0 ? answer.sentence : check.whyRight;
      return (reason || "Bu seçenek kaynağın tanımına uyar.").slice(0, 200);
    }
    const ranked = glossary
      .filter((entry) => !answer || foldTr(entry.term) !== foldTr(answer.term))
      .slice()
      .sort((left, right) => glossaryScore(option, right) - glossaryScore(option, left));
    const hit = ranked[0] && glossaryScore(option, ranked[0]) > 0 ? ranked[0] : null;
    if (hit) return `${hit.term} başka bir tanımdır. ${hit.sentence}`.slice(0, 200);
    return `${option} sorulan tanıma uymaz.`.slice(0, 200);
  });
  if (why.some((line) => line.length < 8)) return check;
  const wrongs = why.filter((_, index) => index !== check.answerIndex).join(" ");
  return {
    ...check,
    optionWhy: why,
    explanation: wrongs.length >= 12 ? wrongs.slice(0, 600) : check.explanation,
  };
}

function enrichTeachingShape(lesson: LessonV2, source: string): LessonV2 {
  const glossary = definitionEntries(
    [source, ...lesson.sections.map((section) => section.body)].join("\n"),
  );
  const sections = lesson.sections.map((section) => {
    const next = { ...section };
    const defined = definitionEntries(section.body)[0];
    if (defined && !next.note) {
      next.note = {
        title: defined.term.slice(0, 80),
        body: defined.sentence.slice(0, 400),
        tone: "info",
      };
    }
    if (!next.note) {
      const formula = formulaNote(section.body);
      if (formula) next.note = formula;
    }
    if (!next.cards) {
      const cards = parallelCards(section.body);
      if (cards) next.cards = cards;
    }
    if (next.check) next.check = withOptionReasons(next.check, glossary);
    return next;
  });
  const next: LessonV2 = { ...lesson, sections };
  if (next.example?.solution) {
    const stepped = formatWorkedSteps(next.example.solution);
    const verified = verifyQuantitative(stepped, source || next.example.solution);
    if (verified && hasWorkedSteps(verified)) next.example = { ...next.example, solution: verified };
  }
  return next;
}

function firstDefinition(text: string): string | null {
  for (const sentence of retainAnchoredSentences(splitTeachingSentences(text))) {
    if (danglingOpener(sentence) || clippedContrastDefinition(sentence)) continue;
    if (announcesIncompleteExample(sentence)) continue;
    const folded = foldTr(sentence);
    if (/denir|tanimlan|sayisidir|kutlesidir|birimidir|olur|yazilir/.test(folded) || /=/.test(sentence)) {
      return finishSentence(sentence);
    }
  }
  return null;
}

function synthesizeSummary(lesson: LessonV2, topic: string): string[] {
  const lines: string[] = [];
  const push = (line: string) => {
    const clean = finishSentence(line);
    if (clean.length < 12 || clean.length > 240) return;
    if (bodyCoherenceIssue(clean, clean)) return;
    if (lines.some((item) => foldTr(item) === foldTr(clean))) return;
    lines.push(clean);
  };
  const name = topic.trim() || lesson.title;
  push(`${name} konusunda tanım, gerekçe ve uygulama aynı anlatıda durur.`);
  for (const section of lesson.sections) {
    const definition = firstDefinition(section.body);
    if (definition) push(definition);
    if (lines.length >= 4) break;
  }
  if (lesson.example && hasWorkedSteps(lesson.example.solution)) {
    push(`Çözümlü örnekte verilen, formül, yerine koyma ve sonuç birlikte durur.`);
  }
  if (lesson.commonMistake?.correction) push(lesson.commonMistake.correction);
  return lines.slice(0, 5);
}

function clippedSentences(lesson: LessonV2): string[] {
  const found: string[] = [];
  for (const section of lesson.sections) {
    for (const sentence of splitTeachingSentences(section.body)) {
      if (clippedContrastDefinition(sentence)) found.push(sentence);
    }
  }
  for (const line of lesson.summary ?? []) {
    if (clippedContrastDefinition(line)) found.push(line);
  }
  return found;
}

function correctionForClip(source: string, clip: string): string | null {
  const wanted = stemSet(clip);
  let best: { text: string; score: number } | null = null;
  for (const unit of parseSourceUnits(source)) {
    for (const sentence of splitTeachingSentences(unit.text)) {
      if (clippedContrastDefinition(sentence) || danglingOpener(sentence)) continue;
      const score = overlap(wanted, stemSet(sentence));
      if (score < 1) continue;
      if (!best || score > best.score) best = { text: finishSentence(sentence), score };
    }
  }
  return best?.text ?? null;
}

/**
 * Kırık dersi kaynak birimlerinden kurar. Sağlam derse dokunmaz.
 * Ek model çağrısı yok.
 */
export function publishCoherentLesson(
  lesson: LessonV2,
  source: string,
  topicLabel: string,
  options: { targetMinutes?: number } = {},
): LessonV2 {
  const failures = coherenceFailures(lesson);
  if (!failures.length) return lesson;
  const units = parseSourceUnits(source);
  const used = new Set<number>();
  const topicStems = stemSet(`${topicLabel} ${lesson.title}`);
  const pick = (heading: string, body: string): SourceUnit | null => {
    let bestIndex = -1;
    let bestScore = 0;
    const want = stemSet(`${heading} ${body} ${topicLabel}`);
    for (let index = 0; index < units.length; index += 1) {
      if (used.has(index)) continue;
      const unit = units[index];
      if (!unit) continue;
      const score = overlap(want, stemSet(unit.text)) + overlap(topicStems, stemSet(unit.text));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestScore < 1) return null;
    const candidate = units[bestIndex];
    const headingStems = stemSet(`${heading} ${topicLabel}`);
    if (!candidate || overlap(headingStems, stemSet(candidate.text)) < 1) return null;
    const chosen = bestIndex;
    used.add(chosen);
    return units[chosen] ?? null;
  };

  const sections = lesson.sections.map((section) => {
    const blob = lessonBlob(lesson);
    const bodyBroken = Boolean(bodyCoherenceIssue(section.body, blob));
    const checkBroken = section.check ? Boolean(checkCoherenceIssue(section.check)) : false;
    if (!bodyBroken && !checkBroken) return section;
    const unit = bodyBroken ? pick(section.heading, section.body) : null;
    const body = unit ? withCitation(unit.text, unit.cite) : bodyBroken ? "" : section.body;
    if (body.length < 20) return null;
    const next = { ...section, body: body.slice(0, 2400) };
    if (unit) {
      const note = formulaNote(unit.text);
      if (note && !next.note) next.note = note;
    }
    if (!next.check || checkBroken || (section.check && checkCoherenceIssue(section.check))) {
      const seed = firstDefinition(body) ?? retainAnchoredSentences(splitTeachingSentences(body))[0];
      const check = seed ? conceptCheck(seed) : null;
      if (check) next.check = check;
      else delete next.check;
    }
    return next;
  }).filter((section): section is LessonV2["sections"][number] => Boolean(section));

  const cap = Math.min(Math.max(options.targetMinutes ?? 5, 4), 8);
  let drafted: LessonV2 = { ...lesson, sections };
  while (units.length && honestReadingMinutes(drafted) < cap && drafted.sections.length < 5) {
    const spare = units.findIndex((_, index) => !used.has(index));
    if (spare < 0) break;
    const unit = units[spare];
    used.add(spare);
    if (!unit || overlap(topicStems, stemSet(unit.text)) < 1) continue;
    const heading = topicLabel.trim().slice(0, 80) || lesson.title;
    const seed = firstDefinition(unit.text);
    const check = seed ? conceptCheck(seed) : null;
    const section: LessonV2["sections"][number] = {
      heading: heading.length >= 2 ? heading : "Konu",
      body: withCitation(unit.text, unit.cite).slice(0, 2400),
    };
    const note = formulaNote(unit.text);
    if (note) section.note = note;
    if (check) section.check = check;
    drafted = { ...drafted, sections: [...drafted.sections, section] };
  }

  if (!drafted.sections.length && units[0]) {
    const unit = units[0];
    const seed = firstDefinition(unit.text);
    drafted = {
      ...drafted,
      sections: [
        {
          heading: topicLabel.trim().slice(0, 80) || lesson.title,
          body: withCitation(unit.text, unit.cite).slice(0, 2400),
          ...(seed && conceptCheck(seed) ? { check: conceptCheck(seed) ?? undefined } : {}),
        },
      ],
    };
  }

  const clips = clippedSentences(lesson);
  if (clips[0]) {
    const correction = correctionForClip(source, clips[0]);
    if (correction && foldTr(correction) !== foldTr(clips[0])) {
      drafted.commonMistake = {
        claim: finishSentence(clips[0]).slice(0, 400),
        correction: correction.slice(0, 400),
      };
    }
  }

  const announced = lesson.sections
    .map((section) => section.body)
    .filter((body) => announcesIncompleteExample(body) || missingEarlierExample(body, lessonBlob(lesson)))
    .join("\n");
  const example = exampleFromSource(source, announced);
  if (example && (!drafted.example || announcesIncompleteExample(`${drafted.example.prompt}\n${drafted.example.solution}`))) {
    drafted.example = example;
  } else if (drafted.example) {
    const solution = verifyQuantitative(drafted.example.solution, source || drafted.example.solution);
    if (!solution || announcesIncompleteExample(`${drafted.example.prompt}\n${solution}`)) {
      delete drafted.example;
    } else {
      drafted.example = { ...drafted.example, solution };
    }
  }

  if (!drafted.overview || bodyCoherenceIssue(drafted.overview, lessonBlob(drafted))) {
    const opening = (units[0] ? splitTeachingSentences(units[0].text) : [])
      .filter(
        (sentence) =>
          !danglingOpener(sentence) &&
          !announcesIncompleteExample(sentence) &&
          !clippedContrastDefinition(sentence),
      )
      .slice(0, 2)
      .map((sentence) => finishSentence(sentence));
    if (opening.length) drafted.overview = opening.join(" ").slice(0, 1500);
    else delete drafted.overview;
  }

  const summary = synthesizeSummary(drafted, topicLabel);
  if (summary.length >= 3) drafted.summary = summary;
  else if (drafted.summary?.some((line) => bodyCoherenceIssue(line, lessonBlob(drafted)))) {
    delete drafted.summary;
  }

  if (drafted.infoCheck && (danglingOpener(drafted.infoCheck.prompt) || gluedPrompt(drafted.infoCheck.prompt))) {
    const seed = firstDefinition(drafted.sections.map((section) => section.body).join(" "));
    if (seed) {
      drafted.infoCheck = {
        prompt: seed.replace(/[.]+$/g, "").slice(0, 180) + " ne anlama gelir?",
        answer: seed.slice(0, 400),
      };
    } else {
      delete drafted.infoCheck;
    }
  }

  if (drafted.sections.length) return enrichTeachingShape(drafted, source);
  const kept = lesson.sections.filter((section) => !bodyCoherenceIssue(section.body, lessonBlob(lesson)));
  return enrichTeachingShape({ ...lesson, sections: kept }, source);
}
