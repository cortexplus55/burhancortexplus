/**
 * Basit TeX formülünün yazı tipinden bağımsız Unicode tipografisi (Faz 5 §1.1, 19 Kasım 2026).
 *
 * Ana sayfa turunun 7. adımında (Sınav sabahı kâğıdı → Formül Özeti) formül KaTeX ile çiziliyordu. KaTeX harfleri
 * kendi matematik yazı tipiyle (KaTeX_Math) basar; yazı tipi telefona inmediğinde (yavaş bağlantı, veri tasarrufu,
 * yazı tipi engeli) değişkenler görünmüyor ve ekranda `²√( ² ) = | |` gibi bozuk bir satır kalıyordu. Kâğıt satırı
 * kısa ve basit formüllerden oluşur; bu modül onları sistem yazı tipiyle okunan Unicode'a çevirir:
 *
 *   \sqrt[2n]{a^{2n}} = |a|        →  ²ⁿ√(a²ⁿ) = |a|
 *   \sqrt[2n+1]{a^{2n+1}} = a      →  ²ⁿ⁺¹√(a²ⁿ⁺¹) = a
 *
 * Desteklenmeyen bir yapı (kesir dışında çok katlı yapı, matris, bilinmeyen komut) görülürse `null` döner; çağıran
 * KaTeX'e düşer. Üst/alt simgenin Unicode karşılığı yoksa (ör. üstte `q`) parça `sup`/`sub` olarak işaretlenir ve
 * ekran onu `<sup>`/`<sub>` ile çizer: hiçbir karakter kaybolmaz.
 */

export type UnicodeMathPart = { kind: "base" | "sup" | "sub"; text: string };

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "−": "⁻", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ",
  n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};

export const SUB_SCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "−": "₋", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ",
  t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", infty: "∞", to: "→", rightarrow: "→", Rightarrow: "⇒", leftrightarrow: "↔",
  Leftrightarrow: "⇔", degree: "°", circ: "°", pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ",
  theta: "θ", lambda: "λ", mu: "μ", sigma: "σ", Sigma: "Σ", omega: "ω", Omega: "Ω", varphi: "φ", phi: "φ", rho: "ρ",
  epsilon: "ε", varepsilon: "ε", in: "∈", notin: "∉", cup: "∪", cap: "∩", subset: "⊂", emptyset: "∅",
  lvert: "|", rvert: "|", vert: "|", mid: "|", ldots: "…", dots: "…", cdots: "⋯", percent: "%",
};

/** Sıfır genişlikli ya da boşluk komutları. */
const SPACING: Record<string, string> = { ",": " ", ";": " ", ":": " ", "!": "", " ": " ", quad: " ", qquad: " " };

/** `\left` / `\right` ardından gelen ayraç olduğu gibi yazılır. */
const SIZERS = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr"]);

class Unsupported extends Error {}

type Node = UnicodeMathPart[];

/** TeX'i parçalara çevirir; desteklenmeyen yapıda `null`. */
export function texToUnicodeParts(tex: string): UnicodeMathPart[] | null {
  const source = tex.trim();
  if (!source || source.length > 160) return null;
  try {
    const parser = new Parser(source);
    const parts = parser.parseSequence(null);
    if (parser.pos < source.length) return null;
    return mergeParts(parts);
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
}

/** Bütünüyle Unicode'a çevrilebiliyorsa tek satır metin; yoksa `null`. */
export function texToUnicode(tex: string): string | null {
  const parts = texToUnicodeParts(tex);
  if (!parts) return null;
  let out = "";
  for (const part of parts) {
    if (part.kind === "base") out += part.text;
    else {
      const mapped = mapScript(part.text, part.kind === "sup" ? SUP : SUB_SCRIPTS);
      if (mapped === null) return null;
      out += mapped;
    }
  }
  return out;
}

/** Üst/alt simgenin Unicode hâli; bir karakterin karşılığı yoksa `null`. */
export function mapScript(text: string, table: Record<string, string> = SUP): string | null {
  let out = "";
  for (const char of text) {
    if (char === " ") continue;
    const mapped = table[char];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

function mergeParts(parts: Node): Node {
  const merged: Node = [];
  for (const part of parts) {
    if (!part.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}

function plain(parts: Node): string {
  return parts.map((part) => part.text).join("");
}

/** Kök ve kesir argümanı tek "atom" değilse parantez içine alınır: √x, √(a²ⁿ). */
function needsParens(parts: Node): boolean {
  const text = plain(parts);
  if (parts.length === 1 && parts[0]!.kind === "base") {
    if (/^\p{L}$/u.test(text) || /^\d+(?:[.,]\d+)?$/.test(text)) return false;
    if (/^\(.*\)$/.test(text) || /^\|.*\|$/.test(text)) return false;
  }
  return true;
}

class Parser {
  pos = 0;
  constructor(private readonly src: string) {}

  private peek(): string {
    return this.src[this.pos] ?? "";
  }

  parseSequence(until: string | null): Node {
    const out: Node = [];
    while (this.pos < this.src.length) {
      const char = this.peek();
      if (until !== null && char === until) {
        this.pos += 1;
        return out;
      }
      if (char === "}" || char === "]") {
        if (until === null) throw new Unsupported("stray_close");
        throw new Unsupported("mismatched_close");
      }
      out.push(...this.parseAtomWithScripts());
    }
    if (until !== null) throw new Unsupported("unclosed");
    return out;
  }

  private parseAtomWithScripts(): Node {
    const atom = this.parseAtom();
    const out: Node = [...atom];
    for (;;) {
      const char = this.peek();
      if (char !== "^" && char !== "_") break;
      this.pos += 1;
      const script = this.parseArgument();
      if (script.some((part) => part.kind !== "base")) throw new Unsupported("nested_script");
      out.push({ kind: char === "^" ? "sup" : "sub", text: plain(script) });
    }
    return out;
  }

  /** `{...}` grubu ya da tek atom. */
  private parseArgument(): Node {
    this.skipSpaces();
    if (this.peek() === "{") {
      this.pos += 1;
      return this.parseSequence("}");
    }
    return this.parseAtom();
  }

  private skipSpaces() {
    while (this.peek() === " ") this.pos += 1;
  }

  private parseAtom(): Node {
    const char = this.peek();
    if (!char) throw new Unsupported("eof");
    if (char === "{") {
      this.pos += 1;
      return this.parseSequence("}");
    }
    if (char === "\\") return this.parseCommand();
    if (char === "&" || char === "#" || char === "~" || char === "$") throw new Unsupported("special");
    this.pos += 1;
    if (char === "-") return [{ kind: "base", text: "−" }];
    if (char === "*") return [{ kind: "base", text: "·" }];
    if (char === "'") return [{ kind: "base", text: "′" }];
    return [{ kind: "base", text: char }];
  }

  private readName(): string {
    const start = this.pos;
    if (/[A-Za-z]/.test(this.peek())) {
      while (/[A-Za-z]/.test(this.peek())) this.pos += 1;
      return this.src.slice(start, this.pos);
    }
    this.pos += 1;
    return this.src.slice(start, this.pos);
  }

  private parseCommand(): Node {
    this.pos += 1; // "\"
    const name = this.readName();
    if (name in SPACING) return [{ kind: "base", text: SPACING[name]! }];
    if (name === "{" || name === "}" || name === "%" || name === "|") return [{ kind: "base", text: name === "|" ? "‖" : name }];
    if (SIZERS.has(name)) {
      this.skipSpaces();
      if (this.peek() === "\\") {
        const inner = this.parseCommand();
        return inner;
      }
      const delimiter = this.peek();
      if (!delimiter) throw new Unsupported("sizer_eof");
      this.pos += 1;
      return delimiter === "." ? [] : [{ kind: "base", text: delimiter }];
    }
    if (name in SYMBOLS) return [{ kind: "base", text: SYMBOLS[name]! }];
    if (name === "sqrt") {
      this.skipSpaces();
      let index: Node = [];
      if (this.peek() === "[") {
        this.pos += 1;
        index = this.parseSequence("]");
        if (index.some((part) => part.kind !== "base")) throw new Unsupported("nested_index");
      }
      const radicand = this.parseArgument();
      const body = needsParens(radicand) ? [{ kind: "base" as const, text: "(" }, ...radicand, { kind: "base" as const, text: ")" }] : radicand;
      return [...(index.length ? [{ kind: "sup" as const, text: plain(index) }] : []), { kind: "base", text: "√" }, ...body];
    }
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const top = this.parseArgument();
      const bottom = this.parseArgument();
      const wrap = (node: Node) => (needsParens(node) ? [{ kind: "base" as const, text: "(" }, ...node, { kind: "base" as const, text: ")" }] : node);
      return [...wrap(top), { kind: "base", text: "/" }, ...wrap(bottom)];
    }
    if (name === "text" || name === "mathrm" || name === "textrm" || name === "operatorname" || name === "mathit") {
      const inner = this.parseArgument();
      return inner;
    }
    if (["sin", "cos", "tan", "cot", "log", "ln", "lim", "max", "min", "exp"].includes(name)) {
      return [{ kind: "base", text: `${name} ` }];
    }
    throw new Unsupported(`command:${name}`);
  }
}
