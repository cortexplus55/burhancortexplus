/**
 * Ders üretiminin öğretim kapısı.
 *
 * Model tek yapılandırılmış ders yazar. Burada kaynak yalnızca konunun
 * kendi sayfalarına indirilir. Örnek tamlığı `exampleIsComplete` ve
 * `announcedExampleGap` ile, eşitlik ve kesin hüküm `auditQuantitative`
 * ile bakılır. Yazım `fluencyIssues` sözlüğüyle onarılır; podcast, quiz
 * ve sözlü aynı kapıları kullanır. Tek onarımdan sonra kapı hâlâ
 * doluysa ders silinmez: doğrulanamayan cümle çıkarılır ya da işaretlenir
 * ve elde kalan ders açılır. Model çağrısı düşmediyse öğrenci boş ekran görmez.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { titleConcepts } from "@/lib/learning/lesson-claims";
import { groundLearnerLesson } from "@/lib/learning/lesson-grounding";
import { fluencyIssues, repairTurkishSurface, sentences } from "@/lib/learning/learner-fluency";
import { announcedExampleGap, exampleIsComplete } from "@/lib/learning/lesson-repair";
import { auditQuantitative, evaluateArithmetic, repairQuantitative } from "@/lib/learning/tutor-quant";
import { groundProseCalculations, workedExampleIssues } from "@/lib/learning/worked-example";
import { topicMatchKey } from "@/lib/learning/topic-merge";
import {
  lessonV2Schema,
  type LessonV2,
  type SectionCheck,
} from "@/lib/learning/teaching-standards";

export const LESSON_TEACH_RULE = [
  "DERSİ TEK JSON OLARAK YAZ. Kaynak cümlesini art arda dizmek ders değildir.",
  "overview kancadır: konuya girmeden önce kaynağın kurduğu tek durum. İlk bölümün cümlesini kopyalama. Uydurma benzetme yazma; benzetme ancak kaynakla çelişmiyorsa overview veya bir notta durur.",
  "Her heading kavramın adıdır. Gövde o başlığın vaadini anlatır: başlık örnek veya hesap diyorsa gövdede çözülmüş sayı vardır. Başka dosyanın konusu gövdeye girmez.",
  "Konunun kendi terimi için note tanım kutusudur: {title, body, tone:\"info\"}.",
  "Kaynakta eşitlik varsa formülü eksiksiz yaz. Parantez kapanır. Aritmetik tamdır: 12 + 2 × 16 = 44 g/mol gibi, yarım çarpım yazılmaz.",
  "commonMistake yanlış inancı ve gerekçeli düzeltmeyi taşır.",
  "Nicel konuda example tam çözülmüş örnektir. solution satırları: Verilen: … İstenen: … Bağıntı: … Yerine koyma: … Sonuç: … birimle. Çözümdeki her sayı verilenlerde ya da önceki adımda durur. Kaynakta örnek varsa onu kullan. Yoksa kaynaktaki sabitlerle bir örnek kur; ara sonucu kendin hesapla, uydurma sonuç yazma. Sözel konuda sayı uydurma; kaynağın olayını adım adım analiz et.",
  "Hesabı yazmadan önce veriyi söyle. Verisi söylenmemiş eşitlik yazma.",
  "sadece, asla, her zaman, tek bir, hiçbir, only, never, always gibi kesin hüküm ancak kaynak aynı sözü kuruyorsa yazılır.",
  "Kontrol, konunun becerisini ölçer ve ders cümlesini tekrar etmez. Kaynak zenginse en az beş çeşitli kontrol yaz: mcq, doğru/yanlış, sayısal, öğrencinin kendisinin yazdığı. Nicel konuda en az bir mcq hesap sorar. Çeldirici gerçek işlem hatasıdır: çarpma yerine bölme, ters bölme, verilen sayıyı sonuç sanma. optionWhy her şıkka tek başına okunan bir cümledir. explanation gerekçeyi söyler, soru cümlesini ve 'kendi anlamına bağlıyor' kalıbını tekrarlamaz. Doğru/yanlış yalnızca iki taraf da anlamlıysa.",
  "check.review aynı fikri başka açıdan sorar. Cümlenin sonuna 'yargısı doğru mudur?' eklemek tekrar değildir.",
  "summary üç maddedir: kural, sık hata, uygulama. Bölüm cümlesini kopyalama. 'Diğer' ya da zamirle başlayan bağlamsız madde yazma.",
  "Aynı konuyu işleyen her kaynak parçası kullanılır. Tek dosyaya sıkışma.",
  "Kaynak [s.N] dosya biçimindeyse bölümün sonuna Kaynak: dosya, s.N yaz.",
  "Cümle yüklemle biter. Cümle ortasında sıradan ad büyük harfle başlamaz.",
  "Anlatım yaklaşık 5 dakikalık okuma olsun. Aynı cümleyi tekrarlayarak uzatma.",
].join(" ");

const CRITICAL = new Set([
  "fluency",
  "off_title",
  "echo_check",
  "missing_example",
  "invented_number",
  "identity",
  "absolute_check",
]);

export { fluencyIssues } from "@/lib/learning/learner-fluency";

const STOP = new Set([
  "bir",
  "bu",
  "ile",
  "icin",
  "olan",
  "olarak",
  "gibi",
  "daha",
  "veya",
  "her",
  "gore",
  "sonra",
  "kadar",
  "degil",
  "eden",
  "uzere",
  "yani",
  "diye",
]);

export type TeachingFailure = { unit: string; problem: string };

export type TopicPageSpan = { fileName: string; pages: number[] };

export function topicTitlesAlign(left: string, right: string): boolean {
  const a = topicMatchKey(left);
  const b = topicMatchKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 10 && long.includes(short);
}

function fileKey(name: string): string {
  return foldTr(name)
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function filesMatch(left: string, right: string): boolean {
  const a = fileKey(left);
  const b = fileKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 6 && long.includes(short);
}

export function selectTopicPages<T extends { fileName: string; pageNumber: number }>(
  pages: T[],
  spans: TopicPageSpan[],
): T[] {
  if (!spans.length) return pages;
  return pages.filter((page) =>
    spans.some(
      (span) => filesMatch(span.fileName, page.fileName) && span.pages.includes(page.pageNumber),
    ),
  );
}

type CiteBlock = { file: string; page: number; text: string };

function sourceBlocks(source: string): CiteBlock[] {
  return [...source.matchAll(/\[s\.(\d+)\]\s*([^:\n]{1,80}):\s*([\s\S]*?)(?=\n?\[s\.\d+\]|$)/g)].map(
    (match) => ({
      page: Number(match[1]),
      file: match[2].trim(),
      text: match[3].trim(),
    }),
  );
}

/** Konu haritasındaki dosya ve sayfa dışındaki bloklar derse girmez. */
export function filterSourceToSpans(source: string, spans: TopicPageSpan[]): string {
  if (!spans.length || !source.trim()) return source;
  const blocks = sourceBlocks(source);
  if (!blocks.length) return source;
  const kept = blocks.filter((block) =>
    spans.some((span) => filesMatch(span.fileName, block.file) && span.pages.includes(block.page)),
  );
  if (!kept.length) return "";
  return kept
    .map((block) => `[s.${block.page}] ${block.file}: ${block.text}`.trim())
    .join("\n\n");
}

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 4 || STOP.has(word)) continue;
    out.add(word.slice(0, 6));
  }
  return out;
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function hasWorked(text: string): boolean {
  return (
    /\d+(?:[.,]\d+)?(?:\s*[×xX*/+]\s*\d+(?:[.,]\d+)?)+/.test(text) &&
    /(?:=|≈)\s*\d+(?:[.,]\d+)?/.test(text)
  );
}

/** Zincir ve sonuç aynı ifadede. Kaynakta gerçek çözülmüş örnek var mı. */
function hasCompletedChain(text: string): boolean {
  return /\d+(?:[.,]\d+)?(?:\s*[×xX*/+\-−–]\s*\d+(?:[.,]\d+)?)+\s*[=≈]\s*\d+(?:[.,]\d+)?/.test(
    expandForChain(text),
  );
}

function expandForChain(text: string): string {
  let next = text;
  for (let depth = 0; depth < 4; depth += 1) {
    const inner = next.match(/\(([^()]*)\)/);
    if (!inner || !/\d/.test(inner[1] ?? "")) break;
    const value = evaluateArithmetic(inner[1] ?? "");
    if (value == null) break;
    next = next.replace(inner[0], String(Math.round(value * 1000) / 1000));
  }
  return next;
}

export function topicIsQuantitative(source: string): boolean {
  if (/[A-Za-zΔδ]\s*=\s*[^.\n]{0,48}[A-Za-z0-9]/.test(source)) return true;
  return /\d+(?:[.,]\d+)?\s*[×xX*/+]\s*\d/.test(source);
}

function bodyGroundedInSource(body: string, source: string): boolean {
  if (!source.trim()) return false;
  const core = foldTr(body)
    .replace(/kaynak\s*:.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const snippet = core.slice(0, 48).trim();
  const hay = foldTr(source).replace(/[^a-z0-9]+/g, " ");
  if (snippet.length >= 24 && hay.includes(snippet)) return true;
  const nums = numberKeys(body).filter((key) => Number(key) >= 3);
  const have = new Set(numberKeys(source));
  if (nums.length >= 2 && nums.every((key) => have.has(key))) return true;
  return overlapCount(stems(body), stems(source)) >= 3;
}

export function sectionMissesTitle(heading: string, body: string, topic: string, source = ""): boolean {
  const blob = `${heading}. ${body}`;
  if (announcedExampleGap(blob)) return true;
  const head = foldTr(heading);
  if (/ornek|cozum/.test(head) && !exampleIsComplete(body) && !bodyGroundedInSource(body, source)) {
    return true;
  }
  if (topic && topicTitlesAlign(heading, topic)) return false;
  const shared = overlapCount(stems(heading), stems(body));
  if (body.trim().length >= 40 && shared < 1 && !bodyGroundedInSource(body, source)) return true;
  return false;
}

function nearCopy(left: string, right: string): boolean {
  const a = left.replace(/[^a-z0-9]+/g, " ").trim();
  const b = right.replace(/[^a-z0-9]+/g, " ").trim();
  if (a.length < 24 || b.length < 24) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const window = 40;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < window) return false;
  for (let index = 0; index + window <= shorter.length; index += 4) {
    if (longer.includes(shorter.slice(index, index + window))) return true;
  }
  return false;
}

function lessonSentences(lesson: LessonV2): string[] {
  return [
    lesson.overview ?? "",
    ...lesson.sections.flatMap((section) => [section.body, section.note?.body ?? ""]),
  ].flatMap((text) => sentences(text));
}

export function checkEchoes(check: SectionCheck, lesson: LessonV2, sectionBody: string): boolean {
  const explanation = foldTr(`${check.explanation} ${check.whyRight ?? ""}`);
  if (/kendi anlamina bagliyor/.test(explanation)) return true;
  const prompt = foldTr(check.prompt)
    .replace(/\s*yargisi dogru mudur.*$/, "")
    .replace(/\s*dogru mu.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const explained = foldTr(check.explanation).replace(/[^a-z0-9]+/g, " ").trim();
  if (prompt.length >= 20 && (explained === prompt || explained.includes(prompt))) return true;
  const corpus = [...lessonSentences(lesson), ...sentences(sectionBody)];
  return corpus.some((sentence) => nearCopy(prompt, foldTr(sentence)));
}

function identityCorpus(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map(
      (section) => `${section.body} ${section.note?.body ?? ""} ${section.check?.explanation ?? ""}`,
    ),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
}

function lessonProse(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading} ${section.body} ${section.note?.body ?? ""}`),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.claim ?? "",
    lesson.commonMistake?.correction ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
}

function numberKeys(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", "."));
}

function inventedNumbers(text: string, source: string): string[] {
  const have = new Set(numberKeys(source));
  return [...new Set(numberKeys(text).filter((key) => Number(key) >= 3 && !have.has(key)))];
}

/**
 * Tamamlanmış örnek, podcast ile aynı kapıdadır: verilen, yerine koyma,
 * birimli sonuç (`exampleIsComplete`) ve duyurulmuş örnek boşluğu
 * (`announcedExampleGap`). Sayı denetimi `auditQuantitative` içindeki
 * özdeşlik ve aritmetik kurallarıdır; burada ikinci bir liste yoktur.
 */
function exampleReady(text: string, source: string): boolean {
  if (!exampleIsComplete(text)) return false;
  if (announcedExampleGap(text)) return false;
  if (!auditQuantitative(text, source || text).ok) return false;
  return workedExampleIssues("", text, source || text, true).length === 0;
}

function identityLeft(text: string, source: string): boolean {
  return auditQuantitative(text, source).issues.some(
    (issue) => issue.kind === "identity" || issue.kind === "wording" || issue.kind === "absolute",
  );
}

const TAUGHT_REPAIR = new Set(["identity", "wording", "absolute", "arithmetic"]);

/** Yazım, eşitlik ve kesin hüküm ders metninde de onarılır. */
function settleTaught(text: string, source: string): string {
  const surfaced = repairTurkishSurface(text);
  const audit = auditQuantitative(surfaced, source);
  const issues = audit.issues.filter((issue) => TAUGHT_REPAIR.has(issue.kind));
  if (!issues.length) return surfaced;
  const settled = repairQuantitative(surfaced, { ok: false, checked: true, issues });
  return settled.replace(/\s+/g, " ").trim();
}

function hasCalcMcq(lesson: LessonV2): boolean {
  return lesson.sections.some((section) => {
    const check = section.check;
    if (!check || check.type !== "mcq") return false;
    const blob = `${check.prompt} ${check.options.join(" ")}`;
    return /\d/.test(blob) && check.optionWhy?.length === check.options.length;
  });
}

const DANGLING_ANAPHOR = /^(diğer|diger|bu|şu|su|o|they|this|other|it)\b/i;

function summaryEchoes(lesson: LessonV2): boolean {
  const lines = lesson.summary ?? [];
  if (!lines.length) return false;
  return lines.some((line) => {
    if (DANGLING_ANAPHOR.test(line.trim())) return true;
    const folded = foldTr(line);
    return lessonSentences(lesson).some((sentence) => nearCopy(folded, foldTr(sentence)));
  });
}

function richSource(source: string): boolean {
  const blocks = sourceBlocks(source);
  if (blocks.length >= 2) return true;
  return source.trim().length >= 700;
}

function groundedCheckCount(lesson: LessonV2): number {
  const checks = lesson.sections.filter((section) => section.check).length;
  return checks + (lesson.infoCheck?.answer ? 1 : 0);
}

function checkHasAbsolute(check: SectionCheck, source: string): boolean {
  const blob = [
    check.prompt,
    check.explanation,
    check.whyRight ?? "",
    check.whyWrong ?? "",
    ...check.options,
    ...(check.optionWhy ?? []),
  ].join("\n");
  return auditQuantitative(blob, source).issues.some((issue) => issue.kind === "absolute");
}

export function teachingFailures(lesson: LessonV2, source: string, topicLabel: string): TeachingFailure[] {
  const failures: TeachingFailure[] = [];
  const quantitative = topicIsQuantitative(source);
  const push = (unit: string, problem: string) => {
    if (!failures.some((item) => item.unit === unit && item.problem === problem)) {
      failures.push({ unit, problem });
    }
  };
  if (lesson.overview && fluencyIssues(lesson.overview).length) push("overview", "fluency");
  if (!lesson.overview || lesson.overview.trim().length < 40) push("overview", "short_hook");
  const firstBody = lesson.sections[0]?.body ?? "";
  if (
    lesson.overview &&
    firstBody &&
    foldTr(firstBody).includes(foldTr(lesson.overview)) &&
    lesson.overview.trim().length > 40
  ) {
    push("overview", "short_hook");
  }
  lesson.sections.forEach((section, index) => {
    const unit = `section:${index}`;
    if (fluencyIssues(section.body).length) push(unit, "fluency");
    if (section.note && fluencyIssues(section.note.body).length) push(unit, "fluency");
    if (sectionMissesTitle(section.heading, section.body, topicLabel, source)) push(unit, "off_title");
    if (section.check && checkEchoes(section.check, lesson, section.body)) push(unit, "echo_check");
    if (section.check && fluencyIssues(`${section.check.prompt} ${section.check.explanation}`).length) {
      push(unit, "fluency");
    }
    if (section.check && checkHasAbsolute(section.check, source)) push(unit, "absolute_check");
  });
  if (quantitative) {
    const exampleBlob = `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
    const announced = [
      exampleBlob,
      ...lesson.sections.map((section) => `${section.heading}. ${section.body}`),
    ];
    const gap = announced.some((text) => Boolean(announcedExampleGap(text)));
    if (hasCompletedChain(source) && exampleIsComplete(source) && !exampleReady(exampleBlob, source)) {
      push("example", "missing_example");
    } else if (gap) {
      push("example", "missing_example");
    } else if (exampleBlob.trim() && hasCompletedChain(exampleBlob) && !exampleReady(exampleBlob, source)) {
      push("example", "missing_example");
    } else if (
      exampleBlob.trim() &&
      !hasCompletedChain(exampleBlob) &&
      workedExampleIssues(lesson.example?.prompt ?? "", lesson.example?.solution ?? "", source, true).some(
        (issue) => issue === "dangling" || issue.startsWith("n ") || issue.includes("büyüklüğ"),
      )
    ) {
      push("example", "missing_example");
    }
    if (!hasCalcMcq(lesson)) push("check", "calc_check");
  } else if (lesson.example && hasWorked(lesson.example.solution)) {
    push("example", "invented_number");
  }
  const prose = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    lesson.commonMistake?.correction ?? "",
    ...(lesson.summary ?? []),
  ].join("\n");
  const verified = lesson.example && exampleReady(lesson.example.solution, source) ? lesson.example.solution : "";
  const outside = prose.replace(verified, " ");
  if (inventedNumbers(outside, source).length) push("lesson", "invented_number");
  if (summaryEchoes(lesson)) push("summary", "summary_echo");
  if (richSource(source) && groundedCheckCount(lesson) < 5) push("check", "thin_checks");
  if (!lesson.sections.some((section) => section.note) && titleConcepts(topicLabel).length) {
    push("note", "missing_definition");
  }
  if (topicIsQuantitative(source) && !/=/.test(lessonProse(lesson))) push("formula", "missing_formula");
  if (identityLeft(identityCorpus(lesson), source)) push("lesson", "identity");
  const blocks = sourceBlocks(source);
  if (
    blocks.length &&
    !lesson.sections.some((section) => /kaynak\s*:/i.test(section.body))
  ) {
    push("citation", "missing_citation");
  }
  return failures;
}

export function criticalTeachingFailures(failures: TeachingFailure[]): TeachingFailure[] {
  return failures.filter((failure) => CRITICAL.has(failure.problem));
}

function parseTr(raw: string): number {
  return Number(raw.replace(",", "."));
}

function formatTr(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

function uniqueOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of options) {
    const key = foldTr(option);
    if (!option.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(option.trim());
  }
  return out;
}

const ARITH_EQUALITY =
  /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*([A-Za-z°µ%][A-Za-z°µ%³²/]*))?/g;

function closeEnough(actual: number, stated: number): boolean {
  return Math.abs(actual - stated) <= Math.max(0.02, Math.abs(actual) * 0.02);
}

/** Doğru sonuç, çarpma, ters bölme ve verileni sonuç sanma. */
export function calculationCheckFromExample(example: {
  prompt: string;
  solution: string;
}): SectionCheck | null {
  if (!exampleReady(example.solution, example.solution) && !hasWorked(example.solution)) return null;
  if (!auditQuantitative(example.solution, example.solution).ok) return null;
  const hits = [...example.solution.matchAll(ARITH_EQUALITY)].flatMap((match) => {
    const actual = evaluateArithmetic(match[1]);
    const stated = parseTr(match[2]);
    if (actual == null || !Number.isFinite(stated) || !closeEnough(actual, stated)) return [];
    return [{ expr: match[1].trim(), stated, unit: (match[3] ?? "").trim() }];
  });
  const pure = hits.find((hit) => /^\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?$/.test(hit.expr));
  const chosen = pure ?? hits[hits.length - 1];
  if (!chosen) return null;
  const withUnit = (value: number) => `${formatTr(value)}${chosen.unit ? ` ${chosen.unit}` : ""}`.trim();
  const correct = withUnit(chosen.stated);
  const quotient = chosen.expr.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  const mistakes: { value: number; why: string }[] = [];
  if (quotient) {
    const left = parseTr(quotient[1]);
    const right = parseTr(quotient[2]);
    if (right > 0) {
      mistakes.push({ value: left * right, why: "Bölme yerine çarpma yapılmış." });
      mistakes.push({ value: right / left, why: "Bölme ters çevrilmiş." });
      mistakes.push({ value: left, why: "Verilen değer, işlem yapılmadan sonuç sanılmış." });
    }
  } else {
    const multiplied = /[÷/]/.test(chosen.expr)
      ? evaluateArithmetic(chosen.expr.replace(/[÷/]/g, "*"))
      : evaluateArithmetic(chosen.expr.replace(/[×*]/g, "+"));
    if (multiplied != null && !closeEnough(multiplied, chosen.stated)) {
      mistakes.push({
        value: multiplied,
        why: /[÷/]/.test(chosen.expr) ? "Bölme yerine çarpma yapılmış." : "Çarpma yerine toplama yapılmış.",
      });
    }
    const inverted = chosen.expr.match(/^(.*)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (inverted) {
      const prefix = evaluateArithmetic(inverted[1]);
      const divisor = parseTr(inverted[2]);
      if (prefix != null && prefix !== 0) {
        const swapped = divisor / prefix;
        if (!closeEnough(swapped, chosen.stated)) {
          mistakes.push({ value: swapped, why: "Bölme ters çevrilmiş." });
        }
      }
    }
    const first = chosen.expr.match(/\d+(?:[.,]\d+)?/);
    if (first) mistakes.push({ value: parseTr(first[0]), why: "Verilen değer, işlem yapılmadan sonuç sanılmış." });
  }
  const options = uniqueOptions([correct, ...mistakes.map((item) => withUnit(item.value))]);
  if (options.length < 3 || !options.includes(correct)) return null;
  const answerIndex = options.indexOf(correct);
  const optionWhy = options.map((option) => {
    if (option === correct) {
      return quotient
        ? `Bölme doğrudur: ${formatTr(parseTr(quotient[1]))} / ${formatTr(parseTr(quotient[2]))} = ${formatTr(chosen.stated)}.`
        : `İşlem doğrudur: ${chosen.expr.replace(/\s+/g, " ")} = ${formatTr(chosen.stated)}.`;
    }
    return mistakes.find((item) => withUnit(item.value) === option)?.why ?? "Bu şık, işlemin sonucundan farklı bir büyüklüktür.";
  });
  const prompt = example.prompt.trim().endsWith("?")
    ? example.prompt.trim().slice(0, 300)
    : "Hesabın sonucu, birimiyle nedir?";
  return {
    type: "mcq",
    prompt,
    options,
    answerIndex,
    explanation: optionWhy.filter((_, index) => index !== answerIndex).join(" "),
    optionWhy,
  };
}

function chainExample(source: string): { prompt: string; solution: string } | null {
  const pattern =
    /[^.?\n]{0,180}\d+(?:[.,]\d+)?(?:\s*[×xX*/+]\s*\d+(?:[.,]\d+)?)+\s*=\s*\d+(?:[.,]\d+)?[^.\n]{0,40}/g;
  const windows = [...source.matchAll(pattern)].sort((left, right) => chainScore(right[0]) - chainScore(left[0]));
  for (const window of windows) {
    const built = chainFromWindow(window[0], source);
    if (built) return built;
  }
  return null;
}

/** Harf = harf bağıntısı. `m = 0,5` verilen sayıdır, formül değildir. */
function symbolicFormula(text: string): string | null {
  const matches = text.matchAll(/[A-Za-zΔδ][A-Za-z0-9_Δδ]*\s*=\s*[^.\n]{0,48}/g);
  for (const match of matches) {
    const line = match[0].replace(/\s+/g, " ").trim();
    const right = line.split("=")[1] ?? "";
    if (/[A-Za-zΔδ]/.test(right)) return line.replace(/[^A-Za-z0-9Δδ_/\s=+×*−-]+$/g, "").trim();
  }
  return null;
}

function chainScore(text: string): number {
  const example = foldTr(text).includes("ornek") ? 4 : 0;
  const ops = (text.match(/\d(?:[.,]\d+)?\s*[×xX*+]\s*\d|\d(?:[.,]\d+)?\s*\/\s*\d/g) ?? []).length;
  return example + ops;
}

function chainFromWindow(window: string, source: string): { prompt: string; solution: string } | null {
  const raw = window.replace(/\s+/g, " ").trim();
  if (!auditQuantitative(raw, source).ok) return null;
  const numbers = [...raw.matchAll(/(\d+(?:[.,]\d+)?)(\s*[A-Za-z°µ%][A-Za-z°µ%³²/]*)?/g)];
  const given = numbers
    .slice(0, -1)
    .map((item) => `${item[1]}${item[2] ?? ""}`.trim())
    .join(", ");
  const last = numbers[numbers.length - 1];
  const result = last ? `${last[1]}${last[2] ?? ""}`.trim() : "";
  const relation = symbolicFormula(source) ?? symbolicFormula(raw);
  const solution = [
    given ? `Verilen: ${given}.` : "Verilen: kaynaktaki sayılar.",
    "İstenen: işlemin sonucu, birimiyle.",
    relation ? `Bağıntı: ${relation}.` : "Bağıntı: kaynaktaki eşitlik.",
    `Yerine koyma: ${raw}.`,
    result ? `Sonuç: ${result}.` : `Sonuç: ${raw}.`,
  ].join("\n");
  if (!exampleReady(solution, source)) return null;
  const lead = given || result || "verilen";
  return {
    prompt: `${lead} için sonuç nedir?`.slice(0, 300),
    solution: solution.slice(0, 1500),
  };
}

function attachCitations(lesson: LessonV2, source: string): LessonV2 {
  const blocks = sourceBlocks(source);
  if (!blocks.length) return lesson;
  return {
    ...lesson,
    sections: lesson.sections.map((section) => {
      if (/kaynak\s*:/i.test(section.body)) return section;
      const want = stems(`${section.heading} ${section.body}`);
      let best: CiteBlock | null = null;
      let score = 0;
      for (const block of blocks) {
        const next = overlapCount(want, stems(block.text));
        if (next > score) {
          score = next;
          best = block;
        }
      }
      if (!best || score < 1) return section;
      return {
        ...section,
        body: `${section.body.trim()} Kaynak: ${best.file}, s.${best.page}.`.trim(),
      };
    }),
  };
}

function withStepLabels(solution: string): string {
  const raw = solution.replace(/\s+/g, " ").trim();
  const equality = raw.match(
    /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*([A-Za-z°µ%][A-Za-z°µ%³²/]*))?/,
  );
  const result = equality ? `${equality[2]}${equality[3] ? ` ${equality[3]}` : ""}`.trim() : "";
  return [
    "Verilen: kaynaktaki sayılar.",
    "İstenen: işlemin sonucu, birimiyle.",
    equality ? `Bağıntı: ${equality[1].trim()} = ${equality[2]}.` : "Bağıntı: kaynaktaki eşitlik.",
    `Yerine koyma: ${raw}`,
    result ? `Sonuç: ${result}.` : `Sonuç: ${raw}`,
  ].join("\n");
}

function withSourceExample(lesson: LessonV2, source: string): LessonV2 {
  if (!topicIsQuantitative(source)) return lesson;
  if (lesson.example && exampleReady(`${lesson.example.prompt}\n${lesson.example.solution}`, source)) return lesson;
  if (
    lesson.example &&
    hasWorked(lesson.example.solution) &&
    auditQuantitative(lesson.example.solution, source).ok
  ) {
    const wrapped = withStepLabels(lesson.example.solution);
    if (exampleReady(wrapped, source)) {
      return { ...lesson, example: { ...lesson.example, solution: wrapped } };
    }
  }
  const built = chainExample(source);
  if (!built) return lesson;
  return { ...lesson, example: built };
}

function withCalculationCheck(lesson: LessonV2, source: string): LessonV2 {
  if (!topicIsQuantitative(source) || hasCalcMcq(lesson) || !lesson.example) return lesson;
  const check = calculationCheckFromExample(lesson.example);
  if (!check) return lesson;
  const sections = lesson.sections.map((section) => ({ ...section }));
  const target = sections.findIndex((section) => !section.check);
  if (target < 0) return lesson;
  const current = sections[target];
  if (!current) return lesson;
  sections[target] = { ...current, check };
  return { ...lesson, sections };
}

function readableSummary(lesson: LessonV2, topic: string): string[] {
  const name = topic.trim() || lesson.title;
  const formula = symbolicFormula(lessonProse(lesson));
  const trap = lesson.commonMistake?.correction
    ? `Sık hata, ${lesson.commonMistake.correction.replace(/\s+/g, " ").trim().slice(0, 140)}`
    : "Sık hata, tanımı başka bir olaya ya da büyüklüğe kaydırmaktır.";
  const lines = formula
    ? [
        `${name} konusunda sonuç, ${formula} bağıntısına konulan veriden çıkar.`,
        "Uygulama, verileni bağıntıda yerine koyup birimiyle okumaktır.",
        trap,
      ]
    : [
        `${name} konusunda kural, kaynaktaki tanıma ve şarta bağlıdır.`,
        trap,
        "Uygulama, kaynaktaki olayı verilen şartla ayırt etmektir.",
      ];
  return lines
    .filter((line) => line.length >= 12 && line.length <= 240 && !DANGLING_ANAPHOR.test(line.trim()))
    .slice(0, 5);
}

function softenSummary(lesson: LessonV2, topic: string): LessonV2 {
  if (!summaryEchoes(lesson)) return lesson;
  const summary = readableSummary(lesson, topic);
  if (summary.length < 3) return lesson;
  return { ...lesson, summary };
}

function dropInventedSentences(text: string, source: string): string {
  const parts = text.split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/);
  const kept = parts
    .map((part) => part.trim())
    .filter((part) => part && inventedNumbers(part, source).length === 0);
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function scrubInventedNumbers(lesson: LessonV2, source: string): LessonV2 {
  if (!source.trim()) return lesson;
  const keep = (text: string, min: number) => {
    const next = dropInventedSentences(text, source);
    if (next.length >= min) return next;
    return inventedNumbers(text, source).length === 0 ? text : next;
  };
  const sections = lesson.sections.flatMap((section) => {
    const body = keep(section.body, 20);
    if (body.length < 20) return [];
    const check = section.check;
    const explanation = check ? keep(check.explanation, 8) : "";
    return [{
      ...section,
      body,
      ...(check
        ? {
            check: {
              ...check,
              explanation: explanation.length >= 8 ? explanation : check.explanation,
            },
          }
        : {}),
    }];
  });
  if (!sections.length) return lesson;
  const summary = (lesson.summary ?? [])
    .map((line) => dropInventedSentences(line, source))
    .filter((line) => line.length >= 8 && inventedNumbers(line, source).length === 0);
  const correction = lesson.commonMistake
    ? keep(lesson.commonMistake.correction, 8)
    : "";
  return {
    ...lesson,
    overview: lesson.overview ? keep(lesson.overview, 20) || lesson.overview : lesson.overview,
    sections,
    ...(summary.length ? { summary } : {}),
    ...(lesson.commonMistake && correction.length >= 8
      ? { commonMistake: { ...lesson.commonMistake, correction } }
      : {}),
  };
}

function plainLine(text: string, source: string, fallback: string): string {
  const next = settleTaught(text, source);
  if (next && !fluencyIssues(next).length) return next;
  return fallback;
}

function readableCheck(check: SectionCheck, source: string): SectionCheck {
  const prompt = settleTaught(check.prompt, source);
  return {
    ...check,
    prompt: prompt && !fluencyIssues(prompt).length ? prompt : check.prompt,
    explanation: plainLine(check.explanation, source, "Bu yargı kaynağın kurduğu tanımla çelişir."),
    ...(check.whyRight
      ? { whyRight: plainLine(check.whyRight, source, "Bu yargı kaynağın kurduğu tanımla uyumludur.") }
      : {}),
    ...(check.whyWrong
      ? { whyWrong: plainLine(check.whyWrong, source, "Bu yargı kaynağın kurduğu tanımla çelişir.") }
      : {}),
    ...(check.optionWhy
      ? {
          optionWhy: check.optionWhy.map((line, index) =>
            plainLine(
              line,
              source,
              index === check.answerIndex
                ? "Bu şık, kaynağın kuralına uyuyor."
                : "Bu şık, kaynağın kuralıyla uyuşmuyor.",
            ),
          ),
        }
      : {}),
  };
}

function keepProse(text: string, source: string): string {
  const settled = settleTaught(text, source);
  const grounded = groundProseCalculations(settled, source);
  return (grounded.trim() || settled).trim();
}

function applyIdentity(lesson: LessonV2, source: string): LessonV2 {
  const keep = (text: string) => settleTaught(text, source);
  return {
    ...lesson,
    overview: lesson.overview
      ? keepProse(lesson.overview, source) || lesson.overview
      : lesson.overview,
    sections: lesson.sections.map((section) => {
      const body = keepProse(section.body, source);
      const next: LessonV2["sections"][number] = {
        ...section,
        body: body.length >= 20 ? body : section.body,
      };
      if (section.note) {
        const noteBody = keepProse(section.note.body, source);
        next.note = {
          ...section.note,
          body: noteBody.length >= 10 ? noteBody : section.note.body,
        };
      }
      if (!section.check) return next;
      if (checkHasAbsolute(section.check, source)) {
        delete next.check;
        return next;
      }
      next.check = readableCheck(section.check, source);
      return next;
    }),
    ...(lesson.example
      ? {
          example: {
            prompt: keep(lesson.example.prompt),
            solution: keepProse(lesson.example.solution, source),
          },
        }
      : {}),
    ...(lesson.commonMistake
      ? {
          commonMistake: {
            claim: lesson.commonMistake.claim,
            correction: keep(lesson.commonMistake.correction),
          },
        }
      : {}),
    ...(lesson.summary ? { summary: lesson.summary.map((line) => keep(line)) } : {}),
  };
}

function lessonLooksEnglish(lesson: LessonV2): boolean {
  const blob = foldTr(lessonProse(lesson));
  const english = (blob.match(/\b(the|and|of|to|is|are|with|when)\b/g) ?? []).length;
  const turkish = (blob.match(/\b(ve|bir|ile|icin|olan|bu)\b/g) ?? []).length;
  return english >= 3 && english > turkish;
}

function withInfoCheck(lesson: LessonV2, source: string): LessonV2 {
  if (lesson.infoCheck?.answer || !topicIsQuantitative(source)) return lesson;
  const formula = symbolicFormula(lessonProse(lesson)) ?? symbolicFormula(source);
  if (!formula) return lesson;
  const english = lessonLooksEnglish(lesson);
  return {
    ...lesson,
    infoCheck: {
      prompt: english
        ? "Write the relation and substitute the givens yourself."
        : "Bağıntıyı ve yerine koymayı kendin yaz.",
      answer: formula.slice(0, 200),
    },
  };
}

function weaveUnusedSources(lesson: LessonV2, source: string, topic: string): LessonV2 {
  const blocks = sourceBlocks(source);
  if (blocks.length < 2 || !lesson.sections.length) return lesson;
  const cited = foldTr(lesson.sections.map((section) => section.body).join("\n"));
  const unused = blocks.filter((block) => block.file && !cited.includes(foldTr(block.file)));
  if (!unused.length) return lesson;
  const want = stems(`${topic} ${lesson.title} ${lesson.sections.map((section) => section.heading).join(" ")}`);
  const picked = unused
    .map((block) => ({ block, score: overlapCount(want, stems(block.text)) }))
    .filter((item) => item.score >= 1)
    .sort((left, right) => right.score - left.score)[0]?.block;
  if (!picked) return lesson;
  const sentence = sentences(picked.text).find(
    (line) =>
      line.length >= 40 &&
      line.length <= 240 &&
      !hasCompletedChain(line) &&
      !announcedExampleGap(line) &&
      fluencyIssues(line).length === 0 &&
      !identityLeft(line, source),
  );
  if (!sentence) return lesson;
  const index = lesson.sections.length - 1;
  return {
    ...lesson,
    sections: lesson.sections.map((section, at) => {
      if (at !== index) return section;
      if (foldTr(section.body).includes(foldTr(sentence).slice(0, 24))) return section;
      const body = `${section.body.trim()} ${sentence} Kaynak: ${picked.file}, s.${picked.page}.`
        .replace(/\s+/g, " ")
        .trim();
      if (body.length > 2400 || body.length < 20) return section;
      return { ...section, body };
    }),
  };
}

function withoutExample(lesson: LessonV2): LessonV2 {
  const next = { ...lesson };
  delete next.example;
  return next;
}

function prepareTaught(lesson: LessonV2, source: string, topicLabel: string): LessonV2 {
  const checksBefore = lesson.sections.filter((section) => section.check).length;
  const sentencesBefore = sentences(lessonProse(lesson)).length;
  const hadExample = Boolean(lesson.example);
  const named = applyIdentity(lesson, source);
  const grounded = groundLearnerLesson(scrubInventedNumbers(named, source), source, {}).lesson;
  const parsed = lessonV2Schema.safeParse(grounded).data ?? lesson;
  const saved = lesson.example;
  let next = parsed;
  if (
    saved &&
    (!next.example || !exampleReady(next.example.solution, source)) &&
    exampleReady(saved.solution, source)
  ) {
    next = { ...next, example: saved };
  }
  next = attachCitations(next, source);
  next = withSourceExample(next, source);
  next = withCalculationCheck(next, source);
  next = withInfoCheck(next, source);
  next = weaveUnusedSources(next, source, topicLabel);
  next = softenSummary(next, topicLabel);
  if (next.example && topicIsQuantitative(source)) {
    const blob = `${next.example.prompt}\n${next.example.solution}`;
    if (!exampleReady(blob, source)) next = withoutExample(next);
  }
  next = scrubInventedNumbers(next, source);
  const dropped =
    next.sections.filter((section) => section.check).length < checksBefore ||
    sentences(lessonProse(next)).length < sentencesBefore ||
    (hadExample && !next.example);
  if (!dropped || next.overview?.includes(REMOVED_FLAG)) return next;
  const overview = `${next.overview ?? ""} ${REMOVED_FLAG}`.trim();
  return {
    ...next,
    overview: fluencyIssues(overview).length ? REMOVED_FLAG : overview.slice(0, 1500),
  };
}

export function teachingRepairPrompt(
  lesson: LessonV2,
  failures: TeachingFailure[],
  source: string,
  topicLabel: string,
): string {
  const units = failures
    .map((failure) => `${failure.unit}: ${failure.problem}`)
    .join("\n");
  return [
    `Konu: ${topicLabel}.`,
    "Yalnızca bozuk birimleri yeniden yaz. Sağlam birime dokunma. Yeni olgu uydurma.",
    "Nicel örnekte Verilen, İstenen, Bağıntı, Yerine koyma ve Sonuç satırları olsun. Sayılar kaynaktan gelsin ve aritmetik tutsun.",
    "Kontrol, aynı fikri ölçer. explanation soruyu tekrarlamaz. Nicel konuda bir mcq işlem hatasından çeldirici kurar ve optionWhy her şıkkı açıklar.",
    "Başlık ne vaat ediyorsa gövde onu anlatır.",
    'JSON: {"overview":string,"sections":[{"heading":string,"body":string,"note":{"title":string,"body":string,"tone":"info"},"check":{"type":"mcq","prompt":string,"options":string[],"answerIndex":number,"explanation":string,"optionWhy":string[]}}],"example":{"prompt":string,"solution":string},"commonMistake":{"claim":string,"correction":string},"summary":string[]}',
    `Bozuk birimler:\n${units}`,
    `Kaynak:\n${source.slice(0, 6000)}`,
    `Mevcut ders:\n${JSON.stringify(lesson).slice(0, 4000)}`,
  ].join("\n\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Yazım onarılır; kalan kırık Türkçe yama olarak alınmaz. */
function fluentPatch(text: string): string | null {
  const next = repairTurkishSurface(text.trim());
  if (!next || fluencyIssues(next).length) return null;
  return next;
}

export function mergeTeachingRepair(lesson: LessonV2, patch: unknown): LessonV2 {
  const row = asRecord(patch);
  if (!row) return lesson;
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const overview = typeof row.overview === "string" ? fluentPatch(row.overview) : null;
  if (overview && overview.length >= 40) {
    next.overview = overview.slice(0, 1500);
  }
  const incoming = Array.isArray(row.sections) ? row.sections : [];
  for (const item of incoming) {
    const section = asRecord(item);
    if (!section || typeof section.heading !== "string" || typeof section.body !== "string") continue;
    const body = fluentPatch(section.body);
    if (!body || body.length < 20) continue;
    const heading = section.heading.trim();
    const index = next.sections.findIndex((current) => foldTr(current.heading) === foldTr(heading));
    const note = asRecord(section.note);
    const check = asRecord(section.check);
    const built: LessonV2["sections"][number] = {
      heading: heading.slice(0, 160),
      body: body.slice(0, 2400),
    };
    const noteBody = note && typeof note.body === "string" ? fluentPatch(note.body) : null;
    if (note && typeof note.title === "string" && noteBody) {
      built.note = {
        title: note.title.trim().slice(0, 80),
        body: noteBody.slice(0, 400),
        tone: note.tone === "warn" || note.tone === "unit" ? note.tone : "info",
      };
    }
    if (
      check &&
      (check.type === "mcq" || check.type === "trueFalse") &&
      typeof check.prompt === "string" &&
      Array.isArray(check.options) &&
      typeof check.answerIndex === "number"
    ) {
      const options = check.options.filter((option): option is string => typeof option === "string");
      const optionWhy = Array.isArray(check.optionWhy)
        ? check.optionWhy.filter((line): line is string => typeof line === "string")
        : undefined;
      if (options.length >= 2 && check.answerIndex >= 0 && check.answerIndex < options.length) {
        built.check = {
          type: check.type,
          prompt: check.prompt.trim().slice(0, 300),
          options: options.map((option) => option.slice(0, 200)),
          answerIndex: check.answerIndex,
          explanation: typeof check.explanation === "string" ? check.explanation.slice(0, 600) : "",
          ...(optionWhy && optionWhy.length === options.length
            ? { optionWhy: optionWhy.map((line) => line.slice(0, 200)) }
            : {}),
        };
      }
    }
    if (index >= 0) {
      const previous = next.sections[index];
      next.sections[index] = {
        ...previous,
        ...built,
        note: built.note ?? previous?.note,
        check: built.check ?? previous?.check,
      };
    } else if (next.sections.length < 8) {
      next.sections.push(built);
    }
  }
  const example = asRecord(row.example);
  if (example && typeof example.prompt === "string" && typeof example.solution === "string") {
    const solution = fluentPatch(example.solution);
    const prompt = repairTurkishSurface(example.prompt.trim());
    if (solution && solution.length >= 8) {
      next.example = {
        prompt: prompt.slice(0, 800),
        solution: solution.slice(0, 1500),
      };
    }
  }
  const mistake = asRecord(row.commonMistake);
  if (mistake && typeof mistake.claim === "string" && typeof mistake.correction === "string") {
    const correction = fluentPatch(mistake.correction);
    if (correction) {
      next.commonMistake = {
        claim: repairTurkishSurface(mistake.claim.trim()).slice(0, 400),
        correction: correction.slice(0, 400),
      };
    }
  }
  if (Array.isArray(row.summary)) {
    const summary = row.summary.flatMap((line) => {
      if (typeof line !== "string") return [];
      const nextLine = fluentPatch(line);
      return nextLine && nextLine.length >= 8 ? [nextLine] : [];
    });
    if (summary.length >= 3) {
      next.summary = summary.map((line) => line.slice(0, 240)).slice(0, 8);
    }
  }
  return lessonV2Schema.safeParse(next).data ?? lesson;
}

const REMOVED_FLAG = "Doğrulanamayan cümleler çıkarıldı.";

function sentenceVerifiable(sentence: string, source: string): boolean {
  if (!sentence.trim()) return false;
  if (fluencyIssues(sentence).length) return false;
  if (source.trim() && inventedNumbers(sentence, source).length) return false;
  if (identityLeft(sentence, source)) return false;
  return true;
}

function cleanProse(text: string, source: string): string {
  const parts = sentences(text);
  if (!parts.length) return sentenceVerifiable(text, source) ? text.trim() : "";
  return parts.filter((part) => sentenceVerifiable(part, source)).join(" ");
}

function sourceBackedBody(heading: string, topic: string, source: string): string {
  const blocks = sourceBlocks(source);
  if (!blocks.length) return "";
  const want = stems(`${heading} ${topic}`);
  let best: CiteBlock | null = null;
  let score = 0;
  for (const block of blocks) {
    const next = overlapCount(want, stems(block.text));
    if (next > score) {
      score = next;
      best = block;
    }
  }
  if (!best || score < 1) return "";
  const kept = cleanProse(best.text, source);
  if (kept.length < 20) return "";
  const cited = /kaynak\s*:/i.test(kept) ? kept : `${kept} Kaynak: ${best.file}, s.${best.page}.`;
  return cited.slice(0, 2400);
}

function withoutCheck(section: LessonV2["sections"][number]): LessonV2["sections"][number] {
  const next = { ...section };
  delete next.check;
  return next;
}

function withoutNote(section: LessonV2["sections"][number]): LessonV2["sections"][number] {
  const next = { ...section };
  delete next.note;
  return next;
}

/**
 * Kapı dolu kaldığında yayınlanacak en iyi doğrulanmış ders.
 * Doğrulanamayan cümle, yanlış dosyanın sayfası, yankı kontrol ve
 * yarım örnek düşer. Geriye en az bir okunur bölüm kalır.
 */
export function salvageTaughtLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
): { lesson: LessonV2; removed: string[] } {
  const source = input.source;
  const topic = input.topicLabel;
  const removed: string[] = [];
  const noteRemoval = (label: string) => {
    if (!removed.includes(label)) removed.push(label);
  };

  const overview = lesson.overview ? cleanProse(lesson.overview, source) : "";
  if (lesson.overview && overview !== lesson.overview.trim()) noteRemoval("overview");

  const sections = lesson.sections.flatMap((section) => {
    let body = cleanProse(section.body, source);
    if (body !== section.body.trim()) noteRemoval(`section:${section.heading}`);
    if (body.length < 20 || sectionMissesTitle(section.heading, body, topic, source)) {
      const backed = sourceBackedBody(section.heading, topic, source);
      if (backed.length >= 20 && !sectionMissesTitle(section.heading, backed, topic, source)) {
        noteRemoval(`section:${section.heading}`);
        body = backed;
      } else {
        noteRemoval(`section:${section.heading}`);
        return [];
      }
    }
    let next: LessonV2["sections"][number] = { ...section, body };
    if (
      next.check &&
      (checkEchoes(next.check, lesson, body) ||
        checkHasAbsolute(next.check, source) ||
        fluencyIssues(next.check.prompt).length ||
        fluencyIssues(next.check.explanation).length)
    ) {
      noteRemoval(`check:${section.heading}`);
      next = withoutCheck(next);
    }
    if (next.note && !sentenceVerifiable(next.note.body, source)) {
      noteRemoval(`note:${section.heading}`);
      next = withoutNote(next);
    }
    return [next];
  });

  let next: LessonV2 = {
    ...lesson,
    ...(overview ? { overview } : {}),
    sections,
  };
  if (!overview) delete next.overview;
  const exampleBlob = `${next.example?.prompt ?? ""}\n${next.example?.solution ?? ""}`;
  if (next.example && !exampleReady(exampleBlob, source)) {
    noteRemoval("example");
    delete next.example;
  }
  if (next.commonMistake && !sentenceVerifiable(next.commonMistake.correction, source)) {
    noteRemoval("commonMistake");
    delete next.commonMistake;
  }
  if (next.summary?.length) {
    const summary = next.summary
      .map((line) => cleanProse(line, source))
      .filter((line) => line.length >= 8);
    if (summary.length !== next.summary.length) noteRemoval("summary");
    if (summary.length) next.summary = summary;
    else delete next.summary;
  }

  if (!next.sections.length) {
    const backed = sourceBackedBody(topic, topic, source);
    const pool = [lesson.overview ?? "", ...lesson.sections.map((section) => section.body)]
      .map((text) => cleanProse(text, source))
      .filter((text) => text.length >= 20)
      .sort((left, right) => right.length - left.length);
    const body = (backed || pool[0] || `${topic} konusunda kaynaktaki ifade bu bölümde durur.`).slice(0, 2400);
    noteRemoval("sections");
    next = {
      ...next,
      sections: [{ heading: (topic || lesson.title).slice(0, 140), body }],
    };
  }

  if (removed.length) {
    const flagged = next.overview?.includes(REMOVED_FLAG)
      ? next.overview
      : `${next.overview ?? ""} ${REMOVED_FLAG}`.trim();
    next = {
      ...next,
      overview: fluencyIssues(flagged).length ? REMOVED_FLAG : flagged.slice(0, 1500),
    };
  }

  const parsed = lessonV2Schema.safeParse(next).data;
  const prepared = prepareTaught(parsed ?? next, source, topic);
  const still = criticalTeachingFailures(teachingFailures(prepared, source, topic));
  if (!still.length) return { lesson: prepared, removed };

  const stripped = salvageStripRemaining(prepared, source, topic, removed);
  const finalParsed = lessonV2Schema.safeParse(stripped).data ?? stripped;
  return { lesson: finalParsed, removed };
}

function salvageStripRemaining(
  lesson: LessonV2,
  source: string,
  topic: string,
  removed: string[],
): LessonV2 {
  const sections = lesson.sections.flatMap((section) => {
    if (fluencyIssues(section.body).length || sectionMissesTitle(section.heading, section.body, topic, source)) {
      removed.push(`section:${section.heading}`);
      return [];
    }
    let next = section;
    if (next.check && (checkEchoes(next.check, lesson, next.body) || checkHasAbsolute(next.check, source))) {
      removed.push(`check:${section.heading}`);
      next = withoutCheck(next);
    }
    return [next];
  });
  const exampleBlob = `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
  const keepExample = Boolean(lesson.example && exampleReady(exampleBlob, source));
  if (lesson.example && !keepExample) removed.push("example");
  const body = sourceBackedBody(topic, topic, source);
  const kept = sections.length
    ? sections
    : [{ heading: (topic || lesson.title).slice(0, 140), body: body.length >= 20 ? body : `${topic} konusunda kaynaktaki ifade bu bölümde durur.`.slice(0, 2400) }];
  const overview = lesson.overview?.includes(REMOVED_FLAG)
    ? lesson.overview
    : `${lesson.overview ?? ""} ${REMOVED_FLAG}`.trim();
  const rest: LessonV2 = { ...lesson };
  delete rest.example;
  return {
    ...rest,
    overview: fluencyIssues(overview).length ? REMOVED_FLAG : overview.slice(0, 1500),
    sections: kept,
    ...(keepExample && lesson.example ? { example: lesson.example } : {}),
  };
}

/**
 * Kaynağa indir, doğrula, bozuksa tek onarım çağrısına izin ver.
 * Onarım kapıyı kapatamazsa ders yine açılır: doğrulanamayan cümle
 * çıkarılmış ya da işaretlenmiş hâl budur.
 */
export async function finishTaughtLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
  repair?: (prompt: string) => Promise<unknown>,
): Promise<{ lesson: LessonV2; failures: TeachingFailure[]; salvaged: boolean }> {
  let current = prepareTaught(lesson, input.source, input.topicLabel);
  let failures = teachingFailures(current, input.source, input.topicLabel);
  if (criticalTeachingFailures(failures).length && repair) {
    try {
      const patch = await repair(
        teachingRepairPrompt(current, failures, input.source, input.topicLabel),
      );
      if (patch) {
        current = prepareTaught(
          mergeTeachingRepair(current, patch),
          input.source,
          input.topicLabel,
        );
      }
    } catch {
      current = prepareTaught(current, input.source, input.topicLabel);
    }
    failures = teachingFailures(current, input.source, input.topicLabel);
  }
  if (!criticalTeachingFailures(failures).length) {
    return { lesson: current, failures, salvaged: false };
  }
  const salvaged = salvageTaughtLesson(current, input);
  return {
    lesson: salvaged.lesson,
    failures: teachingFailures(salvaged.lesson, input.source, input.topicLabel),
    salvaged: true,
  };
}
