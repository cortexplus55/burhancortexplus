/**
 * Sayısal iddia denetimi — ders, quiz ve örnek aynı kapıyı kullanır.
 *
 * Aritmetik (`2+2=4`) doğruluğu, birim çelişkisi, çözümlü örnekte
 * soyağacı (çözümdeki her sayı verilenlerde ya da önceki adımda) ve
 * hesaptan önce formül + başlangıç verisi.
 */

export type WorkedExample = {
  prompt: string;
  solution: string;
  givens?: string[];
  unknown?: string;
  steps?: string[];
  result?: string;
};

export type QuantitativeAuditInput = {
  text?: string;
  example?: WorkedExample | null;
  sections?: string[];
};

const ARITHMETIC =
  /\d+(?:[.,]\d+)?\s*[+\-−×x*÷/]\s*\d/;

const EQ =
  /(?<![\d.,\w])([−-]?\d+(?:[.,]\d+)?)\s*([+\-−×x*÷/])\s*([−-]?\d+(?:[.,]\d+)?)\s*=\s*([−-]?\d+(?:[.,]\d+)?)(?![\d,/])/gi;

/** Sayı + birim ya da iki sayının işlemi varsa konu sayısal sayılır. */
export function isQuantitativeContext(text: string): boolean {
  return (
    /\d+(?:[.,]\d+)?\s*(?:kg|mg|km|cm|mm|mol|kPa|Pa|mA|kN|sn|ohm|°C|Ω)/i.test(text) ||
    /\d+(?:[.,]\d+)?\s*(?:m\/s|A|V|W|N|J|g|m|s)\b/i.test(text) ||
    ARITHMETIC.test(text)
  );
}

/**
 * Ucuz aritmetik denetimi: "2+2=4", "3×4=12" gibi parçalar.
 *
 * Yuvarlama, yazılan basamağa göredir. Zincirin ortası tek başına denetlenmez.
 */
export function checkSimpleMathClaims(text: string): string[] {
  const issues: string[] = [];
  const eq = new RegExp(EQ.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = eq.exec(text)) !== null) {
    const before = text.slice(0, match.index).trimEnd();
    if (/[+\-−×x*÷/]$/i.test(before)) continue;

    const number = (value: string) => Number(value.replace("−", "-").replace(",", "."));
    const a = number(match[1]);
    const op = match[2];
    const b = number(match[3]);
    const claimedText = match[4];
    const claimed = number(claimedText);
    if (![a, b, claimed].every((n) => Number.isFinite(n))) continue;
    let expected: number | null = null;
    if (op === "+" || op === "-" || op === "−") expected = op === "+" ? a + b : a - b;
    else if (op === "×" || op === "x" || op === "*") expected = a * b;
    else if (op === "÷" || op === "/") expected = b === 0 ? null : a / b;
    if (expected == null) continue;

    const decimals = claimedText.split(/[.,]/)[1]?.length ?? 0;
    const tolerance = decimals > 0 ? 0.5 * 10 ** -decimals : 1e-6;
    if (Math.abs(expected - claimed) > tolerance) {
      issues.push(`Hesap uyuşmazlığı: ${a}${op}${b}≠${claimed}`);
    }
  }
  return issues;
}

function hasUnitClash(text: string): boolean {
  return (
    /\b(\d+)\s*kg\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*kg\b/i.test(text) ||
    /\b(\d+)\s*mol\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*mol\b/i.test(text)
  );
}

const SYMBOL_FAMILY: Record<string, string> = {
  n: "amount",
  I: "current",
  R: "resistance",
  F: "force",
  P: "power",
  t: "time",
};

const UNIT_FAMILY: Record<string, string> = {
  g: "mass",
  kg: "mass",
  mg: "mass",
  mol: "amount",
  mmol: "amount",
  A: "current",
  mA: "current",
  V: "voltage",
  Ω: "resistance",
  ohm: "resistance",
  N: "force",
  W: "power",
  s: "time",
  sn: "time",
  m: "length",
  cm: "length",
  km: "length",
  Pa: "pressure",
  kPa: "pressure",
};

function parseNumber(raw: string): number {
  return Number(raw.replace("−", "-").replace(",", "."));
}

function numberKey(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

function numbersIn(text: string): number[] {
  const found: number[] = [];
  const re = /(?<![\d.,])(\d+(?:[.,]\d+)?)(?!\d)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = parseNumber(match[1]);
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

function hasSymbolicFormula(text: string): boolean {
  return /[A-Za-zα-ωΑ-Ωθσμρ][^.\n]{0,48}=\s*[^.\n]{0,48}[A-Za-zα-ωΑ-Ωθσμρ]/.test(text);
}

function symbolUnitIssues(text: string): string[] {
  const issues: string[] = [];
  if (/\b([A-Za-z])\s*=\s*\d+(?:[.,]\d+)?\s+\1\b/.test(text)) {
    issues.push("Değişken kendi birimiyle tanımlanmış.");
  }
  const bindings = [
    ...text.matchAll(/\b([A-Za-z]{1,3})\s*=\s*\d+(?:[.,]\d+)?\s*([A-Za-zμΩ°/]+)/g),
  ];
  for (const binding of bindings) {
    const symbol = binding[1];
    const unit = binding[2].replace(/[.,;].*$/, "");
    const expected = SYMBOL_FAMILY[symbol];
    const actual = UNIT_FAMILY[unit];
    if (expected && actual && expected !== actual) {
      issues.push("Birim değişkenle uyuşmuyor.");
      break;
    }
  }
  const seen = new Map<string, string>();
  for (const binding of bindings) {
    const quantity = `${parseNumber(binding[0].match(/\d+(?:[.,]\d+)?/)?.[0] ?? "")}|${binding[2]}`;
    const symbol = binding[1];
    const previous = seen.get(quantity);
    if (previous && previous !== symbol) {
      issues.push("Aynı nicelik iki farklı değişkene yazılmış.");
      break;
    }
    seen.set(quantity, symbol);
  }
  return issues;
}

function lineageIssues(givenText: string, solution: string): string[] {
  const issues: string[] = [];
  const known = new Set(numbersIn(givenText).map(numberKey));
  const eq = new RegExp(EQ.source, "gi");
  let match: RegExpExecArray | null;
  let sawArithmetic = false;
  while ((match = eq.exec(solution)) !== null) {
    const before = solution.slice(0, match.index).trimEnd();
    if (/[+\-−×x*÷/]$/i.test(before)) continue;
    sawArithmetic = true;
    const consumed = [match[1], match[3]];
    for (const raw of consumed) {
      const key = numberKey(parseNumber(raw));
      if (!known.has(key)) {
        issues.push(`Çözümde verilmeyen sayı: ${raw}`);
      }
    }
    known.add(numberKey(parseNumber(match[4])));
  }
  if (sawArithmetic && !hasSymbolicFormula(`${givenText}\n${solution}`)) {
    issues.push("Hesaptan önce formül yok.");
  }

  const last = solution
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (last && !/[+\-−×x*÷/]/.test(last)) {
    const nums = numbersIn(last);
    const given = new Set(numbersIn(givenText).map(numberKey));
    if (
      nums.length === 1 &&
      given.has(numberKey(nums[0])) &&
      /^[\p{L}0-9'’\s]{1,12}=\s*\d/u.test(last)
    ) {
      issues.push("Çözüm yarım kalmış.");
    }
  }
  return issues;
}

/**
 * Bölümdeki hesap, bir değişkene yazılıyorsa formül ve önceki veriler şart.
 * "2+2=4" gibi yalın işlem burada aranmaz; o işi aritmetik denetimi görür.
 */
function orphanCalculationIssues(sections: string[]): string[] {
  const issues: string[] = [];
  let prior = "";
  for (const section of sections) {
    const eq = new RegExp(EQ.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = eq.exec(section)) !== null) {
      const before = section.slice(0, match.index);
      const labeled = /[\p{L}]{1,24}\s*=\s*$/u.test(before.trimEnd());
      if (!labeled) continue;
      const known = new Set(numbersIn(`${prior}\n${before}`).map(numberKey));
      for (const raw of [match[1], match[3]]) {
        if (!known.has(numberKey(parseNumber(raw)))) {
          issues.push(`Hesapta başlangıç verisi yok: ${raw}`);
        }
      }
      const windowText = `${prior}\n${section.slice(0, match.index + match[0].length)}`;
      if (!hasSymbolicFormula(windowText)) {
        issues.push("Hesaptan önce formül yok.");
      }
    }
    prior = `${prior}\n${section}`;
  }
  return issues;
}

export function auditQuantitative(input: QuantitativeAuditInput | string): string[] {
  const shaped: QuantitativeAuditInput = typeof input === "string" ? { text: input } : input;
  const exampleText = shaped.example
    ? [
        shaped.example.prompt,
        ...(shaped.example.givens ?? []),
        shaped.example.unknown ?? "",
        shaped.example.solution,
        ...(shaped.example.steps ?? []),
        shaped.example.result ?? "",
      ].join("\n")
    : "";
  const blob = [shaped.text ?? "", exampleText, ...(shaped.sections ?? [])]
    .filter(Boolean)
    .join("\n");
  const issues = [
    ...checkSimpleMathClaims(blob),
    ...(hasUnitClash(blob) ? ["Birim dönüşümü tutarsız."] : []),
    ...symbolUnitIssues(blob),
  ];
  if (shaped.example) {
    const given = [shaped.example.prompt, ...(shaped.example.givens ?? [])].join("\n");
    const solution = [
      shaped.example.solution,
      ...(shaped.example.steps ?? []),
      shaped.example.result ?? "",
    ].join("\n");
    issues.push(...lineageIssues(given, solution));
  }
  if (shaped.sections?.length) {
    issues.push(...orphanCalculationIssues(shaped.sections));
  }
  return [...new Set(issues)];
}
