/**
 * Tahta düzeni. Formül ve çözülmüş adım kendi satırına iner.
 * Saklanan metin değişmez; öğrenci okurken cümle yığını açılır.
 */

import { foldTr } from "@/lib/documents/page-analysis";

export type BoardLine = { kind: "prose" | "formula"; text: string };

const SUB_DIGIT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};
const SUP_DIGIT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** "P r" ve "∫ 1 2" alt simge ile integral sınırına döner. */
export function restoreMathNotation(text: string): string {
  return text
    .replace(/∫\s*_?\s*([0-9])\s*\^\s*([0-9])/g, (_, lower: string, upper: string) => {
      return `∫${SUB_DIGIT[lower] ?? lower}${SUP_DIGIT[upper] ?? upper}`;
    })
    .replace(/∫\s*([0-9])\s*([0-9])(?=\s|[A-Za-zΔ]|$)/g, (_, lower: string, upper: string) => {
      return `∫${SUB_DIGIT[lower] ?? lower}${SUP_DIGIT[upper] ?? upper}`;
    })
    .replace(/\b([PT])\s+cr\b/g, "$1_cr")
    .replace(/\b([PT])cr\b/g, "$1_cr")
    .replace(/\b([PT])\s+r\b/g, "$1ᵣ");
}

/** Formül cümleden ayrılınca "ise ile bulunur" boşluğu kalmışsa cümle bozuktur. */
export function gappedFormulaFrame(text: string): boolean {
  return /\bise\s+ile\s+(bulunur|hesaplanir|ifade edilir)/.test(foldTr(text));
}

/** Çerçeve düşer; formül duruyorsa cümlede kalır. */
export function repairGappedFrame(sentence: string): string | null {
  if (!gappedFormulaFrame(sentence)) return sentence;
  const kept = sentence
    .replace(/toplam\s+iş\s+ise\s+ile\s+bulunur\s*:?/gi, "")
    .replace(/\bise\s+ile\s+(?:bulunur|hesaplanır|hesaplanir|ifade\s+edilir)\s*:?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (kept.length < 8 || gappedFormulaFrame(kept)) return null;
  return kept;
}

/**
 * İki bağıntı araya nokta konmadan yapışırsa cümle bölünür.
 * "W = ∫₁² P dV Sabit basınçta W = …" okunur hâle gelir.
 */
export function separateRunOnFormulas(text: string): string {
  return text.replace(
    /(=)\s*((?:[^,.;=\n])+?)\s+(?=[A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü]{3,}\s)/g,
    (_match, eq: string, right: string) => `${eq} ${right.trim()}. `,
  );
}

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

/** Sağ tarafı boş ya da işlemle biten satır formül diye basılmaz. */
export function incompleteFormulaLine(text: string): boolean {
  const compact = plain(text).replace(/\.$/, "").trim();
  if (!/=/.test(compact)) return false;
  if (/[=+×*/\-−]\s*$/.test(compact)) return true;
  const right = compact.split("=").pop()?.trim() ?? "";
  return !right || /^[+×*/\-−]+$/.test(right);
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
    if (!lead || /\b(?:ise|ile)\s*$/i.test(lead)) return "";
    return `${lead} ${core}:`;
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
  return [phraseBeforeFormula(match[1], lead), relation].filter((part) => part.trim().length > 0);
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
  const normalized = restoreMathNotation(text)
    .replace(/\r\n/g, "\n")
    .replace(/\s+(?=Veri\s*:)/gi, "\n")
    .replace(/\s+(?=Adım\s*\d+\s*:)/gi, "\n")
    .trim();
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
    })
    .filter((line) => line.kind !== "formula" || !incompleteFormulaLine(line.text));
}
