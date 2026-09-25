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

export type GroundLessonOptions = {
  /**
   * Konu haritasında bu konudan sonrakiler.
   * Dizi verilirse "Sırada ne var" yalnızca bunlardır; boş dizi listeyi siler.
   * Alan yoksa dersin kendi nextFocus'u durur.
   */
  upcomingTopics?: string[];
};

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

const SUMMARY_MAX = 240;

/**
 * Sayfa bloğunun başındaki "[s.4] dosya:" öğrenciye ait değil.
 * Formül dizini ve yönerge cümlesi de değil: "Bu sayfadaki formüller: a | b".
 */
function stripSourceChrome(text: string): string {
  return text
    .replace(/\[Sayfa metni kısaltıldı\.\]/gi, "")
    .replace(/\[s\.\d+\]\s*[^:\n]{0,120}:\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSummaryText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([mhuvsypxt])\s+(fg|sat|f|g)\b/gi, "$1_$2")
    .replace(/\bc\s*_?\s*([vp])\b/gi, "c_$1")
    .replace(/\b([mhuvsypxt](?:_(?:fg|sat|f|g))?)\s*\/\s*([mhuvsypxt])\b/gi, "$1/$2")
    .replace(/(?<!\*)\*(?!\*)/g, "·")
    .replace(/[;]+\s*$/g, "")
    .trim();
}

function hasFiniteVerb(folded: string): boolean {
  return folded.split(/[^a-z0-9]+/).some(
    (word) => word.length >= 5 && /(?:ir|ur|ar|er|yor|dir|dur|tir|tur|mis|mus)$/.test(word),
  );
}

function truncatedEnding(text: string): boolean {
  const trimmed = text.trim();
  if (/[,:]\s*$/.test(trimmed)) return true;
  const folded = foldTr(trimmed).replace(/[.?!]+\s*$/g, "");
  return /\b(cunku|ve|ile|veya)\s*$/.test(folded);
}

function hasCopula(folded: string): boolean {
  return folded.split(/[^a-z0-9]+/).some(
    (word) => word.length >= 5 && /(?:dir|dur|tir|tur|yor|mistir|mustur)$/.test(word),
  );
}

/** Virgülle dizilmiş başlık. Eşitlik ve yüklem yoksa cümle değildir. */
function bareTitle(text: string): boolean {
  if (/[=≤≥]/.test(text)) return false;
  const folded = foldTr(text);
  if (hasCopula(folded)) return false;
  const words = text.replace(/[.,:;!?()]/g, " ").split(/\s+/).filter((word) => word.length > 2);
  const capped = words.filter((word) => /^[A-ZÇĞİÖŞÜ]/.test(word));
  if (capped.length >= 3) return true;
  return !/[.!?]\s*$/.test(text) && !hasFiniteVerb(folded);
}

/**
 * Özet satırı bir olgu cümlesi değilse nedeni.
 * Başlık, öğrenme hedefi, etiket zinciri, kesik cümle ve beş sözcükten
 * kısa parça yayımlanmaz. Tek iki nokta üst üste, formülün önünde durabilir.
 */
export function summaryLineProblem(
  text: string,
): "fragment" | "heading" | "objective" | "flashcard" | "truncated" | "vague" | null {
  const folded = foldTr(text);
  if (/^\s*soru\s*:/i.test(text) || /\bcevap\s*:/i.test(text) || /\?:/.test(text)) return "flashcard";
  if (/ifade\s+(dogru|yanlis)/.test(folded) || /dogru cevap/.test(folded) || /secenek/.test(folded)) {
    return "flashcard";
  }
  if (/\bornek\s*:/i.test(text) && !/=\s*\d/.test(text)) return "fragment";
  if (/gibi parametrelerle belirlenen|belirlenen sistemlerdir/.test(folded)) return "vague";
  if (/\b(ogren|ogrenin|kavra|kavrayin)\b/.test(folded)) return "objective";
  if (/(gerceklestirme|uygulayabilmek|gorsellestirme|ogrenmek|anlayabilmek|kullanabilmek)\s*\.?$/.test(folded)) {
    return "objective";
  }
  if (/(?:me|ma|mek|mak)\s*\.?$/.test(folded) && !hasFiniteVerb(folded)) return "objective";
  if (truncatedEnding(text)) return "truncated";
  if ((text.match(/:/g) ?? []).length >= 2) return "heading";
  if (/\s[-–—]\s/.test(text) && !hasFiniteVerb(folded) && !/[=≤≥]/.test(text)) return "heading";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5 && !/[=≤≥]/.test(text)) return "fragment";
  if (bareTitle(text)) return "heading";
  return null;
}

function objectiveFiller(text: string): boolean {
  const folded = foldTr(text);
  if (summaryLineProblem(text) === "objective") return true;
  if (/\bkonusu(nu|n)?\b/.test(folded) && /(anlayarak|uygulayabil|ogren)/.test(folded)) return true;
  return /(ogrenmek|ogrenmeyi)\s*$/.test(folded);
}

function metadataDump(text: string): boolean {
  if (text.includes("|")) return true;
  const folded = foldTr(text);
  return (
    folded.includes("bu sayfadaki formuller") ||
    folded.includes("formulleri sayfadaki") ||
    folded.includes("ogrencinin kendi kaynagindan") ||
    folded.includes("fiziksel pdf sayfa") ||
    folded.includes("bu sayfalarda olmayan") ||
    folded.includes("kisaltilan sayfalar")
  );
}

function danglingTail(text: string): boolean {
  return /[=+×*/\-−]\s*$/.test(text.trim());
}

function workedExampleFragment(text: string): boolean {
  return /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%]+)?\s*[+×*·\-−]\s*\d/.test(text);
}

/**
 * Özet satırı tek, bitmiş, okunur bir cümle olmalı.
 * Formül dizini, kesik hesap ve öğrenme hedefi kalıbı düşer.
 * 240 karakteri aşan cümle ortadan kesilmez; satır olmaz.
 */
function cleanSummarySentence(text: string, min = 8): string | null {
  const normalized = normalizeSummaryText(stripSourceChrome(text));
  if (normalized.length < min || normalized.length > SUMMARY_MAX) return null;
  if (objectiveFiller(normalized) || metadataDump(normalized) || danglingTail(normalized)) return null;
  if (summaryLineProblem(normalized)) return null;
  if (workedExampleFragment(normalized)) return null;
  if (definitionalInversionIssues(normalized).length) return null;
  if (!/[.!?]\s*$/.test(normalized) && !/[=≤≥]/.test(normalized)) {
    const finished = `${normalized}.`;
    if (finished.length > SUMMARY_MAX) return null;
    return finished;
  }
  return normalized;
}

const SUMMARY_STOP = new Set([
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
  "icin",
]);

function summaryStems(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 3 || SUMMARY_STOP.has(word)) continue;
    const stem = word.length >= 5 ? word.slice(0, 5) : word;
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

function stemsClose(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  return left.slice(0, 4) === right.slice(0, 4);
}

function stemOverlap(left: string[], right: string[]): number {
  return left.filter((stem) => right.some((other) => stemsClose(stem, other))).length;
}

function equationSymbol(text: string): string | null {
  const match = text.match(/([A-Za-z][A-Za-z0-9_]*)\s*=/);
  if (!match) return null;
  const symbol = foldTr(match[1]).replace(/[^a-z0-9]/g, "");
  return symbol.length >= 4 ? symbol : null;
}

function symbolIn(text: string, symbol: string): boolean {
  const folded = foldTr(text).replace(/[^a-z0-9]/g, "");
  if (folded.includes(symbol)) return true;
  const tail = symbol.replace(/^[a-z]/, "");
  return tail.length >= 5 && folded.includes(tail);
}

/** Kısa bağıntı, hemen önceki tanım cümlesine yapışır: "…oranıdır. P = F/A." */
function attachRelation(sentences: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const current = sentences[index] ?? "";
    const next = sentences[index + 1];
    if (
      next &&
      !/=/.test(current) &&
      /=/.test(next) &&
      next.length <= 80 &&
      summaryStems(next).length <= 4
    ) {
      out.push(`${current.replace(/[.:;\s]+$/g, "")}: ${next.replace(/[.;\s]+$/g, "")}`);
      index += 1;
      continue;
    }
    out.push(current);
  }
  return out;
}

/** Kaynak gövdesinden özet olabilecek bitmiş cümleler. Dizin ve kesik hesap yok. */
function summaryCandidates(source: string): string[] {
  const raw = sentencesOf(source)
    .map((sentence) => stripSourceChrome(sentence))
    .filter((sentence) => sentence.length >= 8 && !metadataDump(sentence) && !objectiveFiller(sentence));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sentence of attachRelation(raw)) {
    const clean = cleanSummarySentence(sentence);
    if (!clean) continue;
    const key = foldTr(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Özet, kaynağın niteleyicisini veya bağıntının yarısını düşürdüyse
 * kaynağın kendi cümlesi (ve aynı simgeli kardeş bağıntı) gelir.
 * Formül dizini ve yarım kalan hesap adayı değildir.
 */
function preciseSummaryLines(item: string, source: string): string[] | null {
  if (!source.trim() || truncated(source) || definitionalInversionIssues(item).length) return null;
  const packed = summaryCandidates(source);
  const itemStems = summaryStems(item);
  if (itemStems.length < 2) return null;
  const itemHasEq = /=/.test(item);
  const itemKey = foldTr(normalizeSummaryText(item));
  if (packed.some((sentence) => foldTr(sentence) === itemKey)) return null;
  let best: { text: string; score: number } | null = null;
  for (const sentence of packed) {
    const sentenceStems = summaryStems(sentence);
    const shared = stemOverlap(itemStems, sentenceStems);
    const extras = sentenceStems.filter((stem) => !itemStems.some((other) => stemsClose(stem, other)));
    const missingEq = !itemHasEq && /=/.test(sentence);
    const coverage = shared / itemStems.length;
    const symbol = equationSymbol(sentence);
    const symbolHit = Boolean(symbol && symbolIn(item, symbol));
    if (missingEq) {
      if (coverage < 0.5 && !symbolHit) continue;
    } else if (extras.length < 2 || coverage < 0.5) {
      continue;
    }
    const score = shared * 2 + extras.length + (missingEq ? 12 : 0) + (symbolHit ? 4 : 0);
    if (!best || score > best.score) best = { text: sentence, score };
  }
  if (!best) return null;
  if (itemHasEq && /=/.test(best.text)) {
    const extras = summaryStems(best.text).filter(
      (stem) => !itemStems.some((other) => stemsClose(stem, other)),
    );
    const symbol = equationSymbol(best.text);
    if (extras.length < 2 && symbol && symbolIn(item, symbol)) return null;
  }
  const lines = [best.text];
  const symbol = equationSymbol(best.text);
  if (symbol && !itemHasEq) {
    for (const sentence of packed) {
      if (!/=/.test(sentence)) continue;
      if (!symbolIn(sentence, symbol)) continue;
      if (lines.some((line) => foldTr(line).includes(foldTr(sentence)) || foldTr(sentence).includes(foldTr(line)))) {
        continue;
      }
      lines.push(sentence);
      if (lines.length >= 2) break;
    }
  }
  if (lines.length === 1 && foldTr(lines[0] ?? "") === itemKey) return null;
  return lines;
}

/** Konu sırasında bu başlıktan sonrakiler. Eşleşme yoksa null. */
export function upcomingTopicsAfter(
  currentTitle: string,
  titles: string[],
  limit = 3,
): string[] | null {
  const current = foldTr(currentTitle).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!current) return null;
  const folded = titles.map((title) => ({
    title: title.trim(),
    key: foldTr(title).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(),
  }));
  let index = folded.findIndex((row) => row.key === current);
  if (index < 0) {
    let bestLen = 0;
    folded.forEach((row, rowIndex) => {
      if (row.key.length < 8) return;
      const hit = row.key.includes(current) || current.includes(row.key);
      if (!hit || row.key.length <= bestLen) return;
      index = rowIndex;
      bestLen = row.key.length;
    });
  }
  if (index < 0) return null;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const row of folded.slice(index + 1)) {
    if (row.title.length < 2 || !row.key || seen.has(row.key)) continue;
    seen.add(row.key);
    next.push(row.title.slice(0, 200));
    if (next.length >= limit) break;
  }
  return next;
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
    const visible = stripSourceChrome(sentence);
    if (visible.length < 20) continue;
    if (metadataDump(visible) || objectiveFiller(visible) || danglingTail(visible)) continue;
    if (definitionalInversionIssues(visible).length) continue;
    const folded = foldTr(visible);
    let score = 0;
    for (const needle of needles) {
      if (folded.includes(needle)) score += 1;
    }
    if (/karisim/.test(topicFold) && /kuruluk|(?<![a-z])x(?![a-z])/.test(folded)) score += 2;
    if (/karsilastir|faz karar/.test(topicFold) && /t[_ ]?sat|tsat|p[_ ]?sat|psat|doyma/.test(folded)) {
      score += 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, text: visible };
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

/** Özet havuzu: genel bakış, bölüm gövdesi, açıklama ve çözülmüş örnek. */
function explanationProse(lesson: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof lesson.overview === "string") parts.push(lesson.overview);
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  for (const section of sections) {
    const item = asRecord(section);
    if (!item) continue;
    if (typeof item.body === "string") parts.push(item.body);
    const check = asRecord(item.check);
    if (check && typeof check.explanation === "string") parts.push(check.explanation);
  }
  const example = asRecord(lesson.example);
  if (typeof example?.solution === "string") parts.push(example.solution);
  return parts.filter((part) => part.trim()).join("\n");
}

export function groundLearnerLesson(
  lesson: unknown,
  source: string,
  options: GroundLessonOptions = {},
): GroundedLesson {
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
    const pushSummary = (text: string) => {
      const key = foldTr(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      kept.push(text);
    };
    // Özet, öğretmen notundan ve ham sayfa satırından kurulmaz.
    // Yalnızca bu dersin kendi anlatım cümleleri adaydır.
    const prose = explanationProse(next);
    for (const item of next.summary) {
      if (typeof item !== "string") continue;
      if (objectiveFiller(item) || metadataDump(item) || danglingTail(item) || workedExampleFragment(item)) {
        removed.push("summary");
        continue;
      }
      const failing = fieldFails(item, source);
      if (failing) {
        const replacement = sourceSentenceFor(item, prose);
        const clean = replacement ? cleanSummarySentence(replacement) : null;
        if (!clean) {
          removed.push("summary");
          continue;
        }
        removed.push("summary:replaced");
        pushSummary(clean);
        continue;
      }
      const precise = preciseSummaryLines(item, prose);
      if (precise) {
        removed.push("summary:replaced");
        for (const line of precise) pushSummary(line);
        continue;
      }
      const clean = cleanSummarySentence(item, 2);
      if (!clean) {
        removed.push("summary");
        continue;
      }
      if (clean !== item.trim()) removed.push("summary:normalized");
      pushSummary(clean);
    }
    if (kept.length < 3 && prose.trim()) {
      let added = false;
      for (const sentence of summaryCandidates(prose)) {
        if (kept.length >= 5) break;
        const before = kept.length;
        pushSummary(sentence);
        if (kept.length > before) added = true;
      }
      if (added) removed.push("summary:backfill");
    }
    if (kept.length) next.summary = kept.slice(0, 5);
    else delete next.summary;
  }

  if (options.upcomingTopics) {
    const upcoming = options.upcomingTopics
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 4);
    const current = Array.isArray(next.nextFocus)
      ? next.nextFocus.filter((item): item is string => typeof item === "string").map((item) => item.trim())
      : [];
    const same =
      current.length === upcoming.length && current.every((item, index) => item === upcoming[index]);
    if (!same) {
      removed.push(upcoming.length ? "nextFocus:replaced" : "nextFocus");
      if (upcoming.length) next.nextFocus = upcoming;
      else delete next.nextFocus;
    }
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
