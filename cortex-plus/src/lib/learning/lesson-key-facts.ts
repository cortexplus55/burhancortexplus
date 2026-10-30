import { LESSON_SCREEN_HARD_CAP } from "@/lib/learning/lesson-v3";
import { splitTableCells } from "@/lib/learning/interval-text";

/**
 * Kilit bilgiler (ders bağımsız).
 *
 * Konunun kendi sayfalarındaki sayı, oran, kesir, formül, tarih, madde numarası,
 * sıralı adım, tablo satırı, vurgu, istisna ve tanım. Ders adı, terim listesi
 * ya da tek bir sınavın kalıbı yok. Aynı ölçü her belgede aynı sonucu verir.
 */

export const KEY_FACT_CAP = 16;
const LESSON_SCREEN_BASE = 12;

export type KeyFactKind =
  | "sequence"
  | "ratio"
  | "fraction"
  | "formula"
  | "article"
  | "date"
  | "callout"
  | "percent"
  | "count_rule"
  | "emphasis"
  | "table_row"
  | "term"
  | "definition";

export type KeyFact = {
  kind: KeyFactKind;
  text: string;
  signatures: string[];
  stems: string[];
  steps?: string[];
};

export type SourceStructure = "flow" | "cycle" | "matrix" | "tree";

type FactScreen = {
  heading?: string;
  concept?: string;
  blocks: readonly { type: string; text?: string; diagram?: { layout?: string } }[];
};

const PRIORITY: KeyFactKind[] = [
  "sequence",
  "ratio",
  "fraction",
  "formula",
  "article",
  "date",
  "callout",
  "percent",
  "count_rule",
  "term",
  "emphasis",
  "table_row",
  "definition",
];

const STOP = new Set([
  "icin",
  "olan",
  "olarak",
  "daha",
  "gibi",
  "veya",
  "anda",
  "ile",
  "bir",
  "bu",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "does",
]);

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineStems(line: string): string[] {
  const out: string[] = [];
  for (const word of fold(line).split(" ")) {
    if (out.length >= 2) break;
    if (word.length < 4 || STOP.has(word) || /^\d+$/.test(word)) continue;
    const stem = word.slice(0, 5);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

function norm(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .replace(/\s*([:/=^])\s*/g, "$1")
    .replace(/\s+/g, "\u0000");
}

function stickyEdge(neighbor: string, signatureEdge: string): boolean {
  if (!neighbor) return false;
  if (/[0-9a-z]/i.test(neighbor)) return true;
  return /[:/]/.test(neighbor) && /\d/.test(signatureEdge);
}

/** Sayı imzası metinde, yapışık rakamın ya da daha uzun oranın parçası olmadan duruyor mu. */
export function signaturePresent(plain: string, signature: string): boolean {
  const hay = norm(plain);
  const needle = norm(signature);
  if (!needle) return true;
  let from = 0;
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const prev = at > 0 ? hay[at - 1]! : "";
    const next = hay[at + needle.length] ?? "";
    if (!stickyEdge(prev, needle[0]!) && !stickyEdge(next, needle[needle.length - 1]!)) return true;
    from = at + 1;
  }
  return false;
}

function isClock(parts: string[]): boolean {
  if (parts.length < 2 || parts.length > 3) return false;
  const [first, ...rest] = parts;
  const hour = Number(first);
  if (!Number.isInteger(hour) || hour > 23 || (first ?? "").length > 2) return false;
  return rest.every((part) => part.length === 2 && Number(part) <= 59);
}

function dateSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g)) {
    spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return spans;
}

function inside(spans: { start: number; end: number }[], index: number): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

function arrowSteps(line: string): string[] | null {
  if (!/(?:→|->|⇒)/.test(line)) return null;
  const parts = line
    .split(/\s*(?:→|->|⇒)\s*/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part.length > 48)) return null;
  return parts;
}

function numberedSequences(text: string): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length >= 3) groups.push(current);
    current = [];
  };
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    const match = /^(\d{1,2})[.)]\s+(\S.*)$/.exec(line);
    if (match && line.length <= 90 && !line.includes("?")) {
      const n = Number(match[1]);
      if (current.length && n === 1) flush();
      if (!current.length || n === current.length + 1) {
        current.push(match[2]!.trim());
        continue;
      }
    }
    flush();
  }
  flush();
  return groups;
}

function markdownTables(text: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];
  const flush = () => {
    if (current.length >= 2) tables.push(current);
    current = [];
  };
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (line.length > 2 && line.startsWith("|") && line.endsWith("|")) {
      const cells = splitTableCells(line);
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      current.push(cells);
      continue;
    }
    flush();
  }
  flush();
  return tables;
}

function isCrossTable(rows: string[][]): boolean {
  if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) return false;
  const cells = rows.flat().filter(Boolean);
  if (cells.length < 4) return false;
  const avg = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
  return avg <= 12;
}

function hasNestedList(text: string): boolean {
  let nodes = 0;
  let deep = 0;
  for (const raw of text.split(/\n+/)) {
    const match = /^(\s+)(?:[-*•]|\d+[.)])\s+\S/.exec(raw);
    if (!match) continue;
    nodes += 1;
    if ((match[1]?.length ?? 0) >= 2) deep += 1;
  }
  return nodes >= 3 && deep >= 1;
}

function hasRelationshipTree(text: string): boolean {
  const shape = /[□■○●◻◼◯]|(?:^|[^\p{L}])(?:kare|daire|square|circle)(?=[^\p{L}]|$)/iu.test(text);
  const role = /ebeveyn|anne|baba|çocuk|cocuk|kardeş|kardes|(?:^|[^\p{L}])(?:parent|child|sibling|spouse)(?=[^\p{L}]|$)/iu.test(text);
  return shape && role;
}

function pushFact(facts: KeyFact[], fact: KeyFact) {
  const text = fact.text.replace(/\s+/g, " ").trim();
  if (!text) return;
  facts.push({ ...fact, text: text.slice(0, 180) });
}

/** Konunun sayfalarından kilit bilgiler. Kod konuyu bölmez, listeyi dersin kapsam kapısına verir. */
export function lessonKeyFacts(pages: readonly { text?: string }[]): KeyFact[] {
  const text = pages.map((page) => page.text ?? "").join("\n");
  if (!text.trim()) return [];
  const facts: KeyFact[] = [];
  const dates = dateSpans(text);

  for (const steps of numberedSequences(text)) {
    pushFact(facts, { kind: "sequence", text: steps.join(" → "), signatures: [], stems: [], steps });
  }
  for (const line of text.split(/\n+/)) {
    const steps = arrowSteps(line.trim());
    if (steps) pushFact(facts, { kind: "sequence", text: steps.join(" → "), signatures: [], stems: [], steps });
  }

  for (const match of text.matchAll(/\d{1,4}(?:\s*:\s*\d{1,4}){1,5}/g)) {
    const parts = match[0].split(/\s*:\s*/);
    if (isClock(parts)) continue;
    const signature = parts.join(":");
    pushFact(facts, { kind: "ratio", text: signature, signatures: [signature], stems: lineStems(lineAt(text, match.index ?? 0)) });
  }

  for (const match of text.matchAll(/\d{1,4}\s*\/\s*\d{1,4}/g)) {
    if (inside(dates, match.index ?? 0)) continue;
    const signature = match[0].replace(/\s+/g, "");
    pushFact(facts, { kind: "fraction", text: signature, signatures: [signature], stems: lineStems(lineAt(text, match.index ?? 0)) });
  }

  for (const match of text.matchAll(/\b(?:madde|md\.|article|art\.)\s*\d{1,4}\b/gi)) {
    const signature = match[0].replace(/\s+/g, " ").trim();
    pushFact(facts, { kind: "article", text: signature, signatures: [signature], stems: lineStems(lineAt(text, match.index ?? 0)) });
  }

  for (const match of text.matchAll(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g)) {
    pushFact(facts, { kind: "date", text: match[0], signatures: [match[0]], stems: lineStems(lineAt(text, match.index ?? 0)) });
  }
  for (const match of text.matchAll(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g)) {
    if (inside(dates, match.index ?? 0)) continue;
    const line = lineAt(text, match.index ?? 0);
    if (!/\p{L}/u.test(line)) continue;
    pushFact(facts, { kind: "date", text: match[0], signatures: [match[0]], stems: lineStems(line) });
  }

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const calloutBody = calloutRemainder(trimmed);
    if (calloutBody) {
      pushFact(facts, { kind: "callout", text: trimmed.slice(0, 180), signatures: numberSignatures(calloutBody), stems: lineStems(calloutBody) });
    }
    const emphasis = [...trimmed.matchAll(/\*\*([^*]{2,80})\*\*|==([^=]{2,80})==/g)];
    for (const hit of emphasis) {
      const body = (hit[1] || hit[2] || "").trim();
      if (!body) continue;
      pushFact(facts, { kind: "emphasis", text: body, signatures: numberSignatures(body), stems: lineStems(body) });
    }
    const counted = /\b(\d{1,3})\s+(kural|istisna|koşul|kosul|şart|sart|adım|adim|ilke|exception|rule)(?:lar|ler|s)?\b/iu.exec(trimmed);
    if (counted) {
      pushFact(facts, { kind: "count_rule", text: counted[0], signatures: [counted[1]!], stems: lineStems(trimmed) });
    }
    if (/[=^]/.test(trimmed) && trimmed.length <= 100 && /\p{L}/u.test(trimmed)) {
      const signatures = formulaSignatures(trimmed);
      if (signatures.length) pushFact(facts, { kind: "formula", text: trimmed.slice(0, 80), signatures, stems: lineStems(trimmed) });
    } else if (/[+→]|->/.test(trimmed)) {
      const tokens = letterDigitTokens(trimmed);
      if (tokens.length) pushFact(facts, { kind: "formula", text: tokens.join(" "), signatures: tokens.slice(0, 4), stems: lineStems(trimmed) });
    }
    const defined = /^(?:\*\*)?([^:=\n]{2,42}?)(?:\*\*)?\s*[:：]\s+(\S.{7,})$/.exec(trimmed);
    if (defined && !calloutBody && !ratioColon(defined[1] ?? "", defined[2] ?? "")) {
      pushFact(facts, { kind: "definition", text: trimmed.slice(0, 180), signatures: numberSignatures(defined[2] ?? ""), stems: lineStems(defined[1] ?? "") });
    }
  }

  for (const match of text.matchAll(/%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*%/g)) {
    const signature = match[0].replace(/\s+/g, "");
    pushFact(facts, { kind: "percent", text: signature, signatures: [signature], stems: lineStems(lineAt(text, match.index ?? 0)) });
  }

  for (const table of markdownTables(text)) {
    if (!isCrossTable(table)) {
      for (const row of glossaryRows(table)) {
        const label = row[0] ?? "";
        pushFact(facts, { kind: "term", text: `${label}: ${row.slice(1).join(" · ")}`, signatures: numberSignatures(row.join(" ")), stems: lineStems(label) });
      }
      continue;
    }
    for (const row of table.slice(0, 4)) {
      const label = row[0] ?? "";
      const signatures = numberSignatures(row.join(" "));
      pushFact(facts, { kind: "table_row", text: row.join(" | "), signatures, stems: lineStems(label) });
    }
  }

  for (const term of abbreviationTerms(text)) {
    pushFact(facts, { kind: "term", text: `${term.abbr} (${term.expansion})`, signatures: [term.abbr], stems: [] });
  }

  return capFacts(facts);
}

/*
  Terimler (30 Ekim 2026): kaynakta açılımıyla verilen kısaltma ve sözlük tablosunun satırları. Sayısız tanımlar
  bu listeye hiç girmiyordu: "TÜFE (…) hanehalkının …, Yİ-ÜFE (…) üreticilerin … ölçer" satırı ve "Kavram | Anlamı"
  tablosu yazara kilit bilgi diye gitmiyor, onları atlayan ders kapsam ölçüsünden de geçiyordu. Ölçü biçimdendir;
  ders adı ya da terim listesi yok.
*/
const ABBREVIATION = String.raw`\p{Lu}[\p{Lu}\p{N}]*(?:-\p{Lu}[\p{Lu}\p{N}]*)?`;
const ABBR_THEN_EXPANSION = new RegExp(String.raw`(?<![\p{L}\p{N}])(${ABBREVIATION})\s*\(([^()\n]{4,80})\)`, "gu");
const EXPANSION_THEN_ABBR = new RegExp(String.raw`(\p{Lu}\p{Ll}+(?:\s+\p{L}+){1,7})\s*\((${ABBREVIATION})\)`, "gu");
const TERM_CAP = 6;

function isAbbreviation(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2 || value.length > 10) return false;
  return !/^[IVXLCDM]+$/.test(letters);
}

/** Açılım en az iki sözcük, küçük harf taşır, rakam taşımaz; sözcüklerinden biri kısaltmanın ilk harfiyle başlar. */
function isExpansion(abbr: string, expansion: string): boolean {
  const words = expansion.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length < 2 || !/\p{Ll}/u.test(expansion) || /\d/.test(expansion)) return false;
  const first = fold(abbr).charAt(0);
  return words.some((word) => fold(word).charAt(0) === first);
}

/** Kaynakta açılımıyla verilen kısaltmalar: "TÜFE (Tüketici Fiyat Endeksi)" ya da "… Merkez Bankası (TCMB)". */
export function abbreviationTerms(text: string): { abbr: string; expansion: string }[] {
  const out: { abbr: string; expansion: string }[] = [];
  const add = (abbr: string, expansion: string) => {
    const clean = expansion.replace(/\s+/g, " ").trim();
    if (!isAbbreviation(abbr) || !isExpansion(abbr, clean)) return;
    if (out.some((item) => item.abbr === abbr)) return;
    out.push({ abbr, expansion: clean });
  };
  for (const match of text.matchAll(ABBR_THEN_EXPANSION)) add(match[1] ?? "", match[2] ?? "");
  for (const match of text.matchAll(EXPANSION_THEN_ABBR)) add(match[2] ?? "", match[1] ?? "");
  return out.slice(0, TERM_CAP);
}

/** Sözlük tablosu: başlık satırından sonra ilk hücre kısa bir terim, yanındaki hücre onun açıklaması. */
function glossaryRows(table: string[][]): string[][] {
  const rows = table.slice(1);
  if (rows.length < 2 || (table[0]?.length ?? 0) < 2) return [];
  const termLike = (cell: string) => /\p{L}/u.test(cell) && cell.length <= 40 && cell.split(/\s+/).length <= 5;
  if (!rows.every((row) => termLike(row[0] ?? "") && (row[1] ?? "").length >= 8)) return [];
  return rows.slice(0, TERM_CAP);
}

function calloutRemainder(line: string): string | null {
  const match = /^[\s"'“”«»]*(\p{L}+)\s*([:：\-—])\s*(\S.*)$/u.exec(line);
  if (!match) return null;
  const label = fold(match[1] ?? "");
  if (!/^(?:dikkat|istisna|uyari|sinavda|exception|warning)$/.test(label)) return null;
  const body = (match[3] ?? "").trim();
  return body || null;
}

function ratioColon(left: string, right: string): boolean {
  return /\d\s*$/.test(left) && /^\s*\d/.test(right);
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end < 0 ? text.length : end);
}

function numberSignatures(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\d+(?:[.,:/]\d+)*/g)) {
    const token = match[0];
    if (token === "0" || token === "1") continue;
    out.push(token);
  }
  return [...new Set(out)].slice(0, 3);
}

function formulaSignatures(line: string): string[] {
  const collapsed = line.replace(/\s*([:/=^])\s*/g, "$1");
  const parts = collapsed.split(/\s+/).filter((part) => /[=^]/.test(part) || /\d/.test(part));
  return [...new Set([...parts, ...numberSignatures(line), ...letterDigitTokens(line)])].slice(0, 4);
}

function letterDigitTokens(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z]?\d+[A-Za-z0-9]*/g)) out.push(match[0]);
  for (const match of text.matchAll(/[A-Za-z0-9]+\s*\^\s*[A-Za-z0-9]+/g)) out.push(match[0].replace(/\s+/g, ""));
  return [...new Set(out)].slice(0, 4);
}

function capFacts(facts: KeyFact[]): KeyFact[] {
  const sorted = [...facts].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  const seen = new Set<string>();
  const out: KeyFact[] = [];
  for (const fact of sorted) {
    const key = `${fact.kind}:${fact.signatures.join("|")}:${fold(fact.text).slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
    if (out.length >= KEY_FACT_CAP) break;
  }
  return out;
}

function blockText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(blockText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(blockText).filter(Boolean).join("\n");
  }
  return "";
}

/** Öğrencinin gördüğü metin. JSON kaçışı satır başını bir önceki harfe yapıştırmaz. */
function lessonPlain(screens: readonly FactScreen[]): string {
  return screens.map((screen) => blockText(screen)).join("\n");
}

function stepsInOrder(plain: string, steps: readonly string[]): boolean {
  const folded = fold(plain);
  let from = 0;
  for (const step of steps) {
    const needle = fold(step).slice(0, 24);
    if (!needle) return false;
    const at = folded.indexOf(needle, from);
    if (at < 0) {
      const stem = lineStems(step)[0];
      if (!stem) return false;
      const stemAt = folded.indexOf(stem, from);
      if (stemAt < 0) return false;
      from = stemAt + stem.length;
      continue;
    }
    from = at + Math.min(needle.length, 8);
  }
  return true;
}

/** Derste sayı imzası yoksa ya da içerik köklerinin yarısından azı geçiyorsa kilit bilgi açıkta. */
export function uncoveredKeyFacts(screens: readonly FactScreen[], facts: readonly KeyFact[]): KeyFact[] {
  if (!facts.length || !screens.length) return [...facts];
  const plain = lessonPlain(screens);
  const folded = fold(plain);
  return facts.filter((fact) => {
    if (fact.kind === "sequence" && fact.steps?.length) return !stepsInOrder(plain, fact.steps);
    const sigFail = fact.signatures.some((signature) => !signaturePresent(plain, signature));
    const hits = fact.stems.filter((stem) => folded.includes(stem)).length;
    const stemFail = fact.stems.length > 0 && hits * 2 < fact.stems.length;
    return sigFail || stemFail;
  });
}

/** Kaynakta çözülmüş bir problem var mı (başlık ya da çözüm satırı). */
export function sourceHasWorkedProblem(text: string): boolean {
  return /(?:^|\n)\s*(?:#{1,4}\s*|\d+[.)]\s*)?(?:çözümlü örnek|örnek çözüm|adım adım çözüm|worked example|worked problem)\b|(?:^|\n)\s*çözüm\s*:/iu.test(
    text,
  );
}

/** Kaynak bir süreç, döngü, kısa hücreli tablo ya da dallanan/ilişki ağacı taşıyor mu. */
export function sourceStructures(pages: readonly { text?: string }[]): SourceStructure[] {
  const text = pages.map((page) => page.text ?? "").join("\n");
  if (!text.trim()) return [];
  const found = new Set<SourceStructure>();
  const arrows = text.split(/\n+/).some((line) => (arrowSteps(line.trim())?.length ?? 0) >= 2);
  const steps = numberedSequences(text).length > 0;
  const cycle = /(?:^|[^\p{L}])(?:döngü|dongu|cycle)(?=[^\p{L}]|$)|başa döner|basa doner/iu.test(text);
  if ((arrows || steps) && cycle) found.add("cycle");
  else if (arrows || steps) found.add("flow");
  if (markdownTables(text).some(isCrossTable)) found.add("matrix");
  if (hasNestedList(text) || hasRelationshipTree(text)) found.add("tree");
  return [...found];
}

export function lessonDiagramLayouts(screens: readonly FactScreen[]): Set<string> {
  return new Set(
    screens.flatMap((screen) =>
      screen.blocks.flatMap((block) => (block.type === "diagram" && block.diagram?.layout ? [block.diagram.layout] : [])),
    ),
  );
}

export function missingStructures(screens: readonly FactScreen[], required: readonly SourceStructure[]): SourceStructure[] {
  const layouts = lessonDiagramLayouts(screens);
  return required.filter((layout) => {
    if (layout === "flow") return !layouts.has("flow") && !layouts.has("cycle");
    return !layouts.has(layout);
  });
}

/** Kapsam kapısı: kilit bilgi, çözümlü örnek ve istenen şema duruyorsa ders bu ölçüyle biter. */
export function lessonReadyToFinish(
  screens: readonly FactScreen[],
  options: { facts: readonly KeyFact[]; structures: readonly SourceStructure[]; worked: boolean; missingBackbone?: number },
): boolean {
  if ((options.missingBackbone ?? 0) > 0) return false;
  if (uncoveredKeyFacts(screens, options.facts).length > 0) return false;
  if (options.worked && !screens.some((screen) => screen.blocks.some((block) => block.type === "example"))) return false;
  if (missingStructures(screens, options.structures).length > 0) return false;
  return true;
}

/** Kilit bilgi varken ekran tavanı esner; bilgi yokken 12 kalır. Sert tavan maliyet içindir. */
export function lessonScreenCap(factCount: number): number {
  if (factCount <= 0) return LESSON_SCREEN_BASE;
  const extra = Math.min(4, Math.max(1, Math.ceil(factCount / 4)));
  return Math.min(LESSON_SCREEN_HARD_CAP, LESSON_SCREEN_BASE + extra);
}

/** Yazara giden kilit bilgi listesi. Metin kaynaktan gelir; kod örnek uydurmaz. */
export function keyFactsBlock(facts: readonly KeyFact[]): string {
  if (!facts.length) return "";
  return (
    "KİLİT BİLGİLER (kaynaktan; her biri derste kendi sayı imzasıyla geçmeli):\n" +
    facts.map((fact, index) => `${index + 1}) ${fact.text}`).join("\n") +
    "\nSayı, oran, kesir, formül, tarih ve madde numarası kaynaktaki yazımıyla durur. Kısaltma ve terim derste adıyla " +
    "geçer ve ne olduğu söylenir. Sıralı adımlar aynı sırada kalır. " +
    "Kaynakta çözümlü problem varsa en az bir example bloğu yaz (kaynaktaki sayılarla)."
  );
}
