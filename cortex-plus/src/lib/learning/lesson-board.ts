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
  // Bağıntının ardındaki cümle formül satırına yapışmışsa formül sayma.
  if (/[.!?]\s+[A-ZÇĞİÖŞÜ]/.test(compact)) return false;
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

function cleanPiece(text: string): string {
  return text.replace(/[;]+\s*$/g, "").trim();
}

/** "1. P = F/A" numarası gider. "1 kPa" kalır — rakamın ardında nokta yok. */
function stripListMarker(text: string): string {
  return text.replace(/^\d{1,2}[.)]\s+(?=\S)/, "").trim();
}

function splitNumbered(text: string): string[] {
  const parts = text.split(/\s+(?=\d{1,2}[.)]\s+)/);
  return parts.map(stripListMarker).filter(Boolean);
}

/**
 * Satır ortasında kırılan cümle ve "=" ile devam eden adım birleşir.
 * Yeni cümle (noktadan sonra büyük harf) ayrı kalır.
 */
function rejoinLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = stripListMarker(raw.trim());
    if (!line) continue;
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(line);
      continue;
    }
    const prevPlain = plain(prev);
    const nextPlain = plain(line);
    const prevClosed = /[.!?:;]$/.test(prevPlain);
    const lowerCont = /^[a-zçğıöşü]/.test(nextPlain);
    const equalsCont = /^=/.test(nextPlain);
    if (equalsCont || (!prevClosed && lowerCont)) {
      out[out.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ").trim();
      continue;
    }
    out.push(line);
  }
  return out;
}

const TRAILING_FORMULA_PHRASE =
  /\s+((?:şeklinde|seklinde)\s+(?:hesaplanabilir|yazılır|yazilir|bulunur|tanımlanır|tanimlanir)|olarak\s+(?:ifade\s+edilir|yazılır|yazilir|hesaplanır|hesaplanir)|ile\s+(?:bulunur|hesaplanır|hesaplanir|ifade\s+edilir))\.?$/i;

function phraseBeforeFormula(phrase: string, lead: string): string {
  const core = phrase.replace(/\.$/, "").trim();
  if (/^(?:şeklinde|seklinde)\s+/i.test(core)) {
    const rest = core.replace(/^(?:şeklinde|seklinde)\s+/i, "");
    return lead ? `${lead} şu şekilde ${rest}:` : `Şu şekilde ${rest}:`;
  }
  if (/^olarak\s+/i.test(core)) {
    return lead ? `${lead} şöyle ${core}:` : `Şöyle ${core}:`;
  }
  if (/^ile\s+/i.test(core)) {
    return lead ? `${lead} ${core}:` : `Bağıntı ${core}:`;
  }
  return lead ? `${lead} ${core}:` : `${core}:`;
}

function splitLeadAndRelation(head: string): { lead: string; relation: string } {
  const match = head.match(/^(.*?)((?:[A-Za-zρΔμP_][A-Za-z0-9_]*|\d|\()\s*[=<>≤≥].*)$/);
  if (!match) return { lead: "", relation: head.trim() };
  const lead = match[1].replace(/[.:;\s]+$/g, "").trim();
  const relation = match[2].trim();
  if (lead.length < 2) return { lead: "", relation: head.trim() };
  return { lead, relation };
}

/** "y = y_f + x * y_fg şeklinde hesaplanabilir" — kalıp formül satırından çıkar. */
function detachTrailingFormulaPhrase(sentence: string): string[] | null {
  const match = sentence.match(TRAILING_FORMULA_PHRASE);
  if (!match || match.index == null) return null;
  const head = sentence.slice(0, match.index).trim();
  if (!/[=<>≤≥]/.test(head)) return null;
  const { lead, relation } = splitLeadAndRelation(head);
  if (!relation || !/[=<>≤≥]/.test(relation)) return null;
  return [phraseBeforeFormula(match[1], lead), relation];
}

function peelFormulas(sentence: string): string[] {
  const detached = detachTrailingFormulaPhrase(sentence);
  if (detached) return detached.flatMap((part) => peelFormulas(part));
  const colon = sentence.match(/^(.*?):\s*((?:[A-Za-zρΔμP_][A-Za-z0-9_]*|\d|\().*)$/);
  if (colon && /[=<>≤≥]/.test(colon[2]) && colon[1].trim().length >= 8 && !/=/.test(colon[1])) {
    return [cleanPiece(colon[1]), ...peelFormulas(colon[2])];
  }
  if (/;/.test(sentence) && (sentence.match(/=/g) ?? []).length >= 1) {
    const bits = sentence
      .split(/\s*;\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (bits.length > 1) return bits.flatMap((bit) => peelFormulas(bit));
  }
  if ((sentence.match(/=/g) ?? []).length >= 2 && /,\s*\d/.test(sentence)) {
    return sentence
      .split(/,\s+(?=\d)/)
      .map((part) => cleanPiece(part))
      .filter(Boolean);
  }
  return [cleanPiece(sentence)];
}

function splitBlock(block: string): string[] {
  const pieces: string[] = [];
  for (const chunk of splitNumbered(block)) {
    const sentences = chunk
      .split(/(?<=[.!?])\s+(?=\*{0,2}[A-ZÇĞİÖŞÜ0-9“"(])/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const relations = splitRelations(sentence);
      if (relations.length > 1) {
        pieces.push(...relations.map(cleanPiece));
        continue;
      }
      pieces.push(...peelFormulas(sentence));
    }
  }
  return pieces;
}

export function layoutBoard(text: string): BoardLine[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return rejoinLines(normalized.split(/\n+/))
    .flatMap((block) => splitBlock(block))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const formula = formulaLike(line);
      return {
        kind: formula ? ("formula" as const) : ("prose" as const),
        text: formula ? cleanPiece(line).replace(/\.$/, "").replace(/(?<!\*)\*(?!\*)/g, "·") : line,
      };
    });
}
