/**
 * Satırdaki eşitliği olduğu gibi değerlendirir.
 *
 * Eski denetçi parantezi ve bölmeyi yarıda kesip ara değeri (mg = 490.5 N)
 * kPa sanıyordu: "95 kPa + 490.5 kPa = 144.1". O satırın tamamı
 * 95 + (50×9.81/0.010)/1000 = 144.05 ≈ 144.1 kPa idi.
 *
 * Blok, ancak ifadenin tamamı güvenle ayrışır ve sonuç yuvarlama
 * payının dışındaysa. Parça, çözülemeyen simge veya doğru zincirin
 * yanındaki ara etiket yalnızca uyarıdır.
 */

const PRESSURE_TO_PA: Record<string, number> = {
  pa: 1,
  kpa: 1_000,
  mpa: 1_000_000,
  bar: 100_000,
  atm: 101_325,
};

type Op = "+" | "-" | "*" | "/";

type Tok =
  | { t: "n"; v: number; raw: string; unit: string | null }
  | { t: "op"; v: Op }
  | { t: "lp" }
  | { t: "rp" };

type Value = { n: number; unit: string | null; confident: boolean };

function closeEnough(expected: number, claimedRaw: string, claimed: number): boolean {
  const fraction = claimedRaw.split(/[.,]/)[1];
  const decimals = fraction?.length ?? 0;
  const tolerance = decimals > 0 ? 0.5 * 10 ** -decimals : 1e-6;
  if (Math.abs(expected - claimed) <= tolerance + 1e-9) return true;
  const scale = Math.max(Math.abs(expected), 1);
  return Math.abs(expected - claimed) / scale <= 0.005;
}

function parseDecimal(raw: string): number {
  return Number(raw.replace("−", "-").replace(",", "."));
}

function unitKey(raw: string): string | null {
  const key = raw.replace(/\s+/g, "").replace(/³/g, "3").toLowerCase();
  if (PRESSURE_TO_PA[key]) return key;
  return null;
}

function readUnit(input: string, index: number): { unit: string; end: number } | null {
  const slice = input.slice(index);
  const match = /^(?:MPa|kPa|Pa|bar|atm)\b/.exec(slice);
  if (!match) return null;
  const unit = unitKey(match[0]);
  if (!unit) return null;
  return { unit, end: index + match[0].length };
}

function tokenize(input: string): { toks: Tok[]; end: number } | null {
  const toks: Tok[] = [];
  let i = 0;
  const start = input.search(/[\d(]/);
  if (start < 0) return null;
  i = start;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      toks.push({ t: "lp" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      toks.push({ t: "rp" });
      i += 1;
      continue;
    }
    const num = /^[−-]?\d+(?:[.,]\d+)?/.exec(input.slice(i));
    if (num && (i === start || !/[\d.,]/.test(input[i - 1] ?? ""))) {
      const raw = num[0];
      let end = i + raw.length;
      let unit: string | null = null;
      const spaced = readUnit(input, end + (input[end] === " " ? 1 : 0));
      const tight = readUnit(input, end);
      const found = tight && input[end] !== " " ? tight : spaced;
      if (found && (input[end] === " " || tight === found)) {
        unit = found.unit;
        end = found.end;
      }
      toks.push({ t: "n", v: parseDecimal(raw), raw, unit });
      i = end;
      continue;
    }
    const opChar = ch === "−" || ch === "–" || ch === "—" ? "-" : ch;
    const prev = toks[toks.length - 1];
    const prevValue = prev && (prev.t === "n" || prev.t === "rp");
    if ((opChar === "+" || opChar === "-") && prevValue) {
      toks.push({ t: "op", v: opChar });
      i += 1;
      continue;
    }
    if ((opChar === "*" || ch === "×" || ch === "·" || ch === "⋅" || opChar === "/" || ch === "÷") && prevValue) {
      toks.push({ t: "op", v: opChar === "/" || ch === "÷" ? "/" : "*" });
      i += 1;
      continue;
    }
    if ((ch === "x" || ch === "X") && prevValue) {
      const next = input[i + 1];
      if (next === "(" || /\d/.test(next ?? "") || next === " ") {
        toks.push({ t: "op", v: "*" });
        i += 1;
        continue;
      }
    }
    break;
  }
  if (!toks.length) return null;
  return { toks, end: i };
}

class Parser {
  private index = 0;

  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.index];
  }

  private pull(): Tok | undefined {
    const tok = this.toks[this.index];
    this.index += 1;
    return tok;
  }

  parse(): Value | null {
    const value = this.expr();
    if (!value || this.index !== this.toks.length) return null;
    return value;
  }

  private expr(): Value | null {
    let left = this.term();
    if (!left) return null;
    while (this.peek()?.t === "op" && (this.peek() as { v: Op }).v === "+" || (this.peek()?.t === "op" && (this.peek() as { v: Op }).v === "-")) {
      const op = (this.pull() as { v: Op }).v;
      const right = this.term();
      if (!right) return null;
      const combined = apply(left, right, op);
      if (!combined) return null;
      left = combined;
    }
    return left;
  }

  private term(): Value | null {
    let left = this.factor();
    if (!left) return null;
    while (this.peek()?.t === "op" && ((this.peek() as { v: Op }).v === "*" || (this.peek() as { v: Op }).v === "/")) {
      const op = (this.pull() as { v: Op }).v;
      const right = this.factor();
      if (!right) return null;
      const combined = apply(left, right, op);
      if (!combined) return null;
      left = combined;
    }
    return left;
  }

  private factor(): Value | null {
    const tok = this.peek();
    if (!tok) return null;
    if (tok.t === "n") {
      this.pull();
      return { n: tok.v, unit: tok.unit, confident: true };
    }
    if (tok.t === "lp") {
      this.pull();
      const inner = this.expr();
      if (!inner || this.peek()?.t !== "rp") return null;
      this.pull();
      return inner;
    }
    if (tok.t === "op" && tok.v === "-") {
      this.pull();
      const inner = this.factor();
      if (!inner) return null;
      return { n: -inner.n, unit: inner.unit, confident: inner.confident };
    }
    return null;
  }
}

function apply(left: Value, right: Value, op: Op): Value | null {
  if (!left.confident || !right.confident) return { n: Number.NaN, unit: null, confident: false };
  if (op === "*" || op === "/") {
    if (op === "/" && right.n === 0) return null;
    const n = op === "*" ? left.n * right.n : left.n / right.n;
    return { n, unit: null, confident: true };
  }
  if (left.unit && right.unit) {
    const leftFactor = PRESSURE_TO_PA[left.unit];
    const rightFactor = PRESSURE_TO_PA[right.unit];
    if (!leftFactor || !rightFactor) return { n: Number.NaN, unit: null, confident: false };
    const base = op === "+" ? left.n * leftFactor + right.n * rightFactor : left.n * leftFactor - right.n * rightFactor;
    return { n: base / leftFactor, unit: left.unit, confident: true };
  }
  if (left.unit || right.unit) return { n: Number.NaN, unit: null, confident: false };
  return { n: op === "+" ? left.n + right.n : left.n - right.n, unit: null, confident: true };
}

type Claim = {
  expr: string;
  claimedRaw: string;
  claimed: number;
  value: number;
  confident: boolean;
  fragment: boolean;
  operators: number;
  parens: boolean;
  hasUnit: boolean;
};

function claimAt(line: string, index: number): Claim | null {
  if (index > 0 && /[\d.,]/.test(line[index - 1] ?? "")) return null;
  const tokenized = tokenize(line.slice(index));
  if (!tokenized || tokenized.toks.length < 1) return null;
  const parsed = new Parser(tokenized.toks).parse();
  if (!parsed || !Number.isFinite(parsed.n)) return null;
  const after = line.slice(index + tokenized.end);
  const rhs = /^\s*=\s*([−-]?\d+(?:[.,]\d+)?)/.exec(after);
  if (!rhs) return null;
  const expr = line.slice(index, index + tokenized.end).trim();
  const operators = tokenized.toks.filter((tok) => tok.t === "op").length;
  const parens = tokenized.toks.some((tok) => tok.t === "lp");
  const hasUnit = tokenized.toks.some((tok) => tok.t === "n" && tok.unit);
  // Tek terim ("1 bar = 750") birim denetçisine kalır. İki terimli
  // birimsiz işlem ("2+2=5") basit aritmetikte kalır.
  if (operators < 1) return null;
  if (!parens && operators < 2 && !hasUnit) return null;
  const before = line.slice(0, index).trimEnd();
  const fragment = /[+\-−×x*/÷]$/.test(before);
  return {
    expr,
    claimedRaw: rhs[1],
    claimed: parseDecimal(rhs[1]),
    value: parsed.n,
    confident: parsed.confident && !fragment,
    fragment,
    operators,
    parens,
    hasUnit,
  };
}

function claimsInLine(line: string): Claim[] {
  const claims: Claim[] = [];
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch !== "(" && !/\d/.test(ch ?? "")) continue;
    const claim = claimAt(line, index);
    if (!claim) continue;
    claims.push(claim);
  }
  return claims;
}

export type ArithmeticVerdict = {
  block: string[];
  warn: string[];
};

function sameResult(left: Claim, right: Claim): boolean {
  return closeEnough(left.claimed, right.claimedRaw, right.claimed);
}

function lineVerdict(line: string): ArithmeticVerdict {
  const claims = claimsInLine(line);
  if (!claims.length) return { block: [], warn: [] };
  const confident = claims.filter((claim) => claim.confident && !claim.fragment);
  const ok = confident.filter((claim) => closeEnough(claim.value, claim.claimedRaw, claim.claimed));
  const wrong = confident.filter(
    (claim) => !ok.includes(claim) && !closeEnough(claim.value, claim.claimedRaw, claim.claimed),
  );
  // Aynı paragrafta sonuçla uyuşan tam ifade varsa, ara değerin
  // yanlış birimine yapışmış parçası dersi düşürmez.
  const blocking = wrong.filter((claim) => !ok.some((good) => sameResult(good, claim)));
  const suppressed = wrong.filter((claim) => ok.some((good) => sameResult(good, claim)));
  if (blocking.length) {
    return {
      block: blocking.map((claim) => `Hesap uyuşmazlığı: ${claim.expr} = ${claim.claimedRaw}`),
      warn: [],
    };
  }
  const warnClaims = ok.length ? suppressed : claims.filter((claim) => !claim.confident || claim.fragment);
  if (!ok.length && warnClaims.length) {
    return {
      block: [],
      warn: warnClaims
        .slice(0, 2)
        .map((claim) => `Hesap doğrulanamadı (uyarı): ${claim.expr} = ${claim.claimedRaw}`),
    };
  }
  if (suppressed.length) {
    return {
      block: [],
      warn: suppressed
        .slice(0, 2)
        .map((claim) => `Hesap parçası doğrulanamadı (uyarı): ${claim.expr} = ${claim.claimedRaw}`),
    };
  }
  return { block: [], warn: [] };
}

function linesOf(text: string): string[] {
  return text.split(/\n+/);
}

export function arithmeticVerdicts(text: string): ArithmeticVerdict {
  const block: string[] = [];
  const warn: string[] = [];
  for (const line of linesOf(text)) {
    const verdict = lineVerdict(line);
    block.push(...verdict.block);
    warn.push(...verdict.warn);
  }
  return { block: [...new Set(block)], warn: [...new Set(warn)] };
}

export function calculationMismatchIssues(text: string): string[] {
  return arithmeticVerdicts(text).block;
}

export function uncertainCalculationIssues(text: string): string[] {
  return arithmeticVerdicts(text).warn;
}
