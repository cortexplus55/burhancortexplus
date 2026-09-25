/**
 * Tahta düzeni. Formül ve çözülmüş adım kendi satırına iner.
 * Saklanan metin değişmez; öğrenci okurken cümle yığını açılır.
 */

export type BoardLine = { kind: "prose" | "formula"; text: string };

function plain(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function overviewDuplicatesSection(overview: string, body: string): boolean {
  const left = plain(overview).toLocaleLowerCase("tr");
  const right = plain(body).toLocaleLowerCase("tr");
  if (left.length < 20 || right.length < 20) return false;
  if (right.includes(left)) return true;
  const head = right.slice(0, Math.min(right.length, left.length));
  return left.startsWith(head) && head.length >= 40;
}

function formulaLike(text: string): boolean {
  const compact = plain(text).replace(/\.$/, "");
  if (compact.length > 180) return false;
  const words = compact.split(/\s+/).filter(Boolean);
  const relation =
    /[A-Za-z](?:_[A-Za-z0-9]+)?\s*(?:>=|<=|>|<|≥|≤)\s*[A-Za-z0-9_]*sat/i.test(compact) &&
    words.length <= 14;
  if (relation) return true;
  if (!/=/.test(compact)) return false;
  if (words.length > 16 && !/^[\d(ρμΔP]/.test(compact)) return false;
  return true;
}

const RELATION_RE =
  /[A-Za-z](?:_[A-Za-z0-9]+)?\s*(?:>=|<=|>|<|≥|≤)\s*[A-Za-z0-9_]*sat[A-Za-z0-9_]*(?:\([^)]*\))?(?:\s*(?:→|->|⇒)\s*[A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){0,3})?/gi;

function splitRelations(sentence: string): string[] {
  const matches = [...sentence.matchAll(new RegExp(RELATION_RE.source, "gi"))];
  if (!matches.length) return [sentence];
  const pieces: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    const before = sentence
      .slice(cursor, start)
      .trim()
      .replace(/[,:;]\s*$/g, "")
      .replace(/^(?:ve|ile)\s+/i, "")
      .trim();
    if (before) pieces.push(before);
    pieces.push(match[0].trim());
    cursor = start + match[0].length;
  }
  const after = sentence
    .slice(cursor)
    .trim()
    .replace(/^[,:;]\s*/g, "")
    .replace(/^(?:ve|ile)\s+/i, "")
    .trim();
  if (after) pieces.push(after);
  return pieces;
}

function splitFormulaList(text: string): string[] {
  const bits = text
    .split(/\s*;\s*/)
    .flatMap((part) =>
      (part.match(/=/g) ?? []).length >= 2 && /,\s*\d/.test(part)
        ? part.split(/,\s+(?=\d)/)
        : [part],
    );
  return bits.map((bit) => bit.trim()).filter(Boolean);
}

function splitBlock(block: string): string[] {
  const sentences = block
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9“"(])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    const relations = splitRelations(sentence);
    if (relations.length > 1) {
      pieces.push(...relations);
      continue;
    }
    const colon = sentence.match(/^(.*?):\s*((?:[A-Za-zρΔμP_][A-Za-z0-9_]*|\d|\().*)$/);
    if (colon && /=/.test(colon[2]) && colon[1].trim().length >= 8) {
      pieces.push(colon[1].trim());
      pieces.push(...splitFormulaList(colon[2]));
      continue;
    }
    if (/;/.test(sentence) && (sentence.match(/=/g) ?? []).length >= 2) {
      pieces.push(...splitFormulaList(sentence));
      continue;
    }
    if ((sentence.match(/=/g) ?? []).length >= 2 && /,\s*\d/.test(sentence)) {
      pieces.push(...sentence.split(/,\s+(?=\d)/).map((part) => part.trim()));
      continue;
    }
    pieces.push(sentence);
  }
  return pieces;
}

export function layoutBoard(text: string): BoardLine[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n+/)
    .flatMap((block) => splitBlock(block))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ kind: formulaLike(line) ? "formula" as const : "prose" as const, text: line }));
}
