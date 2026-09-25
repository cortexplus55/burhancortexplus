/**
 * Ekranda görünen simge ile sese giden okunuş.
 *
 * Eski okuyucu her üs karakterini ayrı çeviriyordu: 10²³ → "10 kare küp".
 * Bu hem yanlış bir sayı hem de öğrencinin ekranda gördüğü metindi.
 * Burada ekran simgeyi korur (10²³, CO₂, n = m/M); sese giden metin
 * aynı değeri taşır. "kare" ve "küp" yalnızca bir değişkenin 2 ve 3.
 * üssü için söylenir (x², x³). 10², 10²³, m/s² gibi yerler "üzeri"dir;
 * birim adları (metrekare, saniye kare) sözlükte durur.
 *
 * Doğrulama: konuşulan ifade aynı anahtarlara geri çözülür. Çözülmezse
 * üs rakamla okunur ("10 üzeri 23"); o biçim de aynı değere iner.
 */

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

const ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const SMALL: Record<string, number> = {
  sıfır: 0, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90,
};
const COUNT_WORD: Record<string, string> = {
  iki: "2", üç: "3", dört: "4", beş: "5", altı: "6", yedi: "7", sekiz: "8", dokuz: "9",
};

const ELEMENTS = [
  "He", "Li", "Be", "Ne", "Na", "Mg", "Al", "Si", "Cl", "Ar", "Ca", "Sc", "Ti", "Cr", "Mn",
  "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Ag", "Sn",
  "Sb", "Te", "Xe", "Cs", "Ba", "Pt", "Au", "Hg", "Pb", "Bi", "Rn", "Ra", "Th", "Pa", "U",
  "H", "B", "C", "N", "O", "F", "P", "S", "K", "V", "I", "W",
];
const ELEMENT_SET = new Set(ELEMENTS);
const ELEMENT_SRC = ELEMENTS.join("|");

const ORDINALS = [
  "", "birinci", "ikinci", "üçüncü", "dördüncü", "beşinci", "altıncı", "yedinci", "sekizinci", "dokuzuncu", "onuncu",
  "on birinci", "on ikinci", "on üçüncü", "on dördüncü", "on beşinci", "on altıncı", "on yedinci", "on sekizinci", "on dokuzuncu", "yirminci",
  "yirmi birinci",
];

export type QuantityKey = string;

function supOf(digits: string): string {
  return digits
    .replace(/-/g, "⁻")
    .replace(/n/g, "ⁿ")
    .replace(/x/g, "ˣ")
    .replace(/\d/g, (d) => SUP[Number(d)] ?? d);
}

function subOf(digits: string): string {
  return digits.replace(/\d/g, (d) => SUB[Number(d)] ?? d);
}

function fromSup(raw: string): string {
  return raw
    .replace(/⁻/g, "-")
    .replace(/ⁿ/g, "n")
    .replace(/ˣ/g, "x")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => String(SUP.indexOf(ch)));
}

export function intToWords(n: number): string {
  if (!Number.isInteger(n)) return String(n);
  if (n < 0) return `eksi ${intToWords(-n)}`;
  if (n < 10) return ONES[n] ?? String(n);
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return one ? `${TENS[ten]} ${ONES[one]}` : TENS[ten];
  }
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    const head = hundred === 1 ? "yüz" : `${ONES[hundred]} yüz`;
    return rest ? `${head} ${intToWords(rest)}` : head;
  }
  if (n < 10000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = thousand === 1 ? "bin" : `${ONES[thousand]} bin`;
    return rest ? `${head} ${intToWords(rest)}` : head;
  }
  return String(n);
}

export function decimalToWords(raw: string): string {
  const normalized = raw.replace(/\s/g, "").replace(".", ",");
  const [whole, frac] = normalized.split(",");
  const head = intToWords(Number(whole || "0"));
  if (!frac) return head;
  const tail = [...frac].map((digit) => ONES[Number(digit)] ?? digit).join(" ");
  return `${head} virgül ${tail}`;
}

/** Sözcük dizisinin başındaki Türkçe tam sayıyı okur. */
export function readTurkishInt(words: string[]): { value: number; count: number } | null {
  let index = 0;
  let negative = false;
  if (words[0] === "eksi") {
    negative = true;
    index = 1;
  }
  let total = 0;
  let current = 0;
  let any = false;
  const start = index;
  while (index < words.length) {
    const word = words[index];
    if (word === "bin") {
      current = current === 0 ? 1 : current;
      total += current * 1000;
      current = 0;
      any = true;
      index += 1;
      continue;
    }
    if (word === "yüz") {
      current = (current === 0 ? 1 : current) * 100;
      any = true;
      index += 1;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(SMALL, word)) {
      current += SMALL[word];
      any = true;
      index += 1;
      continue;
    }
    break;
  }
  if (!any || index === start) return null;
  const value = total + current;
  return { value: negative ? -value : value, count: index };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function recoverSmashedPowers(text: string): string {
  return text.replace(/(\d+|[A-Za-z])((?:\s+(?:kare|küp))+)/g, (_all, base: string, run: string) => {
    const parts = run.trim().split(/\s+/);
    const digits = parts.map((part) => (part === "kare" ? "2" : "3")).join("");
    return `${base}${supOf(digits)}`;
  }).replace(/(\d+)\s+((?:üssü\s+\S+\s*)+)/g, (_all, base: string, run: string) => {
    const words = [...run.matchAll(/üssü\s+(\S+)/g)].map((item) => item[1]);
    const digits = words.map((word) => {
      const parsed = readTurkishInt([word]);
      return parsed && parsed.count === 1 ? String(parsed.value) : "";
    }).join("");
    return digits ? `${base}${supOf(digits)}` : `${base} ${run}`;
  });
}

function recoverSpokenFormulas(text: string): string {
  const words = text.split(" ");
  const out: string[] = [];
  let index = 0;
  while (index < words.length) {
    const bare = words[index]?.replace(/['’.,;:!?]+$/g, "") ?? "";
    if (!ELEMENT_SET.has(bare)) {
      out.push(words[index] ?? "");
      index += 1;
      continue;
    }
    const run: string[] = [];
    let cursor = index;
    while (cursor < words.length) {
      const token = words[cursor] ?? "";
      const stem = token.replace(/['’.,;:!?]+$/g, "");
      if (ELEMENT_SET.has(stem) || COUNT_WORD[stem] || stem === "artı" || stem === "eksi" || stem === "pozitif" || stem === "negatif") {
        run.push(token);
        cursor += 1;
        continue;
      }
      break;
    }
    const stems = run.map((token) => token.replace(/['’.,;:!?]+$/g, ""));
    const hasCount = stems.some((stem) => Boolean(COUNT_WORD[stem]));
    const elementCount = stems.filter((stem) => ELEMENT_SET.has(stem)).length;
    if (!hasCount && elementCount < 2) {
      out.push(words[index] ?? "");
      index += 1;
      continue;
    }
    let formula = "";
    for (let part = 0; part < stems.length; part += 1) {
      const stem = stems[part] ?? "";
      const next = stems[part + 1];
      if (ELEMENT_SET.has(stem)) {
        formula += stem;
        continue;
      }
      const digit = COUNT_WORD[stem];
      if (!digit) continue;
      const charge = next === "artı" || next === "eksi" || next === "pozitif" || next === "negatif";
      if (charge) {
        const sign = next === "artı" || next === "pozitif" ? "⁺" : "⁻";
        formula += `${supOf(digit)}${sign}`;
        part += 1;
      } else {
        formula += subOf(digit);
      }
    }
    const tail = run[run.length - 1]?.match(/['’.,;:!?]+$/)?.[0] ?? "";
    out.push(`${formula}${tail}`);
    index = cursor;
  }
  return out.join(" ");
}

function recoverUzeri(text: string): string {
  const words = text.split(" ");
  const out: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (words[index + 1] !== "üzeri") {
      out.push(words[index] ?? "");
      continue;
    }
    const baseWord = (words[index] ?? "").replace(/[×x*]$/g, "");
    const baseNumber = /^\d+$/.test(baseWord) ? Number(baseWord) : readTurkishInt([baseWord]);
    const baseValue = typeof baseNumber === "number" ? baseNumber : baseNumber?.value;
    const baseSymbol = /^[A-Za-z]$/.test(baseWord) ? baseWord : null;
    if (baseValue == null && !baseSymbol) {
      out.push(words[index] ?? "");
      continue;
    }
    const rest = words.slice(index + 2);
    const parsed = readTurkishInt(rest);
    const symbol = rest[0] && /^[A-Za-zn]$/.test(rest[0]) ? rest[0] : null;
    if (!parsed && !symbol) {
      out.push(words[index] ?? "");
      continue;
    }
    const exp = parsed ? String(parsed.value) : symbol;
    const base = baseSymbol ?? String(baseValue);
    out.push(`${base}${supOf(exp ?? "")}`);
    index += 1 + (parsed ? parsed.count : 1);
  }
  return out.join(" ");
}

function prettyFormulaBody(body: string): string | null {
  if (!body) return null;
  let pretty = "";
  let cursor = 0;
  const re = new RegExp(`^(${ELEMENT_SRC})(\\d*)`);
  while (cursor < body.length) {
    const match = body.slice(cursor).match(re);
    if (!match) return null;
    pretty += `${match[1]}${match[2] ? subOf(match[2]) : ""}`;
    cursor += match[0].length;
  }
  return pretty || null;
}

/**
 * SO42- hem "SO₄ ve yük 2-" hem "SO ve yük 42-" diye okunabilir.
 * Alt indis hâlâ rakam bırakıyorsa yük tek hanedir (SO₄²⁻).
 * Bırakmıyorsa yük, sondaki hanedir (Fe³⁺). Fe3+ bu yüzden F³²⁺ olmaz.
 */
function prettifyFormulaToken(token: string): string | null {
  let body = token;
  let sign = "";
  if (body.endsWith("+") || body.endsWith("-")) {
    sign = body.endsWith("+") ? "⁺" : "⁻";
    body = body.slice(0, -1);
  }
  if (!sign) return /\d/.test(body) ? prettyFormulaBody(body) : null;
  const trailing = body.match(/^(.*?)(\d+)$/);
  if (!trailing) {
    const bare = prettyFormulaBody(body);
    return bare ? `${bare}${sign}` : null;
  }
  const prefix = trailing[1] ?? "";
  const digits = trailing[2] ?? "";
  const prettyPrefix = prettyFormulaBody(prefix);
  if (!prettyPrefix) return null;
  const elementCount = [...prefix.matchAll(new RegExp(ELEMENT_SRC, "g"))].length;
  // Tek element: rakam yüktür (Fe3+ → Fe³⁺, O2- → O²⁻).
  if (elementCount <= 1) return `${prettyPrefix}${supOf(digits)}${sign}`;
  // Birden çok element ve iki hane: son hane yük, öncekiler alt indis (SO42- → SO₄²⁻).
  if (digits.length >= 2) {
    const withSub = prettyFormulaBody(`${prefix}${digits.slice(0, -1)}`);
    if (withSub) return `${withSub}${supOf(digits.slice(-1))}${sign}`;
  }
  // NH4+ gibi: rakam alt indis, yük işareti yalın.
  const subscripted = prettyFormulaBody(body);
  return subscripted ? `${subscripted}${sign}` : `${prettyPrefix}${supOf(digits)}${sign}`;
}

function prettifyAscii(text: string): string {
  let next = text.replace(/(\d)\.(\d)/g, "$1,$2");
  next = next.replace(
    /(\d+(?:,\d+)?)\s*[×x·*]\s*10\s*(?:\^|e)\s*\{?\s*([+-]?\d+)\s*\}?/gi,
    (_all, mantissa: string, exp: string) => `${mantissa.replace(".", ",")} × 10${supOf(exp)}`,
  );
  next = next.replace(/10\s*\^\s*\{?\s*([+-]?\d+)\s*\}?/g, (_all, exp: string) => `10${supOf(exp)}`);
  next = next.replace(/([A-Za-z])\s*\^\s*\{?\s*([+-]?\d+|[A-Za-zn])\s*\}?/g, (_all, base: string, exp: string) => `${base}${supOf(exp)}`);
  next = next.replace(/√\s*([A-Za-z0-9]+)/g, "√$1");
  next = next.replace(/(?<![A-Za-z])([A-Z][A-Za-z0-9]*[+\-]?)/g, (token) => prettifyFormulaToken(token) ?? token);
  return next;
}

/** Öğrencinin göreceği simge. Konuşma diline çevirmez. */
export function toDisplay(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return collapse(prettifyAscii(recoverUzeri(recoverSpokenFormulas(recoverSmashedPowers(clean)))));
}

type Token = { start: number; end: number; spoken: string; key: string };

function pushToken(tokens: Token[], start: number, end: number, spoken: string, key: string) {
  if (tokens.some((item) => start < item.end && end > item.start)) return;
  tokens.push({ start, end, spoken, key });
}

function collectTokens(display: string, digits: boolean): Token[] {
  const tokens: Token[] = [];
  const say = (n: number) => (digits ? String(Math.abs(n)) : intToWords(n));
  const saySigned = (n: number) => (n < 0 ? `eksi ${say(-n)}` : say(n));
  const sayDecimal = (raw: string) => (digits ? raw.replace(".", ",") : decimalToWords(raw));

  const law = /Madde\s+(\d+)\s*\/\s*(\d+)\s*[-–]\s*([a-zçğıöşü])/gi;
  for (const match of display.matchAll(law)) {
    const article = Number(match[1]);
    const clause = Number(match[2]);
    const letter = match[3];
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `madde ${say(article)}, fıkra ${say(clause)}, bent ${letter}`,
      `law:${article}/${clause}-${letter}`,
    );
  }

  const sci = /(\d+(?:,\d+)?)\s*[×x·*]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g;
  for (const match of display.matchAll(sci)) {
    const mantissa = match[1].replace(",", ".");
    const exp = fromSup(match[2]);
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `${sayDecimal(mantissa)} çarpı on üzeri ${saySigned(Number(exp))}`,
      `sci:${mantissa}e${exp}`,
    );
  }

  const units: { re: RegExp; spoken: string; key: string }[] = [
    { re: /kJ\s*\/\s*mol/gi, spoken: "kilojul bölü mol", key: "unit:kJ/mol" },
    { re: /g\s*\/\s*mol/gi, spoken: "gram bölü mol", key: "unit:g/mol" },
    { re: /kg\s*\/\s*mol/gi, spoken: "kilogram bölü mol", key: "unit:kg/mol" },
    { re: /m\s*\/\s*s(?:²|\^2|2)/gi, spoken: "metre bölü saniye kare", key: "unit:m/s^2" },
    { re: /m\s*\/\s*s\b/gi, spoken: "metre bölü saniye", key: "unit:m/s" },
    { re: /(?<![A-Za-z])m²/g, spoken: "metrekare", key: "unit:m^2" },
    { re: /(?<![A-Za-z])m³/g, spoken: "metreküp", key: "unit:m^3" },
    { re: /°\s*C|℃/g, spoken: "santigrat derece", key: "unit:C" },
  ];
  for (const unit of units) {
    for (const match of display.matchAll(unit.re)) {
      pushToken(tokens, match.index ?? 0, (match.index ?? 0) + match[0].length, unit.spoken, unit.key);
    }
  }

  const formulaRe = new RegExp(`(?<![A-Za-z])((?:(?:${ELEMENT_SRC})[₀₁₂₃₄₅₆₇₈₉]*)+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻])?(?![A-Za-z₀-₉])`, "g");
  for (const match of display.matchAll(formulaRe)) {
    const body = match[1];
    const charge = match[2] ?? "";
    if (!/[₀₁₂₃₄₅₆₇₈₉⁺⁻]/.test(`${body}${charge}`)) continue;
    const spokenParts: string[] = [];
    const plain: string[] = [];
    const elementRe = new RegExp(`(${ELEMENT_SRC})([₀₁₂₃₄₅₆₇₈₉]*)`, "g");
    for (const part of body.matchAll(elementRe)) {
      spokenParts.push(part[1]);
      plain.push(part[1]);
      const digitsRaw = fromSup(part[2].replace(/[₀-₉]/g, (ch) => String(SUB.indexOf(ch))));
      if (digitsRaw && digitsRaw !== "1") {
        const word = digits ? digitsRaw : intToWords(Number(digitsRaw));
        spokenParts.push(word);
        plain.push(digitsRaw);
      }
    }
    if (charge) {
      const sign = charge.includes("⁺") ? "+" : "-";
      const mag = fromSup(charge.replace(/[⁺⁻]/g, ""));
      const magWord = mag ? (digits ? mag : intToWords(Number(mag))) : "";
      spokenParts.push(`${magWord ? `${magWord} ` : ""}${sign === "+" ? "artı" : "eksi"}`.trim());
      plain.push(`${mag}${sign}`);
    }
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      spokenParts.join(" "),
      `formula:${plain.join("")}`,
    );
  }

  const percent = /%\s*(\d+(?:,\d+)?)|(\d+(?:,\d+)?)\s*%/g;
  for (const match of display.matchAll(percent)) {
    const raw = (match[1] || match[2] || "").replace(",", ".");
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `yüzde ${raw.includes(".") ? sayDecimal(raw) : say(Number(raw))}`,
      `pct:${raw}`,
    );
  }

  const root = /√\s*([A-Za-z]|\d+(?:,\d+)?)/g;
  for (const match of display.matchAll(root)) {
    const inner = match[1];
    const spoken = /^\d/.test(inner)
      ? `karekök ${inner.includes(",") || inner.includes(".") ? sayDecimal(inner.replace(",", ".")) : say(Number(inner))}`
      : `karekök ${inner}`;
    pushToken(tokens, match.index ?? 0, (match.index ?? 0) + match[0].length, spoken, `sqrt:${inner.replace(",", ".")}`);
  }

  const roman = /\b([IVXLCDM]{1,7})\.\s*(yüzyıl|yy\b|Dünya)/g;
  for (const match of display.matchAll(roman)) {
    const value = romanToInt(match[1]);
    if (!value || value > 21) continue;
    const ordinal = ORDINALS[value];
    if (!ordinal) continue;
    const label = match[2] === "Dünya" ? "Dünya" : "yüzyıl";
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `${ordinal} ${label}`,
      `roman:${value}`,
    );
  }

  const year = /\b(1\d{3}|20\d{2})\b(?=\s*(?:yılında|yılı|yıl|'te|'ta|'de|'da))/g;
  for (const match of display.matchAll(year)) {
    const value = Number(match[1]);
    pushToken(tokens, match.index ?? 0, (match.index ?? 0) + match[1].length, say(value), `year:${value}`);
  }

  const range = /\b(\d{1,4})\s*[-–]\s*(\d{1,4})\b/g;
  for (const match of display.matchAll(range)) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (right <= left) continue;
    const around = display.slice(Math.max(0, (match.index ?? 0) - 12), (match.index ?? 0) + match[0].length + 8);
    if (/madde|fıkra|=/i.test(around)) continue;
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `${say(left)} ile ${say(right)} arası`,
      `range:${left}-${right}`,
    );
  }

  const power = /([A-Za-z]|\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁻ˣ]+)/g;
  for (const match of display.matchAll(power)) {
    const baseRaw = match[1];
    const expRaw = fromSup(match[2]);
    const variable = /^[A-Za-z]$/.test(baseRaw);
    let spoken: string;
    if (variable && expRaw === "2") spoken = `${baseRaw} kare`;
    else if (variable && expRaw === "3") spoken = `${baseRaw} küp`;
    else if (expRaw === "n") spoken = `${/^\d+$/.test(baseRaw) ? say(Number(baseRaw)) : baseRaw} üzeri n`;
    else if (/^-?\d+$/.test(expRaw)) {
      const baseSpoken = /^\d+$/.test(baseRaw) ? say(Number(baseRaw)) : baseRaw;
      spoken = `${baseSpoken} üzeri ${saySigned(Number(expRaw))}`;
    } else spoken = `${baseRaw} üzeri ${expRaw}`;
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      spoken,
      `pow:${baseRaw}^${expRaw}`,
    );
  }

  const frac = /(?<![A-Za-z0-9])(\d+)\s*\/\s*(\d+)(?![A-Za-z0-9])/g;
  for (const match of display.matchAll(frac)) {
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `${say(Number(match[1]))} bölü ${say(Number(match[2]))}`,
      `frac:${match[1]}/${match[2]}`,
    );
  }

  const letterFrac = /(?<![A-Za-z])([A-Za-z])\s*\/\s*([A-Za-z])(?![A-Za-z])/g;
  for (const match of display.matchAll(letterFrac)) {
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      `${match[1]} bölü ${match[2]}`,
      `frac:${match[1]}/${match[2]}`,
    );
  }

  const decimal = /(?<!\d)(\d+,\d+)(?!\d)/g;
  for (const match of display.matchAll(decimal)) {
    pushToken(
      tokens,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length,
      sayDecimal(match[1].replace(",", ".")),
      `dec:${match[1].replace(",", ".")}`,
    );
  }

  const arrow = /⇌|↔|→|->|=>/g;
  for (const match of display.matchAll(arrow)) {
    const spoken = match[0] === "⇌" || match[0] === "↔" ? "denge oku" : "ok";
    pushToken(tokens, match.index ?? 0, (match.index ?? 0) + match[0].length, spoken, `arrow:${spoken === "denge oku" ? "eq" : "to"}`);
  }

  const equals = /(?<=\s|^)=(?=\s|$)/g;
  for (const match of display.matchAll(equals)) {
    pushToken(tokens, match.index ?? 0, (match.index ?? 0) + 1, "eşittir", "op:=");
  }

  const times = /[×·]/g;
  for (const match of display.matchAll(times)) {
    pushToken(tokens, match.index ?? 0, (match.index ?? 0) + match[0].length, "çarpı", "op:*");
  }

  return tokens.sort((a, b) => a.start - b.start);
}

function romanToInt(raw: string): number | null {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const current = map[raw[index] ?? ""];
    const next = map[raw[index + 1] ?? ""] ?? 0;
    if (!current) return null;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

function renderSpoken(display: string, digits: boolean): string {
  const tokens = collectTokens(display, digits);
  if (!tokens.length) return display;
  let cursor = 0;
  let out = "";
  for (const token of tokens) {
    if (token.start < cursor) continue;
    out += display.slice(cursor, token.start);
    out += ` ${token.spoken} `;
    cursor = token.end;
  }
  out += display.slice(cursor);
  return collapse(out);
}

const VALUE_PREFIX = /^(?:sci|pow|formula|unit|pct|sqrt|frac|range|year|roman|law|dec|arrow):/;

export function quantityKeys(display: string, digits = false): QuantityKey[] {
  return collectTokens(display, digits).map((token) => token.key).filter((key) => VALUE_PREFIX.test(key));
}

function readDecimalWords(words: string[]): { value: string; count: number } | null {
  const head = readTurkishInt(words);
  if (!head) return null;
  if (words[head.count] !== "virgül") return { value: String(head.value), count: head.count };
  const digits: string[] = [];
  let index = head.count + 1;
  while (index < words.length && Object.prototype.hasOwnProperty.call(SMALL, words[index] ?? "") && (SMALL[words[index] ?? ""] ?? 99) < 10) {
    digits.push(String(SMALL[words[index] ?? ""]));
    index += 1;
  }
  if (!digits.length) return { value: String(head.value), count: head.count };
  return { value: `${head.value}.${digits.join("")}`, count: index };
}

/** Konuşulan metindeki değerleri, ekrandaki anahtarlarla aynı biçime çözer. */
function stripWord(word: string): string {
  return word.replace(/^[.,;:]+|[.,;:]+$/g, "");
}

export function keysFromSpoken(spoken: string): QuantityKey[] {
  const keys: QuantityKey[] = [];
  const words = spoken.split(" ").map(stripWord).filter(Boolean);
  const seen = new Set<string>();
  const add = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  if (/kilojul bölü mol/.test(spoken)) add("unit:kJ/mol");
  if (/gram bölü mol/.test(spoken)) add("unit:g/mol");
  if (/kilogram bölü mol/.test(spoken)) add("unit:kg/mol");
  if (/metre bölü saniye kare/.test(spoken)) add("unit:m/s^2");
  else if (/metre bölü saniye/.test(spoken)) add("unit:m/s");
  if (/metreküp/.test(spoken)) add("unit:m^3");
  else if (/metrekare/.test(spoken)) add("unit:m^2");
  if (/santigrat derece/.test(spoken)) add("unit:C");
  if (/\bdenge oku\b/.test(spoken)) add("arrow:eq");
  if (/\bok\b/.test(spoken)) add("arrow:to");

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === "karekök") {
      const inner = words[index + 1];
      if (inner && /^[A-Za-z]$/.test(inner)) add(`sqrt:${inner}`);
      else {
        const parsed = readDecimalWords(words.slice(index + 1));
        if (parsed) add(`sqrt:${parsed.value}`);
        else if (inner && /^\d+$/.test(inner)) add(`sqrt:${inner}`);
      }
    }
    if (words[index] === "yüzde") {
      const parsed = readDecimalWords(words.slice(index + 1));
      if (parsed) add(`pct:${parsed.value}`);
      else if (words[index + 1] && /^\d+(?:,\d+)?$/.test(words[index + 1])) add(`pct:${words[index + 1].replace(",", ".")}`);
    }
    if (words[index] === "madde" && words.includes("fıkra") && words.includes("bent")) {
      const article = readTurkishInt(words.slice(index + 1));
      const fıkraAt = words.indexOf("fıkra", index);
      const bentAt = words.indexOf("bent", index);
      const clause = fıkraAt >= 0 ? readTurkishInt(words.slice(fıkraAt + 1)) : null;
      const letter = words[bentAt + 1]?.replace(/[.,]/g, "");
      if (article && clause && letter) add(`law:${article.value}/${clause.value}-${letter}`);
    }
    const baseLetter = words[index];
    if (baseLetter && /^[A-Za-z]$/.test(baseLetter) && words[index + 1] === "kare") add(`pow:${baseLetter}^2`);
    if (baseLetter && /^[A-Za-z]$/.test(baseLetter) && words[index + 1] === "küp") add(`pow:${baseLetter}^3`);
    if (words[index + 1] === "üzeri") {
      const baseWord = words[index] ?? "";
      const baseNum = /^\d+$/.test(baseWord) ? { value: Number(baseWord), count: 1 } : readTurkishInt([baseWord]);
      const base = /^[A-Za-z]$/.test(baseWord) ? baseWord : baseNum ? String(baseNum.value) : null;
      const expWords = words.slice(index + 2);
      const expNum = readTurkishInt(expWords);
      const expSymbol = expWords[0] && /^[A-Za-zn]$/.test(expWords[0]) ? expWords[0] : null;
      const expDigits = expWords[0] && /^-?\d+$/.test(expWords[0]) ? expWords[0] : null;
      const exp = expNum ? String(expNum.value) : expDigits ?? expSymbol;
      if (base && exp) {
        const sciBefore = words[index - 1] === "çarpı";
        if (sciBefore && (base === "10" || baseWord === "on")) {
          const mantissa = readDecimalWords(words.slice(0, index - 1).slice(-6));
          const fromEnd = readDecimalWordsBack(words.slice(0, index - 1));
          if (fromEnd) add(`sci:${fromEnd}e${exp}`);
          else if (mantissa) add(`sci:${mantissa.value}e${exp}`);
        } else add(`pow:${base}^${exp}`);
      }
    }
    if (words[index + 1] === "ile" && words[index + 3] === "arası") {
      const left = readTurkishInt(words.slice(index, index + 1)) ?? ( /^\d+$/.test(words[index] ?? "") ? { value: Number(words[index]), count: 1 } : null);
      const rightWord = words[index + 2] ?? "";
      const right = readTurkishInt([rightWord]) ?? (/^\d+$/.test(rightWord) ? { value: Number(rightWord), count: 1 } : null);
      if (left && right) add(`range:${left.value}-${right.value}`);
    }
    if (words[index + 1] === "bölü") {
      const left = words[index];
      const right = words[index + 2];
      if (left && right && /^[A-Za-z]$/.test(left) && /^[A-Za-z]$/.test(right)) add(`frac:${left}/${right}`);
      const leftNum = left ? readTurkishInt([left]) : null;
      const rightNum = right ? readTurkishInt([right]) : null;
      if (leftNum && rightNum) add(`frac:${leftNum.value}/${rightNum.value}`);
    }
  }

  for (let index = 0; index < words.length; index += 1) {
    if (words[index] !== "ile") continue;
    const right = readTurkishInt(words.slice(index + 1));
    if (!right || words[index + 1 + right.count] !== "arası") continue;
    for (let size = Math.min(6, index); size >= 1; size -= 1) {
      const slice = words.slice(index - size, index);
      const left = readTurkishInt(slice);
      if (left && left.count === slice.length) {
        add(`range:${left.value}-${right.value}`);
        break;
      }
    }
  }
  for (let index = 0; index < words.length; index += 1) {
    if (words[index] !== "bölü") continue;
    const right = readTurkishInt(words.slice(index + 1));
    if (!right) continue;
    for (let size = 1; size <= 4 && size <= index; size += 1) {
      const slice = words.slice(index - size, index);
      const left = readTurkishInt(slice);
      if (left && left.count === slice.length) {
        add(`frac:${left.value}/${right.value}`);
        break;
      }
    }
  }
  for (let index = 0; index < words.length; index += 1) {
    if (/^\d{3,4}$/.test(words[index] ?? "") && /^yıl/.test(words[index + 1] ?? "")) {
      add(`year:${words[index]}`);
      continue;
    }
    const parsed = readTurkishInt(words.slice(index));
    if (!parsed) continue;
    const next = words[index + parsed.count] ?? "";
    if (/^yıl/.test(next) && parsed.value >= 1000 && parsed.value <= 2099) add(`year:${parsed.value}`);
  }
  const ordinalClaimed = new Array<boolean>(words.length).fill(false);
  for (let ordinal = ORDINALS.length - 1; ordinal >= 1; ordinal -= 1) {
    const parts = ORDINALS[ordinal]?.split(" ") ?? [];
    if (!parts.length) continue;
    for (let index = 0; index + parts.length < words.length; index += 1) {
      if (ordinalClaimed.slice(index, index + parts.length).some(Boolean)) continue;
      if (words.slice(index, index + parts.length).join(" ") !== ORDINALS[ordinal]) continue;
      const label = words[index + parts.length];
      if (label !== "yüzyıl" && label !== "Dünya") continue;
      add(`roman:${ordinal}`);
      for (let mark = index; mark < index + parts.length; mark += 1) ordinalClaimed[mark] = true;
    }
  }
  for (let index = 0; index < words.length; index += 1) {
    const parsed = readDecimalWords(words.slice(index));
    if (!parsed || !words.slice(index, index + parsed.count).includes("virgül")) continue;
    if ((words[index + parsed.count] ?? "") === "çarpı") continue;
    add(`dec:${parsed.value}`);
  }

  const formulaKeys = formulaKeysFromSpoken(spoken);
  for (const key of formulaKeys) add(key);
  return keys;
}

function readDecimalWordsBack(words: string[]): string | null {
  for (let size = Math.min(6, words.length); size >= 1; size -= 1) {
    const slice = words.slice(words.length - size);
    const parsed = readDecimalWords(slice);
    if (parsed && parsed.count === slice.length) return parsed.value;
  }
  return null;
}

function formulaKeysFromSpoken(spoken: string): string[] {
  const words = spoken.split(" ");
  const keys: string[] = [];
  let index = 0;
  while (index < words.length) {
    const stem = (words[index] ?? "").replace(/[.,;:]/g, "");
    if (!ELEMENT_SET.has(stem)) {
      index += 1;
      continue;
    }
    let cursor = index;
    const stems: string[] = [];
    while (cursor < words.length) {
      const part = (words[cursor] ?? "").replace(/[.,;:]/g, "");
      if (ELEMENT_SET.has(part) || COUNT_WORD[part] || part === "artı" || part === "eksi") {
        stems.push(part);
        cursor += 1;
        continue;
      }
      break;
    }
    if (!stems.some((part) => COUNT_WORD[part] || part === "artı" || part === "eksi")) {
      index += 1;
      continue;
    }
    let plain = "";
    for (let part = 0; part < stems.length; part += 1) {
      const token = stems[part] ?? "";
      if (ELEMENT_SET.has(token)) {
        plain += token;
        continue;
      }
      const digit = COUNT_WORD[token];
      if (!digit) continue;
      const next = stems[part + 1];
      if (next === "artı" || next === "eksi") {
        plain += `${digit}${next === "artı" ? "+" : "-"}`;
        part += 1;
      } else plain += digit;
    }
    if (plain) keys.push(`formula:${plain}`);
    index = cursor;
  }
  return keys;
}

function sameKeys(left: QuantityKey[], right: QuantityKey[]): boolean {
  if (left.length !== right.length) return false;
  const pending = [...right];
  for (const key of left) {
    const at = pending.indexOf(key);
    if (at < 0) return false;
    pending.splice(at, 1);
  }
  return pending.length === 0;
}

/**
 * Sese giden metin. Değer geri çözülmezse üs rakamla okunur.
 * Rakamlı okuyuş da aynı anahtara inmek zorundadır.
 */
export function speakVerified(text: string): string {
  const display = toDisplay(text);
  const spoken = renderSpoken(display, false);
  const expected = quantityKeys(display, false);
  if (!expected.length) return spoken;
  if (sameKeys(expected, keysFromSpoken(spoken))) return spoken;
  const digitSpoken = renderSpoken(display, true);
  if (sameKeys(expected, keysFromSpoken(digitSpoken))) return digitSpoken;
  return digitSpoken;
}

export function speechRoundTrip(text: string): {
  display: string;
  spoken: string;
  ok: boolean;
  expected: QuantityKey[];
  heard: QuantityKey[];
} {
  const display = toDisplay(text);
  const spoken = speakVerified(text);
  const expected = quantityKeys(display, false);
  const heard = keysFromSpoken(spoken);
  return { display, spoken, ok: sameKeys(expected, heard), expected, heard };
}

/**
 * Kayıtlı satır. `spoken` varsa sese o gider (eski ses dosyası boşa düşmesin).
 * Yoksa ve metin zaten konuşma diline çevrilmişse ekran simgeye çekilir,
 * sese eski cümle kalır: yeniden seslendirip kredi yazılmaz.
 * Düz simgeyse sese doğrulanmış okunuş konur.
 */
export function splitDisplaySpoken(text: string, spoken?: string): { text: string; spoken: string } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (spoken?.trim()) return { text: toDisplay(clean), spoken: spoken.replace(/\s+/g, " ").trim() };
  const display = toDisplay(clean);
  if (display !== clean) return { text: display, spoken: clean };
  return { text: display, spoken: speakVerified(display) };
}
