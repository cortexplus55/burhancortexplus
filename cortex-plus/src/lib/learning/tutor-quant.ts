/**
 * Sohbet yanıtındaki sayısal iddia ve çözümlü örnek denetimi.
 *
 * Önce deterministik aritmetik (mol/katsayı, eşitlik, tarih yılı).
 * Ayrıştırılamayan çözümlü örnek için küçük model ikinci kez türetir;
 * o çağrı bu dosyada yok — rota `needsQuantModelCheck` görünce yapar.
 * Kimya, fizik, iktisat ve tarih aynı kapıdan geçer.
 */

import { foldTr } from "@/lib/documents/page-analysis";

const SUB: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

export type QuantIssue = {
  kind: "limiting" | "arithmetic" | "date";
  detail: string;
  /** Yanlış cümlenin yerine konacak kısa düzeltme. */
  repair: string;
  /** Birebir değiştirilecek parça. Yoksa cümle aranır. */
  span?: string;
};

export type QuantAudit = {
  ok: boolean;
  /** En az bir iddia deterministik kontrol edildi. */
  checked: boolean;
  issues: QuantIssue[];
};

export type ClaimVerdict = "dogru" | "kismen" | "yanlis";

export type GradedClaim = {
  verdict: ClaimVerdict;
  /** Öğrenciye gösterilecek hüküm satırı. */
  verdictLine: string;
  rightParts: string[];
  wrongParts: string[];
  conclusion: string;
  wrongType: string;
  topicLabel: string;
};

type Reactant = { species: string; display: string; coefficient: number };

function normFormula(raw: string): string {
  const stripped = raw.replace(/[₀-₉]/g, (ch) => SUB[ch] ?? ch);
  return foldTr(stripped).replace(/[^a-z0-9]/g, "");
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function formatTr(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

function cleanEquationSide(side: string): string {
  return side
    .replace(/\((?:g|s|l|aq|k)\)/gi, "")
    .replace(/[↑↓]/g, "")
    .trim();
}

function parseSide(side: string): Reactant[] {
  const out: Reactant[] = [];
  for (const part of cleanEquationSide(side).split(/\s*\+\s*/)) {
    const token = part.trim();
    const match = token.match(/^(\d+(?:[.,]\d+)?)?\s*([A-Za-z][A-Za-z0-9₀-₉]*)$/);
    if (!match) continue;
    const coefficient = match[1] ? parseNumber(match[1]) : 1;
    if (!(coefficient > 0)) continue;
    out.push({ species: normFormula(match[2]), display: match[2], coefficient });
  }
  return out;
}

export function parseReaction(text: string): Reactant[] | null {
  const cleaned = text.replace(/\((?:g|s|l|aq|k)\)/gi, "");
  const match = cleaned.match(
    /((?:\d+(?:[.,]\d+)?)?\s*[A-Za-z][A-Za-z0-9₀-₉]*(?:\s*\+\s*(?:\d+(?:[.,]\d+)?)?\s*[A-Za-z][A-Za-z0-9₀-₉]*)+)\s*(?:→|->|=>)/,
  );
  if (!match) return null;
  const reactants = parseSide(match[1]);
  if (reactants.length < 2) return null;
  return reactants;
}

function parseAmounts(text: string): Map<string, number> {
  const amounts = new Map<string, number>();
  const forward = /(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/gi;
  const reverse = /([A-Za-z][A-Za-z0-9₀-₉]*)\s+(\d+(?:[.,]\d+)?)\s*mol/gi;
  for (const match of text.matchAll(forward)) {
    amounts.set(normFormula(match[2]), parseNumber(match[1]));
  }
  for (const match of text.matchAll(reverse)) {
    const key = normFormula(match[1]);
    if (!amounts.has(key)) amounts.set(key, parseNumber(match[2]));
  }
  return amounts;
}

function claimedLimiter(text: string, reactants: Reactant[]): { kind: "none" | "species"; species?: string; display?: string } | null {
  const folded = foldTr(text);
  if (/(hicbiri|ikisi de|neither|both fully|tamamen tuken)/.test(folded) && /(sinirlay|limiting|tuken)/.test(folded)) {
    return { kind: "none" };
  }
  const match = text.match(/([A-Za-z][A-Za-z0-9₀-₉]*)\s*,?\s*(?:sınırlayıcı(?:d[ıi]r|dır)?|limiting)/i);
  if (!match) return null;
  const species = normFormula(match[1]);
  const known = reactants.find((item) => item.species === species);
  if (!known) return null;
  return { kind: "species", species, display: known.display };
}

type RatioRow = Reactant & { moles: number; ratio: number };

function ratiosFor(reactants: Reactant[], amounts: Map<string, number>): RatioRow[] | null {
  const rows: RatioRow[] = [];
  for (const reactant of reactants) {
    const moles = amounts.get(reactant.species);
    if (moles == null || !(moles >= 0)) return null;
    rows.push({ ...reactant, moles, ratio: moles / reactant.coefficient });
  }
  return rows;
}

function limitingOf(rows: RatioRow[]): { none: boolean; species: RatioRow[] } {
  const min = Math.min(...rows.map((row) => row.ratio));
  const species = rows.filter((row) => Math.abs(row.ratio - min) <= 1e-6);
  return { none: species.length === rows.length, species };
}

function ratioSentence(rows: RatioRow[], result: { none: boolean; species: RatioRow[] }): string {
  const bits = rows.map((row) => `${row.display}: ${formatTr(row.moles)} / ${formatTr(row.coefficient)} = ${formatTr(row.ratio)}`);
  if (result.none) {
    return `Oranlar eşit (${bits.join("; ")}). Hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir.`;
  }
  const name = result.species.map((row) => row.display).join(", ");
  return `Oranlar: ${bits.join("; ")}. Küçük oran ${name} için; sınırlayıcı ${name}.`;
}

function limitingIssues(text: string): QuantIssue[] {
  const reactants = parseReaction(text);
  if (!reactants) return [];
  const amounts = parseAmounts(text);
  const rows = ratiosFor(reactants, amounts);
  if (!rows) return [];
  const claim = claimedLimiter(text, reactants);
  if (!claim) return [];
  const result = limitingOf(rows);
  const repair = ratioSentence(rows, result);
  if (claim.kind === "none") {
    return result.none ? [] : [{ kind: "limiting", detail: repair, repair }];
  }
  const claimedIsLimiting = !result.none && result.species.some((row) => row.species === claim.species);
  if (result.none || !claimedIsLimiting) {
    return [{ kind: "limiting", detail: repair, repair }];
  }
  return [];
}

function evalArith(expr: string): number | null {
  const normalized = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
  const tokens = normalized.match(/\d+(?:[.,]\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length < 3) return null;
  const values: number[] = [];
  const ops: string[] = [];
  for (const token of tokens) {
    if (/^[+\-*/]$/.test(token) && values.length > ops.length) ops.push(token);
    else if (/^\d/.test(token)) {
      const n = parseNumber(token);
      if (!Number.isFinite(n)) return null;
      values.push(n);
    }
  }
  if (values.length !== ops.length + 1 || values.length < 2) return null;
  const collapsed: number[] = [values[0]];
  const addOps: string[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const next = values[i + 1];
    if (ops[i] === "*" || ops[i] === "/") {
      const left = collapsed.pop();
      if (left == null || (ops[i] === "/" && next === 0)) return null;
      collapsed.push(ops[i] === "*" ? left * next : left / next);
    } else {
      addOps.push(ops[i]);
      collapsed.push(next);
    }
  }
  let acc = collapsed[0];
  for (let i = 0; i < addOps.length; i += 1) {
    acc = addOps[i] === "+" ? acc + collapsed[i + 1] : acc - collapsed[i + 1];
  }
  return acc;
}

function arithmeticIssues(text: string): QuantIssue[] {
  const issues: QuantIssue[] = [];
  const pattern = /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*(≈|~|=)\s*(\d+(?:[.,]\d+)?)/g;
  for (const match of text.matchAll(pattern)) {
    const actual = evalArith(match[1]);
    const stated = parseNumber(match[3]);
    if (actual == null || !Number.isFinite(stated)) continue;
    const approx = match[2] !== "=";
    const diff = Math.abs(actual - stated);
    const tol = approx ? Math.max(0.02, Math.abs(actual) * 0.02) : Math.max(0.005, Math.abs(actual) * 0.005);
    if (diff <= tol) continue;
    const repair = `${match[1].replace(/\s+/g, " ")} = ${formatTr(actual)}`;
    issues.push({
      kind: "arithmetic",
      detail: `Yazılan sonuç ${match[3]}; hesap ${formatTr(actual)}.`,
      repair,
      span: match[0],
    });
  }
  return issues;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dateIssues(reply: string, source: string): QuantIssue[] {
  if (!source.trim()) return [];
  const issues: QuantIssue[] = [];
  const sourceSentences = sentencesOf(source);
  for (const sentence of sentencesOf(reply)) {
    const replyYears = [...sentence.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map((item) => Number(item[1]));
    if (replyYears.length !== 1) continue;
    const tokens = foldTr(sentence)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !/^\d+$/.test(word));
    if (!tokens.length) continue;
    for (const sourceSentence of sourceSentences) {
      const sourceYears = [...sourceSentence.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map((item) => Number(item[1]));
      if (sourceYears.length !== 1 || sourceYears[0] === replyYears[0]) continue;
      const hay = foldTr(sourceSentence);
      const shared = tokens.some((token) => hay.includes(token.slice(0, Math.min(token.length, 6))));
      if (!shared) continue;
      issues.push({
        kind: "date",
        detail: `Kaynak ${sourceYears[0]} diyor; yanıt ${replyYears[0]} diyor.`,
        repair: `Kaynaktaki yıl ${sourceYears[0]}.`,
      });
      break;
    }
  }
  return issues;
}

/** Çözümlü örnek ve eşitlikleri kaynak metne karşı denetler. */
export function auditQuantitative(text: string, source = ""): QuantAudit {
  const limiting = limitingIssues(text);
  const arithmetic = arithmeticIssues(text);
  const dates = dateIssues(text, source);
  const issues = [...limiting, ...arithmetic, ...dates];
  const checked = limiting.length > 0 || arithmetic.length > 0 || dates.length > 0
    || Boolean(parseReaction(text) && claimedLimiter(text, parseReaction(text) ?? []))
    || arithmeticPatternSeen(text)
    || (Boolean(source) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text));
  return { ok: issues.length === 0, checked, issues };
}

function arithmeticPatternSeen(text: string): boolean {
  return /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*(≈|~|=)\s*(\d+(?:[.,]\d+)?)/.test(text);
}

/**
 * Ayrıştırılmış hata varsa cümleyi düzeltir. Düzeltemezse örneği düşürür.
 * Küçük model ancak `needsQuantModelCheck` true ise çağrılır.
 */
export function repairQuantitative(text: string, audit: QuantAudit): string {
  if (audit.ok || !audit.issues.length) return text;
  let next = text;
  for (const issue of audit.issues) {
    if (issue.kind === "limiting") {
      next = replaceLimitingSentence(next, issue.repair);
    } else if (issue.kind === "arithmetic" && issue.span) {
      next = next.replace(issue.span, issue.repair);
    } else if (issue.kind === "arithmetic") {
      next = next.replace(
        /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*(≈|~|=)\s*(\d+(?:[.,]\d+)?)/,
        issue.repair,
      );
    } else if (!next.includes(issue.repair)) {
      next = `${next.trim()}\n\n${issue.repair}`;
    }
  }
  return next;
}

function replaceLimitingSentence(text: string, repair: string): string {
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  let replaced = false;
  const next = parts.map((part) => {
    if (replaced) return part;
    if (/(sınırlayıcı|sinirlayici|limiting)/i.test(part)) {
      replaced = true;
      return repair;
    }
    return part;
  });
  if (replaced) return next.join(" ").replace(/\s+\n/g, "\n").trim();
  return `${text.trim()}\n\n${repair}`;
}

/** Sayı var ama deterministik denetim iddiayı görmediyse küçük model bakmalı. */
export function needsQuantModelCheck(text: string, audit: QuantAudit): boolean {
  if (!audit.ok) return false;
  if (audit.checked && audit.issues.length === 0 && (parseReaction(text) || arithmeticPatternSeen(text))) {
    return false;
  }
  const numeric = /\d/.test(text);
  const worked = /→|->|≈|=/.test(text) && numeric;
  return worked && !audit.checked;
}

export function quantSelfCheckPrompt(reply: string): { system: string; user: string } {
  return {
    system:
      "Sayısal doğrulama. Yanıttaki her hesap, oran ve hükmü yeniden türet. " +
      "Yeni anlatım yazma. Türkçe ondalık virgül sayıdır. " +
      'JSON: {"ok":boolean,"note":string}. ok false yalnız sonuç aritmetikle çelişiyorsa. note en fazla 160 karakter.',
    user: reply.slice(0, 4000),
  };
}

export function parseQuantSelfCheck(raw: string): { ok: boolean; note: string } | null {
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown; note?: unknown };
    if (typeof parsed.ok !== "boolean") return null;
    return { ok: parsed.ok, note: typeof parsed.note === "string" ? parsed.note.slice(0, 200) : "" };
  } catch {
    return null;
  }
}

/** Model "uyuşmuyor" derse çözümlü örneği düşür; uydurma sayı koyma. */
export function dropUnverifiedExample(text: string): string {
  const parts = text.split(/\n{2,}/);
  const kept = parts.filter((part) => !/(→|->)/.test(part) && !/\d\s*[+×÷*/\-]\s*\d\s*[=≈]/.test(part));
  if (kept.length === parts.length) {
    return `${text.trim()}\n\nBu örnekteki sonucu yeniden türetince tutmadı; örneği çıkardım.`;
  }
  if (!kept.length) {
    return "Bu örnekteki sayı tutmadığı için onu çıkardım. İstersen mol / katsayı oranını birlikte yeniden kuralım.";
  }
  return `${kept.join("\n\n").trim()}\n\nÖrnekteki sonuç tutmadığı için o örneği çıkardım.`;
}

const GRAM_RULE = /daha az gram|gramsa|az gram|kutle(?:si)? (?:kucuk|az)|kütle(?:si)? (?:küçük|az)|less mass|fewer grams|smaller mass/i;

function gramMisconception(text: string): boolean {
  const folded = foldTr(text);
  return GRAM_RULE.test(text) || /daha az gram|gramsa|az gram/.test(folded) || (/gram/.test(folded) && /sinirlay/.test(folded));
}

/**
 * Öğrencinin iddiasını, önce doğru sonucu hesaplayarak hükümler.
 * Eşit oran "kısmen doğru" değildir: hüküm yanlış, sonuç "hiçbiri sınırlayıcı değil".
 */
export function gradeStudentClaim(input: { student: string; context?: string }): GradedClaim | null {
  const student = input.student.trim();
  if (!student) return null;
  const context = input.context ?? "";
  const reactants = parseReaction(student) ?? parseReaction(context);
  const amounts = parseAmounts(`${student}\n${context}`);
  if (reactants && amounts.size) {
    const rows = ratiosFor(reactants, amounts);
    const claim = claimedLimiter(student, reactants);
    if (rows && claim) {
      const result = limitingOf(rows);
      const repair = ratioSentence(rows, result);
      const statedMoles = rows.map((row) => `${formatTr(row.moles)} mol ${row.display}`).join(", ");
      if (claim.kind === "none") {
        if (result.none) {
          return {
            verdict: "dogru",
            verdictLine: "Doğru: hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir.",
            rightParts: ["Oranlar eşit.", `Mol sayıları: ${statedMoles}.`],
            wrongParts: [],
            conclusion: repair,
            wrongType: "",
            topicLabel: "Sınırlayıcı bileşen",
          };
        }
        return {
          verdict: "yanlis",
          verdictLine: `Yanlış: sınırlayıcı ${result.species.map((row) => row.display).join(", ")}.`,
          rightParts: [],
          wrongParts: ["Eşit oran yok; küçük oran sınırlayıcıyı verir."],
          conclusion: repair,
          wrongType: "sinirlayici_oran",
          topicLabel: "Sınırlayıcı bileşen",
        };
      }
      const rightSpecies = !result.none && result.species.some((row) => row.species === claim.species);
      if (result.none || !rightSpecies) {
        const line = result.none
          ? "Yanlış: hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir."
          : `Yanlış: sınırlayıcı ${result.species.map((row) => row.display).join(", ")}.`;
        return {
          verdict: "yanlis",
          verdictLine: line,
          rightParts: [`Mol sayıları hesaba katıldı (${statedMoles}).`],
          wrongParts: result.none
            ? ["Az olan mol, sınırlayıcı demek değildir; katsayıya bölününce oranlar eşit."]
            : [`${claim.display ?? "Bu madde"} sınırlayıcı değil.`],
          conclusion: repair,
          wrongType: gramMisconception(student) ? "gram_karsilastirma" : "sinirlayici_oran",
          topicLabel: "Sınırlayıcı bileşen",
        };
      }
      if (gramMisconception(student)) {
        return {
          verdict: "kismen",
          verdictLine: `Kısmen doğru: sınırlayıcı ${claim.display}; gerekçe yanlış.`,
          rightParts: [`Sınırlayıcı madde ${claim.display}.`],
          wrongParts: ["Gramı az olan sınırlayıcı değildir. Karar mol / katsayı oranına bakar."],
          conclusion: repair,
          wrongType: "gram_karsilastirma",
          topicLabel: "Sınırlayıcı bileşen",
        };
      }
      return {
        verdict: "dogru",
        verdictLine: `Doğru: sınırlayıcı ${claim.display}.`,
        rightParts: [repair],
        wrongParts: [],
        conclusion: repair,
        wrongType: "",
        topicLabel: "Sınırlayıcı bileşen",
      };
    }
  }

  if (gramMisconception(student) && /(sınırlayıcı|limiting)/i.test(student)) {
    return {
      verdict: "yanlis",
      verdictLine: "Yanlış: kütleyi (gramı) doğrudan kıyaslamak sınırlayıcıyı bulmaz.",
      rightParts: [],
      wrongParts: ["Az gram olan madde sınırlayıcı değildir."],
      conclusion: "Önce mollere çevir, sonra her maddeyi kendi katsayısına böl. Küçük oran sınırlayıcıdır.",
      wrongType: "gram_karsilastirma",
      topicLabel: "Sınırlayıcı bileşen",
    };
  }

  const arith = arithmeticIssues(student);
  if (arith.length) {
    return {
      verdict: "yanlis",
      verdictLine: `Yanlış: ${arith[0].detail}`,
      rightParts: [],
      wrongParts: arith.map((issue) => issue.detail),
      conclusion: arith[0].repair,
      wrongType: "aritmetik",
      topicLabel: "Hesap",
    };
  }

  return null;
}
