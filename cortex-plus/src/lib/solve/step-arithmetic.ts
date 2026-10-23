/*
  Çözüm adımlarının aritmetiği (23 Ekim 2026). Bir adım satırı eşitlik zinciridir:
  "x = v_ort · t = 10 · 4 = 40 m", "c = √(6² + 8²) = √100 = 10 cm". Zincir "=" ile bölünür; yalnız sayı ve işlem
  içeren parçalar hesaplanır (değişken ya da kelime içeren parça atlanır, sondaki birim atılır) ve art arda gelen
  hesaplanabilir parçalar birbirine eşit olmalı. Eski `auditQuantitative` bu satırları yanlış bölüp doğru çözümleri
  "tutmuyor" sayıyordu ("√100 = 10" → "100 ve 10").

  Saf ve güvenli: `eval` yok; küçük bir özyinelemeli ayrıştırıcı (+ − × · ÷ / ^ ² ³ √ parantez, ondalık virgül, %).
*/

const UNIT_TAIL =
  /\s*(?:[a-zA-ZçğıöşüÇĞİÖŞÜµΩ°]+(?:\/[a-zA-ZçğıöşüÇĞİÖŞÜ]+)?[²³]?(?:\s*[·*/]\s*[a-zA-ZçğıöşüÇĞİÖŞÜ]+[²³]?)*)\s*$/u;
/** Sayıya bitişik tek harf birim değil değişkendir ("2x", "3a"); bitişik yazılan birimler bunlar. */
const GLUED_UNIT = /^(?:[a-zA-ZçğıöşüÇĞİÖŞÜµ]{2,}|[mgsNJWVALKΩ°])(?:\/|[²³·*\s]|$)/u;

function stripUnit(segment: string): string {
  const match = segment.match(UNIT_TAIL);
  if (!match || match.index === undefined) return segment;
  const tail = match[0];
  // "40 m", "5 m/s": boşlukla ayrılmış kuyruk birimdir. Bitişikse yalnız bilinen biçimde ("10cm", "5m/s").
  if (/^\s/.test(tail) || match.index === 0) return segment.slice(0, match.index);
  return GLUED_UNIT.test(tail) ? segment.slice(0, match.index) : segment;
}

function normalize(segment: string): string | null {
  let text = stripUnit(segment.trim()).trim();
  if (!text) return null;
  text = text
    .replace(/[·×∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/½/g, "(1/2)")
    .replace(/¼/g, "(1/4)")
    .replace(/¾/g, "(3/4)")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, "");
  // Kalan harf, değişken demektir: hesaplanmaz.
  if (/[a-zA-ZçğıöşüÇĞİÖŞÜ_]/u.test(text)) return null;
  if (!/\d/.test(text)) return null;
  return text;
}

/** Güvenli hesap; ayrıştırılamazsa null. */
export function evaluate(expression: string): number | null {
  let pos = 0;
  const src = expression.replace(/\s+/g, "");
  const peek = () => src[pos];
  const eat = (ch: string) => (src[pos] === ch ? (pos += 1, true) : false);

  function number(): number | null {
    const match = src.slice(pos).match(/^\d+(?:\.\d+)?/);
    if (!match) return null;
    pos += match[0].length;
    return Number(match[0]);
  }
  function primary(): number | null {
    if (eat("(")) {
      const value = sum();
      if (value === null || !eat(")")) return null;
      return value;
    }
    if (eat("√")) {
      const inner = peek() === "(" ? primary() : number();
      return inner === null || inner < 0 ? null : Math.sqrt(inner);
    }
    if (eat("-")) {
      const value = power();
      return value === null ? null : -value;
    }
    const value = number();
    if (value === null) return null;
    if (eat("%")) return value / 100;
    return value;
  }
  function power(): number | null {
    const base = primary();
    if (base === null) return null;
    if (eat("^")) {
      const exponent = power();
      return exponent === null ? null : base ** exponent;
    }
    return base;
  }
  function product(): number | null {
    let value = power();
    while (value !== null && (peek() === "*" || peek() === "/" || peek() === "(" || peek() === "√")) {
      const op = peek() === "*" || peek() === "/" ? src[pos++] : "*";
      const right = power();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum(): number | null {
    let value = product();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = src[pos++];
      const right = product();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  return result !== null && pos === src.length && Number.isFinite(result) ? result : null;
}

/** Göreli %0,5 tolerans: adımlarda yuvarlama olağan (4,8 / 4,80; 3,14 ile π). */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 0.005, Math.abs(b) * 0.005);
}

/** Bir satırdaki eşitlik zincirinde birbirini tutmayan ardışık hesaplanabilir parçalar. */
export function stepArithmeticIssues(line: string): string[] {
  if (/[<>≤≥≈≠]/.test(line)) return [];
  const parts = line.split(/=|⇒|→/).map((part) => part.trim()).filter(Boolean);
  const issues: string[] = [];
  let previous: { text: string; value: number } | null = null;
  for (const part of parts) {
    const normalized = normalize(part);
    const value = normalized === null ? null : evaluate(normalized);
    if (value === null) {
      previous = null;
      continue;
    }
    if (previous && !close(previous.value, value)) issues.push(`${previous.text} ≠ ${part}`);
    previous = { text: part, value };
  }
  return issues;
}
