/**
 * Akıllı hoca uyarısı (31 Ekim 2026, Paket J3 #13, ürün sahibinin kararı): öğrencinin notunda evrensel bir formül
 * açıkça yanlış yazılmışsa ("E = mc³", "F = m/a") derste sarı bir kutu söyler.
 *
 * Kaynak sayı önceliğinin (`SOURCE_NUMBER_PRIORITY`, Paket A) bilinçli ve DAR istisnası: yalnız aşağıdaki katalogdaki
 * evrensel matematik / fizik / kimya formülleri. Eşik, aralık, sınıflandırma, tıbbi değer, tarih, hukuk kuralı
 * katalogda yok ve hiçbir zaman olmayacak — onlarda not haklıdır.
 *
 * Model çağrısı yok; ölçü yalnız biçimdir. Bir eşitliğin bir tarafı katalogdaki formülün tarafıyla birebir aynı, öbür
 * tarafı aynı değişkenleri taşıyıp kabul edilen biçimlerden biri değilse ve fark küçük bir yazım farkıysa (tek
 * karakter: üs, işaret, işlem; ters kesir; bilinen klasik hata) işaretlenir. Yanlış alarm, kaçırılan uyarıdan kötüdür:
 * yarım kalmış ifade (PDF'te üs ya da payda başka satıra düşer), "yanlış / hata / değil" geçen satır, soru, şık ve
 * denklem çözümü satırı hiç işaretlenmez. Başka sol tarafla yazılmış doğru düzenleme ("a = F/m", "m = d·V") katalogda
 * olmadığından dokunulmaz.
 *
 * Uyarı ders metni değildir ("kod ders metnine hiçbir şey eklemez"): ders gövdesinin yanında `noteWarnings` olarak
 * gider, ekran ayrı bir kutu çizer; yazara yalnız "standart kuralla anlat" satırı gider.
 */

export type FormulaTypo = {
  /** Katalog kaydı ("einstein", "newton-2" …). */
  id: string;
  /** Notta geçen yazım, öğrencinin gördüğü biçimde. */
  found: string;
  /** Standart kural. */
  standard: string;
};

/** Bir derste en çok bu kadar uyarı. */
export const NOTE_WARNING_CAP = 3;

export const NOTE_WARNING_TITLE = "⚠️ Notunda Dikkat Çeken Nokta";

type CatalogEntry = {
  id: string;
  /** Birebir eşleşmesi gereken taraf. */
  anchor: "lhs" | "rhs";
  /** Bağlantı tarafının normalleştirilmiş biçimleri. */
  sides: string[];
  /** Öbür tarafın kabul edilen normalleştirilmiş biçimleri. */
  accepted: string[];
  /** Tek karakter farkından başka bilinen klasik hatalar ("(a+b)² = a² + b²"). */
  typos?: string[];
  standard: string;
};

/* ───────────── Katalog: yalnız evrensel formüller ───────────── */

const TRIG_LETTERS = ["x", "α", "θ", "β", "a", "t"];

function catalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [
    { id: "einstein", anchor: "lhs", sides: ["E"], accepted: ["m*c^2", "c^2*m"], standard: "E = mc²" },
    { id: "pisagor", anchor: "lhs", sides: ["a^2+b^2", "b^2+a^2"], accepted: ["c^2"], standard: "a² + b² = c²" },
    { id: "newton-2", anchor: "lhs", sides: ["F", "ΣF"], accepted: ["m*a", "a*m"], standard: "F = m·a" },
    {
      id: "ideal-gaz",
      anchor: "lhs",
      sides: ["P*V", "p*V", "V*P"],
      accepted: ["n*R*T", "R*n*T", "n*T*R"],
      standard: "P·V = n·R·T",
    },
    { id: "ohm", anchor: "lhs", sides: ["V"], accepted: ["I*R", "R*I"], standard: "V = I·R" },
    { id: "ohm", anchor: "lhs", sides: ["U"], accepted: ["I*R", "R*I"], standard: "U = I·R" },
    { id: "dalga", anchor: "lhs", sides: ["v"], accepted: ["λ*f", "f*λ"], standard: "v = λ·f" },
    { id: "dalga", anchor: "lhs", sides: ["c"], accepted: ["λ*f", "f*λ"], standard: "c = λ·f" },
    {
      id: "diskriminant",
      anchor: "lhs",
      sides: ["Δ"],
      accepted: ["b^2-4*a*c", "b^2-4*c*a", "-4*a*c+b^2"],
      standard: "Δ = b² − 4ac",
    },
    {
      id: "toplam-karesi",
      anchor: "lhs",
      sides: ["(a+b)^2"],
      accepted: ["a^2+2*a*b+b^2", "a^2+b^2+2*a*b", "b^2+2*a*b+a^2"],
      typos: ["a^2+b^2", "a^2+a*b+b^2"],
      standard: "(a + b)² = a² + 2ab + b²",
    },
    {
      id: "fark-karesi",
      anchor: "lhs",
      sides: ["(a-b)^2"],
      accepted: ["a^2-2*a*b+b^2", "a^2+b^2-2*a*b", "b^2-2*a*b+a^2"],
      typos: ["a^2-b^2", "a^2+b^2"],
      standard: "(a − b)² = a² − 2ab + b²",
    },
    { id: "yogunluk", anchor: "lhs", sides: ["d"], accepted: ["m/V"], typos: ["m*V", "V*m", "V/m"], standard: "d = m/V" },
    { id: "yogunluk", anchor: "lhs", sides: ["ρ"], accepted: ["m/V"], typos: ["m*V", "V*m", "V/m"], standard: "ρ = m/V" },
    ...(["Ek", "EK", "KE"] as const).map(
      (side): CatalogEntry => ({
        id: "kinetik",
        anchor: "lhs",
        sides: [side],
        accepted: ["(1/2)*m*v^2", "1/2*m*v^2", "m*v^2/2", "0.5*m*v^2"],
        standard: `${side} = ½·m·v²`,
      }),
    ),
    ...TRIG_LETTERS.map(
      (letter): CatalogEntry => ({
        id: "trig-temel",
        anchor: "rhs",
        sides: ["1"],
        accepted: [`sin^2${letter}+cos^2${letter}`, `cos^2${letter}+sin^2${letter}`],
        standard: `sin²${letter} + cos²${letter} = 1`,
      }),
    ),
  ];
  return entries;
}

const CATALOG = catalog();

/* ───────────── Normalleştirme ───────────── */

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

const LATEX_SYMBOL: Record<string, string> = {
  Delta: "Δ",
  lambda: "λ",
  rho: "ρ",
  theta: "θ",
  alpha: "α",
  beta: "β",
  Sigma: "Σ",
  pi: "π",
};

const LETTER = "A-Za-zα-ωΑ-Ω";

/** Bir eşitlik tarafını karşılaştırılabilir biçime getirir: boşluksuz, çarpma "*", üs "^n", eksi "-". */
export function normalizeMathSide(raw: string): string {
  let s = raw;
  s = s.replace(/\$|\\[()[\]]|\\left|\\right|\\[,;!]|\\ /g, " ");
  s = s.replace(/\\(?:text|mathrm|mathit)\s*\{([^{}]*)\}/g, "$1");
  for (let guard = 0; guard < 6 && /\\[dt]?frac/.test(s); guard += 1) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)").replace(/\\[dt]?frac\s*(\d)(\d)/g, "($1/$2)");
  }
  s = s.replace(/\\(?:cdot|times|ast)/g, "*");
  s = s.replace(/\\(sin|cos|tan|cot|log|ln)\b/g, "$1");
  s = s.replace(/\\([A-Za-z]+)/g, (match, name: string) => LATEX_SYMBOL[name] ?? match);
  s = s.replace(/∆/g, "Δ").replace(/[−–—‒]/g, "-").replace(/[·⋅•∙×✕]/g, "*").replace(/½/g, "(1/2)");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((char) => SUPERSCRIPT[char] ?? "").join("")}`);
  s = s.replace(/\*\*/g, "^").replace(/\^\s*\{\s*(\d+)\s*\}/g, "^$1");
  s = s.replace(/_\{([^{}]*)\}/g, "$1").replace(/_/g, "");
  // Türkçe notta nokta çarpmadır: "m.a", "P.V"; rakamlar arasındaki nokta ondalık kalır.
  s = s.replace(new RegExp(`([${LETTER})])\\s*\\.\\s*(?=[${LETTER}(])`, "g"), "$1*");
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  // Üst simgesini kaybetmiş OCR: harfe bitişik tek rakam üs ("mc2", "b2 - 4ac"). Boşlukla ayrılan ("sin 2x") üs değil.
  s = s.replace(new RegExp(`([${LETTER})])([2-4])(?![\\d.^])`, "g"), "$1^$2");
  s = s.replace(/\s+/g, "");
  for (let guard = 0; guard < 4; guard += 1) {
    const next = s.replace(new RegExp(`\\(([${LETTER}0-9.^*]+)\\)(?!\\^)`, "g"), "$1");
    if (next === s) break;
    s = next;
  }
  return s;
}

function bare(side: string): string {
  return side.replace(/\*/g, "");
}

const FUNCTION_NAME = /sin|cos|tan|cot|log|ln/g;

/** Taraftaki değişken ve işlev adları (üs ve katsayı sayılmaz). */
function atoms(side: string): Set<string> {
  const out = new Set<string>();
  const rest = side.replace(FUNCTION_NAME, (name) => {
    out.add(name);
    return " ";
  });
  for (const char of rest.match(new RegExp(`[${LETTER}]`, "gu")) ?? []) out.add(char);
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

/** Aynı uzunlukta ve yalnız bir karakteri farklı mı. */
function oneSubstitution(a: string, b: string): boolean {
  const left = [...a];
  const right = [...b];
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) diff += 1;
    if (diff > 1) return false;
  }
  return diff === 1;
}

function reversedFraction(found: string, accepted: string): boolean {
  const a = /^([^/]+)\/([^/]+)$/.exec(found);
  const b = /^([^/]+)\/([^/]+)$/.exec(accepted);
  return Boolean(a && b && a[1] === b[2] && a[2] === b[1]);
}

/** Örtük çarpmanın yerine bölme yazılmış: "nR/T" ← "nRT", "m/a" ← "ma". */
function slashForProduct(found: string, accepted: string): boolean {
  const chars = [...found];
  return chars.some((char, index) => char === "/" && [...chars.slice(0, index), ...chars.slice(index + 1)].join("") === accepted);
}

/** Öbür taraf standarttan küçük bir yazım farkıyla mı ayrılıyor. */
function isTypo(other: string, entry: CatalogEntry): boolean {
  if (!other) return false;
  const forms = entry.accepted;
  if (forms.some((form) => form === other || bare(form) === bare(other))) return false;
  if (!sameSet(atoms(other), atoms(forms[0]!))) return false;
  // Bilinen klasik hata ("(a+b)² = a² + b²") kabul edilen bir biçimin başı olsa da hatadır.
  if ((entry.typos ?? []).some((typo) => typo === other || bare(typo) === bare(other))) return true;
  // Yarım kalmış ifade: PDF'te üs ya da payda başka satıra düşer ("E = mc" + "2"). Uyarı yok.
  if (forms.some((form) => bare(form).startsWith(bare(other)))) return false;
  return forms.some(
    (form) =>
      oneSubstitution(other, form) ||
      oneSubstitution(bare(other), bare(form)) ||
      slashForProduct(bare(other), bare(form)) ||
      reversedFraction(other, form) ||
      reversedFraction(bare(other), bare(form)),
  );
}

/* ───────────── Satırdan eşitlik çıkarma ───────────── */

/** Notun kendisi yanlışı gösteriyorsa (tuzak, sık hata, "≠") ya da satır bir soru / denklem çözümüyse uyarı yok. */
const NEGATION =
  /yanlış|yanlis|hatalı|hatali|\bhata|değil|degil|≠|sanılır|sanilir|zannedil|karıştır|karistir|tuzak|yanılgı|yanilgi|sıkça|sikca|sık yapılan|yaygın|yaygin|dikkat|✗|❌|✘/i;
/** Soru ve çözülecek denklem ("… denklemini çözünüz"); "İdeal gaz denklemi PV = nRT" tanımdır, sayılmaz. */
const QUESTION =
  /\?|denklemini|denkleminin|denklemi sağlayan|çözünüz|çözün\b|çözelim|cozunuz|bulunuz|bulun\b|bulalım|hesaplayınız|hesaplayın\b|hesaplayalım|hesaplayiniz|olduğuna göre|olduguna gore|\bise\b|kaçtır|kactir|hangisi/i;
const OPTION_LINE = /^\s*(?:[A-Ea-e]|I{1,3}|IV)\s*[).]\s/;
const LIST_MARKER = /^\s*(?:\d{1,2}[).]|[-•*▪●])\s+/;
const STOPWORDS = new Set(["ve", "ya", "da", "de", "ki", "bu", "şu", "o", "ile", "mi", "mı", "ne", "en", "bir"]);

function mathWord(word: string): boolean {
  const core = word.replace(/^["'“”«»]+|["'“”«»]+$/g, "");
  if (!core) return false;
  if (STOPWORDS.has(core.toLocaleLowerCase("tr"))) return false;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(core)) return false;
  const letters = core.replace(/\\[A-Za-z]+/g, " ").replace(FUNCTION_NAME, " ");
  if (/[a-z]{3,}/.test(letters)) return false;
  return /[0-9A-Za-zα-ωΑ-Ω∆+\-−–*·×/^()²³⁴{}½=]/.test(core);
}

function trimExpression(expression: string): string {
  let out = expression.trim();
  out = out.replace(/^[+\-−–*·×/,]+/, "").replace(/[+\-−–*·×/,.]+$/, "").trim();
  const opens = (out.match(/\(/g) ?? []).length;
  const closes = (out.match(/\)/g) ?? []).length;
  if (closes > opens && out.endsWith(")")) out = out.slice(0, -1).trim();
  if (opens > closes && out.startsWith("(")) out = out.slice(1).trim();
  return out;
}

/**
 * Bir parçadaki eşitlik zincirinin ardışık tarafları ("F = m·a = 20 N" → [F, m·a], [m·a, 20 N]). Her "="in solu,
 * önündeki parçanın sondaki matematik sözcükleri; sağı, ardındaki parçanın baştaki matematik sözcükleri.
 */
function equationPairs(chunk: string): [string, string][] {
  const parts = chunk.split(/(?<![<>!=≤≥])=(?![=>])/);
  if (parts.length < 2) return [];
  const words = parts.map((part) => part.trim().split(/\s+/).filter(Boolean));
  const trailing = (list: string[]) => {
    const kept: string[] = [];
    for (let at = list.length - 1; at >= 0 && mathWord(list[at]!); at -= 1) kept.unshift(list[at]!);
    return trimExpression(kept.join(" "));
  };
  const leading = (list: string[]) => {
    const kept: string[] = [];
    for (const word of list) {
      if (!mathWord(word)) break;
      kept.push(word);
    }
    return trimExpression(kept.join(" "));
  };
  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < words.length; index += 1) {
    const left = trailing(words[index]!);
    const right = leading(words[index + 1]!);
    if (left && right) pairs.push([left, right]);
  }
  return pairs;
}

function chunksOf(line: string): string[] {
  return line
    .replace(LIST_MARKER, "")
    .replace(/\$/g, " ")
    .split(/[:;!|]|,(?=\s)|\.(?=\s|$)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes("="));
}

/** Öğrencinin gördüğü yazım: LaTeX taşıyorsa normalleştirilmiş biçimden okunur. */
function displaySide(raw: string, normalized: string): string {
  if (!raw.includes("\\")) return raw.replace(/\s+/g, " ").trim();
  return normalized
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\^4/g, "⁴")
    .replace(/\*/g, "·")
    .replace(/\+/g, " + ")
    .replace(/-/g, " − ");
}

/**
 * Notun metnindeki evrensel formül yazım hataları. Aynı hata bir kez; en çok `NOTE_WARNING_CAP`.
 * Kaynak sırası korunur.
 */
export function findFormulaTypos(text: string): FormulaTypo[] {
  if (!text || !text.includes("=")) return [];
  const lines = text.split(/\r?\n/);
  const out: FormulaTypo[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length && out.length < NOTE_WARNING_CAP; index += 1) {
    const line = lines[index]!;
    if (!line.includes("=") || OPTION_LINE.test(line) || QUESTION.test(line)) continue;
    // Satır bir işlemle bitiyorsa ifade alt satırda sürüyordur ("(a+b)² = a² + b² +" / "2ab").
    if (/[+\-−–*·×/=(]\s*$/.test(line)) continue;
    if (NEGATION.test(line) || NEGATION.test(lines[index - 1] ?? "") || NEGATION.test(lines[index + 1] ?? "")) continue;
    for (const chunk of chunksOf(line)) {
      for (const [left, right] of equationPairs(chunk)) {
        const lhs = normalizeMathSide(left);
        const rhs = normalizeMathSide(right);
        for (const entry of CATALOG) {
          const anchor = entry.anchor === "lhs" ? lhs : rhs;
          const other = entry.anchor === "lhs" ? rhs : lhs;
          if (!entry.sides.some((side) => side === anchor || bare(side) === bare(anchor))) continue;
          if (!isTypo(other, entry)) continue;
          const key = `${entry.id}|${bare(lhs)}=${bare(rhs)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: entry.id,
            found: `${displaySide(left, lhs)} = ${displaySide(right, rhs)}`,
            standard: entry.standard,
          });
          break;
        }
        if (out.length >= NOTE_WARNING_CAP) break;
      }
      if (out.length >= NOTE_WARNING_CAP) break;
    }
  }
  return out;
}

/* ───────────── Öğrenciye giden cümle ───────────── */

/** Harf adının son ünlüsü ve sessizle bitip bitmediği ("x" = iks). */
const LETTER_READING: Record<string, { vowel: string; hard: boolean }> = {
  a: { vowel: "a", hard: false },
  ı: { vowel: "ı", hard: false },
  i: { vowel: "i", hard: false },
  o: { vowel: "o", hard: false },
  ö: { vowel: "ö", hard: false },
  u: { vowel: "u", hard: false },
  ü: { vowel: "ü", hard: false },
  x: { vowel: "i", hard: true },
  q: { vowel: "ü", hard: false },
};
/** Rakamın okunuşu: 0 sıfır, 1 bir, 2 iki, 3 üç, 4 dört, 5 beş, 6 altı, 7 yedi, 8 sekiz, 9 dokuz. */
const DIGIT_READING: Record<string, { vowel: string; hard: boolean }> = {
  "0": { vowel: "ı", hard: false },
  "1": { vowel: "i", hard: false },
  "2": { vowel: "i", hard: false },
  "3": { vowel: "ü", hard: true },
  "4": { vowel: "ö", hard: true },
  "5": { vowel: "e", hard: true },
  "6": { vowel: "ı", hard: false },
  "7": { vowel: "i", hard: false },
  "8": { vowel: "i", hard: false },
  "9": { vowel: "u", hard: false },
};
/** ² kare, ³ küp, ⁴ dört; Yunan harfleri adlarıyla (lambda, delta, alfa, teta, beta, ro, pi). */
const SYMBOL_READING: Record<string, { vowel: string; hard: boolean }> = {
  "²": { vowel: "e", hard: false },
  "³": { vowel: "ü", hard: true },
  "⁴": { vowel: "ö", hard: true },
  λ: { vowel: "a", hard: false },
  Δ: { vowel: "a", hard: false },
  α: { vowel: "a", hard: false },
  θ: { vowel: "a", hard: false },
  β: { vowel: "a", hard: false },
  ρ: { vowel: "o", hard: false },
  π: { vowel: "i", hard: false },
};

function reading(char: string): { vowel: string; hard: boolean } | null {
  if (SYMBOL_READING[char]) return SYMBOL_READING[char]!;
  if (DIGIT_READING[char]) return DIGIT_READING[char]!;
  const lower = char.toLocaleLowerCase("tr");
  if (LETTER_READING[lower]) return LETTER_READING[lower]!;
  // Öbür harfler ünsüz + "e" okunur: be, ce, de, fe, ke, me, ne, re, te, ve …
  if (/^[a-zçğşA-ZÇĞŞ]$/.test(char)) return { vowel: "e", hard: false };
  return null;
}

/** "-dir" ekinin ifadenin okunuşuna uyan biçimi: «E = mc²»'dir, «F = m·a»'dır, «x³»'tür. */
export function copulaSuffix(expression: string): string {
  const chars = [...expression.trim()];
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const read = reading(chars[index]!);
    if (!read) continue;
    const harmony = /[aı]/.test(read.vowel) ? "ı" : /[ei]/.test(read.vowel) ? "i" : /[ou]/.test(read.vowel) ? "u" : "ü";
    return `${read.hard ? "t" : "d"}${harmony}r`;
  }
  return "dir";
}

/** Kutunun gövdesi (başlıktan sonrası). */
export function formulaTypoBody(typo: Pick<FormulaTypo, "found" | "standard">): string {
  return `Notunda «${typo.found}» geçiyor ancak standart kural «${typo.standard}»'${copulaSuffix(typo.standard)}, yazım hatası olabilir.`;
}

/** Öğrencinin gördüğü cümlenin tamamı. */
export function formulaTypoWarning(typo: Pick<FormulaTypo, "found" | "standard">): string {
  return `${NOTE_WARNING_TITLE}: ${formulaTypoBody(typo)}`;
}

/** Yazara giden tek satır; uyarı yoksa boş. */
export function noteWarningsPromptLine(warnings: readonly Pick<FormulaTypo, "found" | "standard">[] | undefined): string {
  if (!warnings?.length) return "";
  const list = warnings.map((warning) => `«${warning.found}» (standart: «${warning.standard}»)`).join("; ");
  return (
    `NOTTA YAZIM HATASI OLABİLİR: ${list}. Bu evrensel formülde dersi standart kuralla anlat (sayı önceliğinin tek ` +
    "istisnası; notun öbür sayı, eşik ve sınıflandırmalarına dokunma). Uyarı kutusunu sen yazma, ekranda ayrıca gösteriliyor."
  );
}

/** Kayıttan ya da ağdan gelen değeri güvenle okur; bozuk öğe atılır. */
export function readNoteWarnings(value: unknown): FormulaTypo[] {
  if (!Array.isArray(value)) return [];
  const out: FormulaTypo[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, found, standard } = item as Record<string, unknown>;
    if (typeof found !== "string" || typeof standard !== "string" || !found.trim() || !standard.trim()) continue;
    out.push({ id: typeof id === "string" ? id : "", found: found.slice(0, 120), standard: standard.slice(0, 120) });
    if (out.length >= NOTE_WARNING_CAP) break;
  }
  return out;
}
