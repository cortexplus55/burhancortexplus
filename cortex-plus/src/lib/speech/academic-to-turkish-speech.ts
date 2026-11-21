import { intToWords } from "@/lib/learning/speech-normalizer";

/*
  Evrensel akademik seslendirme motoru (öğretmen v3, 21 Kasım 2026, ürün sahibinin istemi). Öğretmenin yanıtı sese
  gitmeden önce bu motordan geçer: ekranda simge olarak duran her şey (kök, üs, kesir, Yunan harfi, iyon, birim, klinik
  ölçü, hukuk ve tarih kısaltması, Roma rakamı, LaTeX komutu) akıcı Türkçe okunuşa çevrilir; ses modeli simgeyi yutmaz.
  "√45 = √9 × √5" eskiden "45 9 5" diye okunuyordu.

  Yalnız SESE giden metni değiştirir; ekrandaki metin ve kayıt aynıdır. Saf: ağ, model ve veritabanı yok. Kural tek
  yerde; ders, konu ya da kişi adı yok. Belirsiz yerde dokunmaz: "2-3 gün" bir aralıktır (eksi değil), "s." yalnız bir
  sayının önünde "sayfa"dır, tek harfli bir birim yalnız bir sayının ardında birimdir.

  Sıra önemli: LaTeX önce düz simgeye iner, sonra kimya (iyon ve formül, Yunan harfinden ve genel alt/üst simgeden önce),
  birimler (sayının ardında), işlemler, kısaltmalar ve sıra sayıları.
*/

/* ------------------------------------------------------------------ sözlükler */

const GREEK: Record<string, string> = {
  α: "alfa", β: "beta", γ: "gama", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "teta", ι: "yota", κ: "kappa",
  λ: "lambda", μ: "mü", ν: "nü", ξ: "ksi", ο: "omikron", π: "pi", ρ: "ro", σ: "sigma", ς: "sigma", τ: "tov", υ: "üpsilon",
  φ: "fi", ϕ: "fi", χ: "ki", ψ: "psi", ω: "omega",
  Α: "alfa", Β: "beta", Γ: "gama", Δ: "delta", Ε: "epsilon", Θ: "teta", Λ: "lambda", Π: "pi", Σ: "sigma", Φ: "fi",
  Ψ: "psi", Ω: "omega",
};

const TEX_GREEK: Record<string, string> = {
  alpha: "alfa", beta: "beta", gamma: "gama", Gamma: "gama", delta: "delta", Delta: "delta", epsilon: "epsilon",
  varepsilon: "epsilon", zeta: "zeta", eta: "eta", theta: "teta", Theta: "teta", vartheta: "teta", kappa: "kappa",
  lambda: "lambda", Lambda: "lambda", mu: "mü", nu: "nü", xi: "ksi", pi: "pi", Pi: "pi", rho: "ro", sigma: "sigma",
  Sigma: "sigma", tau: "tov", phi: "fi", Phi: "fi", varphi: "fi", chi: "ki", psi: "psi", Psi: "psi", omega: "omega",
  Omega: "omega",
};

/** LaTeX komutları → okunuş (adı tek kelime; argüman almayanlar). */
const TEX_WORDS: Record<string, string> = {
  times: "çarpı", cdot: "çarpı", div: "bölü", pm: "artı eksi", mp: "eksi artı", neq: "eşit değildir", ne: "eşit değildir",
  leq: "küçük eşittir", le: "küçük eşittir", leqslant: "küçük eşittir", geq: "büyük eşittir", ge: "büyük eşittir",
  geqslant: "büyük eşittir", lt: "küçüktür", gt: "büyüktür", approx: "yaklaşık eşittir", simeq: "yaklaşık eşittir",
  sim: "yaklaşık", equiv: "denktir", infty: "sonsuz", int: "integral", iint: "iki katlı integral", oint: "kapalı integral",
  sum: "toplam", prod: "çarpım", partial: "kısmi türev", nabla: "nabla", lim: "limit", to: "giderken", rightarrow: "→",
  longrightarrow: "→", Rightarrow: "⇒", implies: "⇒", Leftrightarrow: "⇔", iff: "⇔", leftrightarrow: "↔",
  rightleftharpoons: "⇌", uparrow: "↑", downarrow: "↓", in: "elemanıdır", notin: "elemanı değildir", subset: "alt kümesidir",
  subseteq: "alt kümesidir", cup: "birleşim", cap: "kesişim", emptyset: "boş küme", varnothing: "boş küme",
  therefore: "o hâlde", angle: "açı", perp: "diktir", parallel: "paraleldir", degree: "derece", circ: "derece",
  sin: "sinüs", cos: "kosinüs", tan: "tanjant", cot: "kotanjant", sec: "sekant", csc: "kosekant", ln: "el en",
  log: "logaritma", exp: "e üssü", max: "maksimum", min: "minimum", ldots: "", cdots: "", dots: "", quad: "", qquad: "",
  left: "", right: "", displaystyle: "", limits: "", percent: "yüzde",
};

const ONES_ORDINAL: Record<string, string> = {
  bir: "birinci", iki: "ikinci", üç: "üçüncü", dört: "dördüncü", beş: "beşinci", altı: "altıncı", yedi: "yedinci",
  sekiz: "sekizinci", dokuz: "dokuzuncu", on: "onuncu", yirmi: "yirminci", otuz: "otuzuncu", kırk: "kırkıncı",
  elli: "ellinci", altmış: "altmışıncı", yetmiş: "yetmişinci", seksen: "sekseninci", doksan: "doksanıncı", yüz: "yüzüncü",
  bin: "bininci",
};

/** Sayının Türkçe sıra sayısı ("116" → "yüz on altıncı"). */
export function ordinalWords(n: number): string {
  const words = intToWords(n).split(" ");
  const last = words.pop() ?? "";
  return [...words, ONES_ORDINAL[last] ?? `${last}.`].join(" ");
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1) : text;
}

const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function fromSub(raw: string): string {
  return [...raw].map((ch) => String(SUB_DIGITS.indexOf(ch))).join("");
}

function fromSup(raw: string): string {
  return [...raw].map((ch) => (SUP_DIGITS.includes(ch) ? String(SUP_DIGITS.indexOf(ch)) : "")).join("");
}

function numberWords(raw: string): string {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 10000 ? intToWords(n) : raw;
}

/** Türk okullarındaki harf adları (kimyasal formülde tek harfli element). */
const LETTER_NAME: Record<string, string> = {
  A: "a", B: "be", C: "ce", D: "de", E: "e", F: "fe", G: "ge", H: "haş", I: "ı", J: "je", K: "ka", L: "le", M: "me",
  N: "ne", O: "o", P: "pe", R: "re", S: "se", T: "te", U: "u", V: "ve", Y: "ye", Z: "ze", W: "dabılyu", X: "iks", Q: "kü",
};

/** İki harfli element adları (formülde ve iyonda harf harf okunmaz). */
const ELEMENT_NAME: Record<string, string> = {
  Na: "sodyum", Cl: "klor", Ca: "kalsiyum", Mg: "magnezyum", Fe: "demir", Cu: "bakır", Zn: "çinko", Li: "lityum",
  Al: "alüminyum", Ag: "gümüş", Ba: "baryum", Br: "brom", Mn: "mangan", Co: "kobalt", Ni: "nikel", Pb: "kurşun",
  Hg: "cıva", Au: "altın", Sn: "kalay", Cr: "krom", Si: "silisyum", Se: "selenyum", He: "helyum", Ne: "neon", Ar: "argon",
};

/** Tek harfli elementlerin iyon adı (iyon bağlamında harf değil element adı söylenir). */
const ION_SINGLE: Record<string, string> = {
  H: "hidrojen", K: "potasyum", F: "flor", I: "iyot", O: "oksijen", S: "kükürt", N: "azot", P: "fosfor",
};

/** Bilinen çok atomlu iyonlar (yük işaretiyle birlikte yazılır). */
const POLY_IONS: [RegExp, string][] = [
  [/HCO₃⁻|HCO3-/g, "bikarbonat"],
  [/OH⁻/g, "hidroksit"],
  [/NH₄⁺|NH4\+/g, "amonyum"],
  [/SO₄²⁻|SO4 ?2-/g, "sülfat"],
  [/PO₄³⁻|PO4 ?3-/g, "fosfat"],
  [/NO₃⁻|NO3-/g, "nitrat"],
  [/CO₃²⁻|CO3 ?2-/g, "karbonat"],
  [/H₃O⁺|H3O\+/g, "hidronyum"],
];

/** Yaygın moleküller (formül yerine adı söylenir). */
const MOLECULES: [string, string][] = [
  ["C₆H₁₂O₆", "glikoz"],
  ["H₂SO₄", "sülfürik asit"],
  ["CaCO₃", "kalsiyum karbonat"],
  ["NaCl", "sodyum klorür"],
  ["NaOH", "sodyum hidroksit"],
  ["HCl", "hidroklorik asit"],
  ["CO₂", "karbondioksit"],
  ["CH₄", "metan"],
  ["NH₃", "amonyak"],
  ["O₃", "ozon"],
  ["O₂", "oksijen"],
  ["N₂", "azot"],
  ["H₂", "hidrojen"],
];

/** Sayının ardındaki birimler; uzun olan önce denenir. */
const UNITS: [string, string][] = [
  ["m/s²", "metre bölü saniye kare"],
  ["m/s^2", "metre bölü saniye kare"],
  ["km/sa", "kilometre bölü saat"],
  ["km/h", "kilometre bölü saat"],
  ["m/s", "metre bölü saniye"],
  ["kg/m³", "kilogram bölü metreküp"],
  ["g/cm³", "gram bölü santimetreküp"],
  ["N/m²", "newton bölü metrekare"],
  ["mg/dL", "miligram bölü desilitre"],
  ["mg/dl", "miligram bölü desilitre"],
  ["g/dL", "gram bölü desilitre"],
  ["mEq/L", "miliekivalan bölü litre"],
  ["mmol/L", "milimol bölü litre"],
  ["mL/dk", "mililitre bölü dakika"],
  ["mL/min", "mililitre bölü dakika"],
  ["mg/kg", "miligram bölü kilogram"],
  ["IU/L", "ünite bölü litre"],
  ["U/L", "ünite bölü litre"],
  ["cmH₂O", "santimetre su"],
  ["mmHg", "milimetre cıva"],
  ["kWh", "kilovatsaat"],
  ["kcal", "kilokalori"],
  ["kPa", "kilopaskal"],
  ["MPa", "megapaskal"],
  ["kHz", "kilohertz"],
  ["MHz", "megahertz"],
  ["kΩ", "kiloohm"],
  ["MΩ", "megaohm"],
  ["mol", "mol"],
  ["cal", "kalori"],
  ["Pa", "paskal"],
  ["kN", "kilonewton"],
  ["Hz", "hertz"],
  ["kW", "kilovat"],
  ["kJ", "kilojul"],
  ["mV", "milivolt"],
  ["mA", "miliamper"],
  ["μg", "mikrogram"],
  ["μm", "mikrometre"],
  ["μL", "mikrolitre"],
  ["μs", "mikrosaniye"],
  ["mg", "miligram"],
  ["kg", "kilogram"],
  ["mL", "mililitre"],
  ["ml", "mililitre"],
  ["dL", "desilitre"],
  ["cm²", "santimetrekare"],
  ["cm³", "santimetreküp"],
  ["m²", "metrekare"],
  ["m³", "metreküp"],
  ["cm", "santimetre"],
  ["mm", "milimetre"],
  ["km", "kilometre"],
  ["ms", "milisaniye"],
  ["dk", "dakika"],
  ["°C", "santigrat derece"],
  ["°F", "fahrenhayt derece"],
  ["Ω", "ohm"],
  ["W", "vat"],
  ["J", "jul"],
  ["V", "volt"],
  ["N", "newton"],
  ["K", "kelvin"],
  ["L", "litre"],
  ["g", "gram"],
  ["m", "metre"],
  ["s", "saniye"],
];

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const esc = (text: string) => text.replace(ESCAPE, "\\$&");
const UNIT_RE = new RegExp(
  `(\\d(?:[\\d.,]*\\d)?)[ \\t]*(${UNITS.map(([unit]) => esc(unit)).join("|")})(?![\\p{L}\\d²³⁺⁻₀-₉/])`,
  "gu",
);
const UNIT_SPOKEN = new Map(UNITS);

/* ------------------------------------------------------------------ LaTeX */

/** `{…}` grubunun sonunu bulur (iç içe parantezleri sayar); yoksa -1. */
function groupEnd(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** `\komut{a}{b}` gibi argümanlı komutları içten dışa çözer. */
function replaceTexCommand(text: string, name: string, args: number, render: (values: string[], option: string | null) => string): string {
  let out = text;
  for (let guard = 0; guard < 50; guard += 1) {
    const start = out.search(new RegExp(`\\\\${name}(?![a-zA-Z])`));
    if (start < 0) break;
    let cursor = start + name.length + 1;
    let option: string | null = null;
    if (out[cursor] === "[") {
      const close = out.indexOf("]", cursor);
      if (close < 0) break;
      option = out.slice(cursor + 1, close);
      cursor = close + 1;
    }
    const values: string[] = [];
    for (let arg = 0; arg < args; arg += 1) {
      while (out[cursor] === " ") cursor += 1;
      if (out[cursor] !== "{") {
        // Parantezsiz tek simge: \sqrt2, \frac12
        const single = out[cursor];
        if (!single) break;
        values.push(single);
        cursor += 1;
        continue;
      }
      const end = groupEnd(out, cursor);
      if (end < 0) break;
      values.push(out.slice(cursor + 1, end));
      cursor = end + 1;
    }
    if (values.length !== args) break;
    out = `${out.slice(0, start)} ${render(values, option)} ${out.slice(cursor)}`;
  }
  return out;
}

function rootWord(degree: string | null): string {
  const value = degree?.trim();
  if (!value || value === "2") return "kök";
  if (value === "3") return "küp kök";
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 100 ? `${ordinalWords(n)} dereceden kök` : `${value}. dereceden kök`;
}

function powerWords(raw: string): string {
  const exponent = raw.trim().replace(/^\{|\}$/g, "");
  if (exponent === "2") return " kare ";
  if (exponent === "3") return " küp ";
  if (/^\\circ$|^°$/.test(exponent)) return " derece ";
  if (/^-?\d+$/.test(exponent)) return ` üssü ${exponent.startsWith("-") ? `eksi ${numberWords(exponent.slice(1))}` : numberWords(exponent)} `;
  return ` üssü ${exponent} `;
}

function texToSpeech(text: string): string {
  let out = text
    .replace(/\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/\$\$?/g, " ")
    .replace(/\\ce\{([^}]*)\}/g, " $1 ")
    .replace(/\\%/g, "%")
    // Türkçe ondalık virgül TeX'te: 9{,}8 → 9,8.
    .replace(/\{,\}/g, ",");
  if (!/\\[a-zA-Z]|[\^_]\{?/.test(out)) return out;
  for (const name of ["frac", "dfrac", "tfrac"]) out = replaceTexCommand(out, name, 2, ([a, b]) => `${a} bölü ${b}`);
  out = replaceTexCommand(out, "sqrt", 1, ([a], option) => `${rootWord(option)} ${a}`);
  out = replaceTexCommand(out, "vec", 1, ([a]) => `vektör ${a}`);
  for (const name of ["text", "mathrm", "mathbf", "mathit", "boldsymbol", "operatorname", "overline", "underline", "hat", "bar", "mathbb", "textbf"]) {
    out = replaceTexCommand(out, name, 1, ([a]) => a);
  }
  // Kimya TeX'te: \mathrm{H_2O} → H₂O, \mathrm{Na^+} → Na⁺, Ca^{2+} → Ca²⁺ (kimya adımı okusun).
  out = out.replace(/([A-Z][a-z]?)_\{?(\d+)\}?/g, (_all, symbol: string, digits: string) => symbol + [...digits].map((d) => SUB_DIGITS[Number(d)]).join(""));
  out = out.replace(/([A-Z][a-z]?)\^\{?(\d*)([+-])\}?/g, (_all, symbol: string, digits: string, sign: string) =>
    `${symbol}${[...digits].map((d) => SUP_DIGITS[Number(d)]).join("")}${sign === "+" ? "⁺" : "⁻"}`,
  );
  // Üs ve alt simge: ^{2} → kare, _{1} → bir.
  out = out.replace(/\^\s*(\{[^{}]*\}|\\circ|-?\d+|[a-zA-Z])/g, (_all, exp: string) => powerWords(exp));
  out = out.replace(/_\s*(\{[^{}]*\}|\d+|[a-zA-Z])/g, (_all, sub: string) => {
    const value = sub.replace(/^\{|\}$/g, "");
    return ` ${/^\d+$/.test(value) ? numberWords(value) : value} `;
  });
  out = out.replace(/\\([a-zA-Z]+)/g, (_all, name: string) => {
    if (name in TEX_GREEK) return ` ${TEX_GREEK[name]} `;
    if (name in TEX_WORDS) return ` ${TEX_WORDS[name]} `;
    return ` ${name} `;
  });
  return out.replace(/\\[,;:! ]/g, " ").replace(/[{}]/g, " ");
}

/* ------------------------------------------------------------------ kimya */

function chargeWords(raw: string): string {
  const sign = raw.includes("⁺") || raw.includes("+") ? "artı" : "eksi";
  const digits = fromSup(raw).replace(/\D/g, "") || raw.replace(/\D/g, "");
  return digits && digits !== "1" ? `${numberWords(digits)} ${sign}` : sign;
}

/** Element ya da formül simgesi → okunuş: iki harfli element adı, tek harf harf adı, alt simge sayı. */
function formulaWords(formula: string): string {
  const parts: string[] = [];
  for (const match of formula.matchAll(/([A-Z][a-z]?)([₀-₉]*)/g)) {
    const symbol = match[1]!;
    parts.push(ELEMENT_NAME[symbol] ?? LETTER_NAME[symbol.charAt(0)] ?? symbol);
    if (match[2]) parts.push(numberWords(fromSub(match[2])));
  }
  return parts.join(" ");
}

function chemistryToSpeech(text: string): string {
  let out = text;
  for (const [pattern, name] of POLY_IONS) out = out.replace(pattern, ` ${name} `);
  // Önünde katsayı olabilir ("6O₂" → "6 oksijen"); ardında harf ya da alt simge gelirse daha uzun bir formüldür.
  for (const [formula, name] of MOLECULES) out = out.replace(new RegExp(`(?<![A-Za-z₀-₉])${esc(formula)}(?![A-Za-z₀-₉])`, "g"), ` ${name} `);
  // Tepkime ve toplama: iki yanında boşluk olan artı her zaman "artı" ("CO₂ + H₂O").
  out = out.replace(/\s\+\s/g, " artı ");
  out = out.replace(/(?<![A-Za-z])p(OH|H|Ka|Kb)(?![a-zA-Z])/g, (_all, rest: string) =>
    `pe ${[...rest].map((ch) => LETTER_NAME[ch.toUpperCase()] ?? ch).join(" ")}`,
  );
  // İyon: element + üst simgeli yük (Na⁺, Ca²⁺, Cl⁻, Fe³⁺).
  out = out.replace(/(?<![A-Za-z])([A-Z][a-z]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻])(?![\p{L}])/gu, (all, symbol: string, charge: string) => {
    const name = ELEMENT_NAME[symbol] ?? ION_SINGLE[symbol];
    return name ? `${name} ${chargeWords(charge)}` : all;
  });
  // Düz yazılmış yük (Na+, Ca2+, Cl-): yalnız bilinen iyonlar ve ardında boşluk ya da noktalama.
  out = out.replace(
    /(?<![A-Za-z])(Na|K|Ca|Mg|Cl|Fe|Cu|Zn|Li|Al|H)(\d?)([+-])(?=\s|[.,;:)!?]|$)/g,
    (_all, symbol: string, digits: string, sign: string) =>
      `${ELEMENT_NAME[symbol] ?? ION_SINGLE[symbol]} ${digits && digits !== "1" ? `${numberWords(digits)} ` : ""}${sign === "+" ? "artı" : "eksi"}`,
  );
  // Alt simgeli formül (H₂O, Fe₂O₃): her element ve sayısı.
  out = out.replace(/(?<![A-Za-z])((?:[A-Z][a-z]?[₀-₉]*){1,8})(?![a-z])/g, (all) => (/[₀-₉]/.test(all) ? ` ${formulaWords(all)} ` : all));
  return out;
}

/* ------------------------------------------------------------------ Yunan harfleri, üs ve alt simge */

function symbolsToSpeech(text: string): string {
  let out = text;
  // Kök: ∛x, ³√x, √x; "3√5" → "3 kök 5".
  out = out.replace(/(\d)\s?(?=[√∛∜]|[³⁴]√)/g, "$1 ");
  out = out.replace(/(?:∛|³√)\s*/g, " küp kök ").replace(/(?:∜|⁴√)\s*/g, " dördüncü dereceden kök ").replace(/√\s*/g, " kök ");
  // Mikro birimleri (birimler tablosu sayının ardındakileri zaten okudu; burada sayısız kalanlar).
  out = out.replace(/μ(?=(?:g|m|L|l|s|A|F|M|mol)(?![\p{L}]))/gu, "mikro");
  // Alt simgeli Yunan harfi: β₁ → beta bir.
  out = out.replace(/([α-ωΑ-Ω])([₀-₉]+)/g, (_all, letter: string, sub: string) => `${GREEK[letter] ?? letter} ${numberWords(fromSub(sub))}`);
  out = out.replace(/[α-ωΑ-Ωϕ]/g, (letter) => ` ${GREEK[letter] ?? letter} `);
  // Üs: x² → x kare, 10⁻³ → 10 üssü eksi üç.
  out = out.replace(/([\p{L}\d)\]])([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+)/gu, (_all, base: string, sup: string) => {
    if (sup === "ⁿ") return `${base} üssü n `;
    const negative = sup.startsWith("⁻");
    const digits = fromSup(sup);
    if (!negative && digits === "2") return `${base} kare `;
    if (!negative && digits === "3") return `${base} küp `;
    return `${base} üssü ${negative ? "eksi " : ""}${numberWords(digits)} `;
  });
  // Kalan yük işareti hücre ve antijen adındadır: CD4⁺ → CD4 pozitif, Rh⁻ → Rh negatif.
  out = out.replace(/([\p{L}\d])\s?⁺/gu, "$1 pozitif").replace(/([\p{L}\d])\s?⁻/gu, "$1 negatif");
  // Alt simge: x₁ → x bir, v₀ → v sıfır.
  out = out.replace(/([\p{L})])([₀-₉]+)/gu, (_all, base: string, sub: string) => `${base} ${numberWords(fromSub(sub))}`);
  return out;
}

/* ------------------------------------------------------------------ birimler ve işlemler */

function unitsToSpeech(text: string): string {
  return text
    .replace(UNIT_RE, (_all, value: string, unit: string) => `${value} ${UNIT_SPOKEN.get(unit) ?? unit}`)
    .replace(/(\d)\s?°(?![CF])/g, "$1 derece")
    .replace(/%\s?(\d)/g, "yüzde $1")
    .replace(/(\d(?:[\d.,]*\d)?)\s?%/g, "yüzde $1");
}

/** İşlemin terimi: sayı, tek harfli değişken, kapanan parantez ya da okunuşu bitmiş bir kelime ("kare"). */
/** Okunuşa çevrilmiş Yunan harfleri de terimdir ("ro · g" → "ro çarpı g"). */
const GREEK_WORDS = [...new Set(Object.values(GREEK))].join("|");
const OPERAND_END = String.raw`(?:\d|(?<![\p{L}])\p{L}|[)\]]|kare|küp|(?<![\p{L}])(?:${GREEK_WORDS}))`;
const OPERAND_START = String.raw`(?:\d|\p{L}(?![\p{L}])|[(\[]|kök|küp kök|(?:${GREEK_WORDS})(?![\p{L}]))`;

function operatorsToSpeech(text: string): string {
  let out = text
    .replace(/≠/g, " eşit değildir ")
    .replace(/[≤⩽]/g, " küçük eşittir ")
    .replace(/[≥⩾]/g, " büyük eşittir ")
    .replace(/[≈≅]/g, " yaklaşık eşittir ")
    .replace(/≡/g, " denktir ")
    .replace(/±/g, " artı eksi ")
    .replace(/∓/g, " eksi artı ")
    .replace(/×/g, " çarpı ")
    .replace(/÷/g, " bölü ")
    .replace(/∞/g, " sonsuz ")
    .replace(/∫/g, " integral ")
    .replace(/∑/g, " toplam ")
    .replace(/∏/g, " çarpım ")
    .replace(/∂/g, " kısmi türev ")
    .replace(/∇/g, " nabla ")
    .replace(/∈/g, " elemanıdır ")
    .replace(/∉/g, " elemanı değildir ")
    .replace(/⊆|⊂/g, " alt kümesidir ")
    .replace(/∪/g, " birleşim ")
    .replace(/∩/g, " kesişim ")
    .replace(/∅/g, " boş küme ")
    .replace(/∴/g, " o hâlde ")
    .replace(/∠/g, " açı ")
    .replace(/⊥/g, " diktir ")
    .replace(/∥/g, " paraleldir ")
    .replace(/[′']{1}(?=\s*\()/g, " türev ")
    .replace(/↑/g, " artar ")
    .replace(/↓/g, " azalır ")
    .replace(/⇌|⇄/g, " denge tepkimesi ile ")
    .replace(/⇒/g, " ise ")
    .replace(/⇔|↔/g, " ancak ve ancak ");
  // Ok: tepkime satırında "oluşturur", öbür yerde "sonucunda".
  out = out
    .split("\n")
    .map((line) => {
      if (!/→|⟶|->/.test(line)) return line;
      // Kimya adımı "+" işaretini "artı"ya çevirmiş olabilir.
      const chemical = /\+|(?<![\p{L}])artı(?![\p{L}])|tepkime|reaksiyon|oluşur|açığa çıkar/iu.test(line);
      return line.replace(/\s*(?:→|⟶|->)\s*/g, chemical ? " oluşturur " : " sonucunda ");
    })
    .join("\n");
  // Mutlak değer: |x - 3| → mutlak değer x eksi 3 (yalnız matematik içerikli kısa parçada).
  out = out.replace(/\|([^|\n]{1,40})\|/g, (all, inner: string) =>
    /[\d=+\-−]|(?<![\p{L}])\p{L}(?![\p{L}])/u.test(inner) ? ` mutlak değer ${inner} ` : all,
  );
  // Eşittir ve karşılaştırma: terimlerin arasında.
  out = out
    .replace(/\s*=\s*/g, " eşittir ")
    .replace(new RegExp(String.raw`(?<=${OPERAND_END})\s*<\s*(?=${OPERAND_START})`, "gu"), " küçüktür ")
    .replace(new RegExp(String.raw`(?<=${OPERAND_END})\s*>\s*(?=${OPERAND_START})`, "gu"), " büyüktür ");
  // Çarpma: terimler arasındaki · ⋅ ve *. İki kelimenin arasındaki orta nokta ("geçmiyor · genel bilgi") ayraçtır.
  out = out
    .replace(new RegExp(String.raw`(?<=${OPERAND_END})\s*[·⋅]\s*(?=${OPERAND_START})`, "gu"), " çarpı ")
    .replace(/\s*[·⋅]\s*/g, ", ")
    .replace(new RegExp(String.raw`(?<=${OPERAND_END})\s*\*\s*(?=${OPERAND_START})`, "gu"), " çarpı ");
  // Toplama.
  out = out.replace(new RegExp(String.raw`(?<=${OPERAND_END})\s*\+\s*(?=${OPERAND_START})`, "gu"), " artı ");
  // Gerçek eksi (U+2212) her zaman eksi; ASCII tire yalnız bir işlemin içinde (aralık "2-3 gün" değil).
  out = out.replace(/\s*−\s*/g, " eksi ");
  out = out.replace(new RegExp(String.raw`(?<=${OPERAND_END})\s+-\s+(?=${OPERAND_START})`, "gu"), " eksi ");
  out = out.replace(/(eşittir|artı|çarpı|bölü|eksi|kök|\()\s*-\s*(?=\d|\p{L})/gu, "$1 eksi ");
  out = out.replace(/(^|[\s(])-(\d)/g, "$1eksi $2");
  // Bölme: iki sayı ya da iki tek harf arasında (tarih ve "ve/veya" değil).
  out = out.replace(/(?<![\d/])(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?![\d/])/g, "$1 bölü $2");
  out = out.replace(/(?<![\p{L}/])(\p{L})\s*\/\s*(\p{L})(?![\p{L}/])/gu, "$1 bölü $2");
  return out;
}

/* ------------------------------------------------------------------ kısaltmalar ve sıra sayıları */

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanValue(raw: string): number | null {
  if (!/^(?=[IVXLCDM])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(raw)) return null;
  let total = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const value = ROMAN[raw[index]!]!;
    const next = ROMAN[raw[index + 1] ?? ""] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 ? total : null;
}

/** Kısaltma deseni: önünde harf olmayan (Türkçe harfler dahil) kelime başı. */
const abbr = (body: string, flags = "gu") => new RegExp(`(?<![\\p{L}])${body}`, flags);

function abbreviationsToSpeech(text: string): string {
  return text
    .replace(abbr(String.raw`T\.C\.(?=\s)`), "Türkiye Cumhuriyeti")
    .replace(abbr(String.raw`M\.Ö\.`), "milattan önce")
    .replace(abbr(String.raw`M\.S\.`), "milattan sonra")
    .replace(abbr(String.raw`md\.`, "giu"), "madde")
    .replace(abbr(String.raw`m\.\s?(?=\d)`), "madde ")
    .replace(abbr(String.raw`fık\.`, "giu"), "fıkra")
    .replace(/(\d+\.)\s*f\.(?=\s|$)/gu, "$1 fıkra")
    .replace(abbr(String.raw`f\.\s?(?=\d)`), "fıkra ")
    .replace(abbr(String.raw`yy\.`, "giu"), "yüzyıl")
    .replace(abbr(String.raw`vb\.`, "giu"), "ve benzeri")
    .replace(abbr(String.raw`vs\.`, "giu"), "vesaire")
    .replace(abbr(String.raw`örn\.`, "giu"), "örneğin")
    .replace(abbr(String.raw`bkz\.`, "giu"), "bakınız")
    .replace(abbr(String.raw`yak\.`, "giu"), "yaklaşık")
    .replace(abbr(String.raw`(?:s|sf)\.\s?(?=\d)`), "sayfa ")
    .replace(abbr(String.raw`No\.\s?(?=\d)`), "numara ")
    .replace(abbr(String.raw`Prof\.`), "Profesör")
    .replace(abbr(String.raw`Doç\.`), "Doçent")
    .replace(abbr(String.raw`Dr\.`), "Doktor");
}

function ordinalsToSpeech(text: string): string {
  // Roma rakamı + nokta + büyük harfli ad ya da yüzyıl/madde: "II. Mahmut" → "İkinci Mahmut".
  let out = text.replace(/(^|[\s(])([IVXLCDM]{1,7})\.\s+(?=([\p{Lu}])|yüzyıl|madde|bölüm|dönem)/gu, (all, lead: string, roman: string, upper?: string) => {
    const value = romanValue(roman);
    if (!value) return all;
    // Ad önünde (İkinci Mahmut) büyük harf; "on dokuzuncu yüzyıl" küçük.
    return `${lead}${upper ? capitalize(ordinalWords(value)) : ordinalWords(value)} `;
  });
  // Arap rakamıyla sıra sayısı: ardından küçük harfle başlayan kelime ("116. madde", "3. adımda").
  out = out.replace(/(^|[\s(])(\d{1,4})\.\s+(?=\p{Ll})/gu, (_all, lead: string, digits: string) => `${lead}${ordinalWords(Number(digits))} `);
  return out;
}

/* ------------------------------------------------------------------ giriş noktası */

/** Tablo satırlarını cümleye çevirir; ayraç satırı düşer. */
function tablesToSpeech(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line))
    .map((line) =>
      /^\s*\|.*\|\s*$/.test(line)
        ? `${line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(", ")}.`
        : line,
    )
    .join("\n");
}

/**
 * Sese gidecek metni akıcı Türkçeye çevirir. Ekranda kalan metne dokunmaz; yalnız ses modeline giden metin içindir.
 */
export function verbalizeAcademicTextForTurkishSpeech(text: string): string {
  let out = String(text ?? "").normalize("NFC");
  if (!out.trim()) return "";
  out = out.replace(/```[\s\S]*?```/g, " kod bloğu ").replace(/`([^`]*)`/g, "$1");
  // Vurgu ve kalın işaretleri okunmaz (içinde formül olsa da: "==√a·b = √a·√b==" "eşittir eşittir" olmasın).
  out = out.replace(/==/g, " ").replace(/\*\*/g, "");
  out = tablesToSpeech(out);
  out = texToSpeech(out);
  out = chemistryToSpeech(out);
  out = unitsToSpeech(out);
  out = symbolsToSpeech(out);
  out = operatorsToSpeech(out);
  out = abbreviationsToSpeech(out);
  out = ordinalsToSpeech(out);
  return out
    .replace(/\p{Extended_Pictographic}️?/gu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,;:!?)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/ *\n */g, "\n")
    .trim();
}
