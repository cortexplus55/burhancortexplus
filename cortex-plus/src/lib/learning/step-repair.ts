/*
  Eski numara silmesinin bozduğu çözüm adımlarını okurken onarır (31 Ekim 2026).

  #455'ten önce `normalizeSteps` satır başındaki "12." kısmını adım numarası sanıp siliyordu; kayıtlı adımlar
  "000 + 38.000 = 50.000 TL." gibi kaldı. Ham model çıktısı saklanmadığı için silinen rakam veritabanında yok.
  Bu modül adımı ekrana vermeden önce:
  1. Bozukluğu tanır: adım binlik grup gibi üç haneli bir parçayla ("000", "250.000") başlar ve ya "0" ile
     başlar (gerçek sayı böyle başlamaz) ya da işlem zinciri yazıldığı hâliyle tutmaz.
  2. Kayıp baştaki sayıyı bulur: "p.000" adayları arasında işlemi tutturan tek aday ya da soru metninde,
     açıklamada, şıklarda tek geçen aday. Tek aday yoksa tahmin etmez.
  3. Onarılamayan adım varsa adımların hepsini gizler (açıklama kalır); bozuk aritmetik öğrenciye gösterilmez.
  Tüm dersler için geneldir; yalnız sayı biçimine bakar.
*/

const LEADING_GROUP = /^(\d{3}(?:\.\d{3})*)(?![\d.]|,\d)/;
const NUMBER = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;

function toValue(token: string): number {
  return Number(token.replace(/\./g, "").replace(",", "."));
}

/** "a + b − c = d TL." gibi düz işlem zinciri; tutuyor mu (true/false), hesaplanamıyorsa null. */
export function chainHolds(step: string): boolean | null {
  const parts = step.split("=").map((part) => part.trim());
  if (parts.length < 2) return null;
  const values: number[] = [];
  for (const raw of parts) {
    const part = raw.replace(/\s*[A-Za-zÇĞİÖŞÜçğıöşü%.₺$€]+\.?\s*$/u, "").trim();
    if (!part || /[A-Za-zÇĞİÖŞÜçğıöşü]/u.test(part)) return null;
    const tokens = part.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|[+\-−–×·*÷/]/g);
    if (!tokens || tokens.join("").replace(/\s/g, "") !== part.replace(/\s/g, "")) return null;
    const value = evaluateTokens(tokens);
    if (value == null) return null;
    values.push(value);
  }
  return values.every((value) => Math.abs(value - values[0]!) <= Math.max(1e-6, Math.abs(values[0]!) * 1e-9));
}

function evaluateTokens(tokens: string[]): number | null {
  const terms: number[] = [];
  const ops: string[] = [];
  let expectNumber = true;
  let pending: number | null = null;
  let pendingOp: string | null = null;
  for (const token of tokens) {
    if (expectNumber) {
      if (!/\d/.test(token)) return null;
      let value = toValue(token);
      if (pendingOp && pending != null) {
        value = pendingOp === "/" || pendingOp === "÷" ? pending / value : pending * value;
        pendingOp = null;
      }
      pending = value;
      expectNumber = false;
    } else {
      if (/[×·*÷/]/.test(token)) pendingOp = token;
      else {
        terms.push(pending!);
        ops.push(token === "+" ? "+" : "-");
        pending = null;
      }
      expectNumber = true;
    }
  }
  if (expectNumber || pending == null) return null;
  terms.push(pending);
  return terms.reduce((sum, value, index) => (index === 0 ? value : ops[index - 1] === "+" ? sum + value : sum - value), 0);
}

/** Adım eski silmeyle bozulmuş görünüyor mu? Meşru "500 + 1.000 = 1.500" gibi adımlar bozuk sayılmaz. */
export function looksStrippedStep(step: string): boolean {
  const match = LEADING_GROUP.exec(step.trim());
  if (!match) return false;
  if (match[1]!.startsWith("0")) return true;
  return chainHolds(step.trim()) === false;
}

function contextNumbers(context: string): Set<string> {
  return new Set(context.match(NUMBER) ?? []);
}

/** Bozuk adımın kayıp baştaki sayısını bulur; tek ve kesin aday yoksa null. */
export function recoverStrippedStep(step: string, context: string): string | null {
  const trimmed = step.trim();
  const group = LEADING_GROUP.exec(trimmed)?.[1];
  if (!group) return null;
  const rest = trimmed.slice(group.length);
  const known = contextNumbers(context);
  const arithmetic: string[] = [];
  const seen: string[] = [];
  for (let prefix = 1; prefix <= 999; prefix += 1) {
    const full = `${prefix}.${group}`;
    const candidate = `${full}${rest}`;
    if (chainHolds(candidate) === true) arithmetic.push(candidate);
    if (known.has(full)) seen.push(candidate);
  }
  if (arithmetic.length === 1) return arithmetic[0]!;
  const both = arithmetic.filter((candidate) => seen.includes(candidate));
  if (both.length === 1) return both[0]!;
  if (!arithmetic.length && chainHolds(trimmed) == null && seen.length === 1) return seen[0]!;
  return null;
}

/**
 * Kayıtlı adımları okurken onarır. Bozuk adım onarılamazsa adımların hiçbiri gösterilmez (undefined).
 * Bağlam: soru metni, açıklama, şıklar ve öbür adımlar.
 */
export function repairStoredSteps(steps: string[] | undefined, context: string): string[] | undefined {
  if (!steps?.length) return steps;
  const pool = `${context}\n${steps.join("\n")}`;
  const out: string[] = [];
  for (const step of steps) {
    if (!looksStrippedStep(step)) {
      out.push(step);
      continue;
    }
    const fixed = recoverStrippedStep(step, pool);
    if (!fixed) return undefined;
    out.push(fixed);
  }
  return out;
}
