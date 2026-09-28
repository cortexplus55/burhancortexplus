/**
 * Öğrenci yüzeyinde kod gibi değişken adlarını matematik gösterimine çevirir.
 * Üretim sonrası ve render'da ortak güvenlik ağı — konu-özel değil.
 * lesson-board ile döngüsel bağımlılık yok (LETTER_TO_SUB burada kopya).
 */

const LETTER_TO_SUB: Record<string, string> = {
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

const GREEK =
  "alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega";

/** Programlama dersi / kod bloğu: tanımlayıcılar konu; dokunma. */
export function isProgrammingContext(text: string, topicHint = ""): boolean {
  const hint = topicHint.toLocaleLowerCase("tr");
  if (/```/.test(text)) return true;
  if (/\b(function|const |let |var |class |def |import |return )\b/.test(text)) return true;
  if (/(^|\n)\s*#include\b/.test(text)) return true;
  if (/\b(kod|fonksiyon|programlama|javascript|python|java|c\+\+|yazılım|yazilim)\b/.test(hint)) {
    return true;
  }
  return false;
}

function unicodeSubWord(word: string): string | null {
  let out = "";
  for (const ch of word) {
    const lower = ch.toLocaleLowerCase("tr");
    const sub = LETTER_TO_SUB[lower];
    if (!sub || ch !== lower) return null;
    out += sub;
  }
  return out;
}

function toKatexBase(base: string): string {
  const folded = base.toLocaleLowerCase("en");
  if (new RegExp(`^(?:${GREEK})$`).test(folded)) return `\\${folded}`;
  // Yunan harfi tek başına
  if (/^[α-ωΑ-Ω]$/.test(base)) return base;
  return base;
}

function transformChunk(chunk: string): string {
  let out = chunk;
  // Çok kelimeli snake_case: açı_radyan → açı (radyan)
  out = out.replace(
    /(?<![\w./@])([\p{L}]{2,})_([\p{L}]{2,})(?![\w./@])/gu,
    (_m, left: string, right: string) => {
      if (
        /^[a-z]+$/i.test(left) &&
        /^(id|name|key|url|path|type|index|count|uuid)$/i.test(right)
      ) {
        return `${left}_${right}`;
      }
      return `${left} (${right})`;
    },
  );
  // Tek harf/Yunan + alt simge: α_r, α_d, v_son, n_toplam; a_1 → a₁
  out = out.replace(
    /(?<![\w./@])([A-Za-zα-ωΑ-Ω]{1,3})_(\d{1,3})(?![\w./@])/g,
    (_m, base: string, digits: string) => {
      const SUB: Record<string, string> = {
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
      return `${base}${[...digits].map((d) => SUB[d] ?? d).join("")}`;
    },
  );
  out = out.replace(
    /(?<![\w./@])([A-Za-zα-ωΑ-Ω]{1,3})_([A-Za-z\p{L}]{1,24})(?![\w./@])/gu,
    (_m, base: string, word: string) => {
      if (word.length === 1) {
        const uni = unicodeSubWord(word);
        if (uni) return `${base}${uni}`;
        return `$${toKatexBase(base)}_{\\text{${word}}}$`;
      }
      const uni = unicodeSubWord(word);
      if (uni) return `${base}${uni}`;
      return `$${toKatexBase(base)}_{\\text{${word}}}$`;
    },
  );
  return out;
}

/**
 * α_r → αᵣ; α_d → $\alpha_{\text{d}}$; açı_radyan → açı (radyan).
 * URL, e-posta, kod bloğu, $…$, \ce{…} korunur.
 */
export function normalizeMathIdentifiers(
  text: string,
  options: { topicHint?: string; programming?: boolean } = {},
): string {
  if (!text) return text;
  if (options.programming || isProgrammingContext(text, options.topicHint ?? "")) {
    return text;
  }

  const blockers: { start: number; end: number }[] = [];
  const add = (re: RegExp) => {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      blockers.push({ start, end: start + match[0].length });
    }
  };
  add(/```[\s\S]*?```/g);
  add(/\$\$[\s\S]+?\$\$/g);
  add(/\$[^$\n]+\$/g);
  add(/\\\([\s\S]+?\\\)/g);
  add(/\\\[[\s\S]+?\\\]/g);
  add(/\\ce\{[^{}]*\}/g);
  add(/\bhttps?:\/\/[^\s]+/g);
  add(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g);
  blockers.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const b of blockers) {
    const last = merged[merged.length - 1];
    if (last && b.start < last.end) {
      if (b.end > last.end) last.end = b.end;
      continue;
    }
    merged.push({ ...b });
  }
  let out = "";
  let cursor = 0;
  for (const b of merged) {
    if (b.start > cursor) out += transformChunk(text.slice(cursor, b.start));
    out += text.slice(b.start, b.end);
    cursor = b.end;
  }
  if (cursor < text.length) out += transformChunk(text.slice(cursor));
  return out;
}

/** Yayın/onarım için: hâlâ snake_case veya `_harf` kod kimliği var mı? */
export function mathIdentifierIssues(text: string, topicHint = ""): string[] {
  if (!text || isProgrammingContext(text, topicHint)) return [];
  const sample = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g, "")
    .replace(/\\ce\{[^{}]*\}/g, "")
    .replace(/\bhttps?:\/\/[^\s]+/g, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "");
  if (/(?<![\w./@])[\p{L}]{2,}_[\p{L}]{2,}(?![\w./@])/u.test(sample)) {
    return ["Kod gibi değişken adı var (açı_radyan); normal matematik gösterimi kullan."];
  }
  if (/(?<![\w./@])[A-Za-zα-ωΑ-Ω]{1,3}_[A-Za-z](?![A-Za-z0-9])/u.test(sample)) {
    return ["Kod gibi değişken adı var (açı_radyan); normal matematik gösterimi kullan."];
  }
  return [];
}
