/**
 * Çözümlü örnek tamlığı: verilen, yerine koyma ve bitmiş sonuç.
 *
 * Eski ders onarım katmanından (lesson-repair.ts) taşındı; o katman
 * 3 Ekim 2026'da silindi. Podcast, sözlü ve soru doğrulayıcısı hâlâ
 * "yarım örnek" denetimini kullanıyor.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { MEASURE } from "@/lib/learning/lesson-claims";

function placeholderWork(text: string): boolean {
  const folded = foldTr(text);
  return /adim\s*\d+/.test(folded) && /sonucu hesapla/.test(folded);
}

function readNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function nearly(left: number, right: number, tolerance: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function hasSymbolicRelation(text: string): boolean {
  if (symbolicEquations(text).length > 0) return true;
  return /[A-Za-zΔδ][A-Za-z0-9_Δδ]*\s*=\s*[^0-9.;]{0,60}[A-Za-zΔδ∫]/.test(text);
}

/**
 * Bitmiş sonuç. `N = 0,25 × 6,02 × 10²³` burada sonuç değildir:
 * eşittirin sağı işlemle devam ediyor. `= 1,505 × 10²³` sonuçtur.
 * Sayı ortadan bölünmez: `= 0,2` diye `0,25` içinden sonuç çıkmaz.
 */
function hasFinishedResult(text: string): boolean {
  const result = new RegExp(
    // (?![.,]?\d): "= 7." cümle sonudur, sonuçtur; "= 0,2" + "5" değildir.
    `(?:=|≈)\\s*\\d+(?:[.,]\\d+)?(?![.,]?\\d)(?:\\s*[×x·]\\s*10(?:\\^\\s*[+-]?\\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)?)?(?:\\s*(?:${MEASURE})(?![A-Za-zÇĞİÖŞÜçğıöşü]))?`,
    "gi",
  );
  for (const match of text.matchAll(result)) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (/^\s*[/×*·+\-−]/.test(after)) continue;
    return true;
  }
  // Matematikte sonuç çoğu zaman bir kesir ya da negatif sayıdır:
  // `5⁻² = 1/25`, `(2/3)⁻² = 9/4`, `2 − 5 = −3`. Yukarıdaki kalıp `= 1`
  // görüp ardından `/25` geldiği için onu yarım işlem sayıyordu.
  for (const match of text.matchAll(/(?:=|≈)\s*[-−]?\d+(?:\s*\/\s*\d+)?(?![.,]?\d)/g)) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (/^\s*[/×*·+\-−^]/.test(after)) continue;
    return true;
  }
  return false;
}

/**
 * Birimsiz matematik: üs, kök, π, trigonometri, logaritma ya da kesir var
 * ve hiçbir sayının yanında ölçü birimi yok. "Verilen" şartı fizik
 * örnekleri için yazıldı (verilen = birimli nicelik). Üslü sayılar ya da
 * trigonometri örneğinde birim olmaz; şart yüzünden bu konuların çözümlü
 * örneği hiç yayına çıkmıyordu.
 */
function unitlessMathWork(text: string): boolean {
  if (new RegExp(`\\d+(?:[.,]\\d+)?\\s*${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`).test(text)) return false;
  return /[\^⁰¹²³⁴⁵⁶⁷⁸⁹⁻√π]|\b(?:sin|cos|tan|cot|log|ln)\b|\d\s*\/\s*\d/.test(text);
}

/** Verilen, yerine koyma ve sayısal sonuç yoksa hesap yarım kalmıştır. */
export function exampleIsComplete(text: string): boolean {
  if (!text.trim() || placeholderWork(text)) return false;
  if (workedExampleNeedsFormula(text)) return false;
  const given =
    new RegExp(`\\d+(?:[.,]\\d+)?\\s*${MEASURE}`, "i").test(text) || unitlessMathWork(text);
  const substituted =
    /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²·]+)?\s*[/×*·+\-−]\s*\d/.test(text) ||
    /\(\d+(?:[.,]\d+)?\s*[^)]+\)\s*\(/.test(text) ||
    // Üslü yazım: "3⁴ × 3⁻²", "2³ ÷ 2⁵" — sayı ile işleç arasında üst simge var.
    /\d[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+\s*[/×*·÷+\-−]\s*\d/.test(text);
  return given && substituted && hasFinishedResult(text);
}

function bareDifference(text: string): boolean {
  const compact = text.replace(/\s+/g, " ");
  if (/[×x*/]/.test(compact) || hasSymbolicRelation(text)) return false;
  return /=\s*\d+(?:[.,]\d+)?\s*[-−]\s*\d+(?:[.,]\d+)?\s*=\s*\d/.test(compact);
}

function bareQuotient(text: string): boolean {
  if (hasSymbolicRelation(text)) return false;
  return /\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*=\s*\d/.test(text);
}

function bareFunctionProduct(text: string): boolean {
  if (hasSymbolicRelation(text)) return false;
  if (!/(?:ln|log|exp)\s*\(?\s*\d/i.test(text)) return false;
  return /(?:≈|=)\s*\d+(?:[.,]\d+)?/.test(text);
}

function proseCombination(text: string): boolean {
  if (/[=≈]/.test(text) || hasSymbolicRelation(text)) return false;
  const amounts = [
    ...text.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`, "gi")),
  ].map((match) => readNumber(match[1]));
  if (amounts.length < 3) return false;
  const result = amounts[amounts.length - 1];
  const inputs = amounts.slice(0, -1);
  return inputs.some((left, index) =>
    inputs.slice(index + 1).some((right) =>
      nearly(left - right, result, 0.051) ||
      nearly(left + right, result, 0.051) ||
      (right !== 0 && nearly(left / right, result, 0.051)),
    ),
  );
}

/**
 * Sol taraf adlandırılmış, işlemdeki iki sayı da birimiyle duruyorsa
 * satır kendi sonucunu kurmuştur. Birimsiz sayı zinciri formül bekler.
 */
function namesItsCalculation(text: string): boolean {
  if (/(?:^|[^A-Za-zÇĞİÖŞÜçğıöşü])(sonuç|sonuc|cevap)(?:$|[^A-Za-zÇĞİÖŞÜçğıöşü])/i.test(text)) return false;
  const named =
    /[A-Za-zΔδ][A-Za-z0-9_Δδ]*\s*=\s*\d+(?:[.,]\d+)?\s*[/×*·+\-−]\s*\d+(?:[.,]\d+)?\s*(?:=|≈)\s*\d/.test(text);
  if (!named) return false;
  const ops = text.match(/(\d+(?:[.,]\d+)?)\s*[/×*·+\-−]\s*(\d+(?:[.,]\d+)?)/);
  if (!ops) return false;
  const withUnit = (raw: string) => new RegExp(`(?<!\\d)${escapeReg(raw)}(?!\\d)\\s*${MEASURE}`, "i").test(text);
  return withUnit(ops[1]) && withUnit(ops[2]);
}

/** Sayısal hesap formülü yazmıyorsa tamamlanmalıdır. Adı ve sonucu duran zincir ayrıca yükseltilir. */
function workedExampleNeedsFormula(text: string): boolean {
  if (hasSymbolicRelation(text) || namesItsCalculation(text)) return false;
  return bareDifference(text) || bareQuotient(text) || bareFunctionProduct(text) || proseCombination(text);
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asksMeasuredResult(text: string, kind: "mass" | "count"): boolean {
  const folded = foldTr(text);
  if (kind === "mass") return /kutlesini bul|gram cinsinden kutle|kac g\b|kac gram/.test(folded);
  return /tanecik say|atom say|molekul say/.test(folded);
}

function hasMassResult(text: string): boolean {
  return new RegExp(
    `(?:=|≈)\\s*\\d+(?:[.,]\\d+)?(?:\\s*[×x·]\\s*10(?:\\^\\s*[+-]?\\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)?)?\\s*(?:g\\/mol|miligram|kilogram|mg|kg|gram|g)(?![A-Za-zÇĞİÖŞÜçğıöşü])(?!\\s*[/×*·+\\-−])`,
    "i",
  ).test(text);
}

/** Sonuç `= 1,505 × 10²³` olmalı. `= 0,25 × 6,02 × 10²³` yerine koyma, sonuç değil. */
function hasCountResult(text: string): boolean {
  return /(?:=|≈)\s*\d+(?:[.,]\d+)?\s*[×x·]\s*10(?:\^\s*[+-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)(?!\s*[/×*·+\-−])/.test(text);
}

function namedExample(folded: string): boolean {
  return (
    /\bornekten\b|\bornekte\b|\bornek\s*:/.test(folded) ||
    /uygulamali ornek/.test(folded)
  );
}

/** Ürün miktarı: sayı, birim ve ürün aynı cümlede. Ara adım (`= 1,5 mol H₂`) sayılmaz. */
function hasProductAmount(text: string): boolean {
  const folded = foldTr(text);
  return /urun[^.\n]{0,50}\d+(?:[.,]\d+)?\s*(?:g|mol|kg)/.test(folded)
    || /\d+(?:[.,]\d+)?\s*(?:g|mol|kg)[^.\n]{0,40}urun/.test(folded)
    || /=\s*\d+(?:[.,]\d+)?\s*(?:g|mol|kg)[^.\n]{0,40}(?:nh3|urun)/.test(folded);
}

/**
 * Sınırlayıcı örnek tepkime ve reaktif miktarını verip ürünü sonraki
 * bölüme bırakıyorsa örnek bitmemiştir.
 */
function limitingExampleMissingProduct(text: string, folded: string): boolean {
  if (!namedExample(folded) || !/sinirlay/.test(folded)) return false;
  if (!/→|->|=>/.test(text)) return false;
  const amounts = text.match(/\d+(?:[.,]\d+)?\s*(?:mol|g)(?![A-Za-z])/gi) ?? [];
  if (amounts.length < 2) return false;
  return !hasProductAmount(text);
}

/**
 * Duyurulmuş örnek: verilen, formül, yerine koyma ve bitmiş sonuç.
 * Başlıkta "Örnek:" yetiyor; gövde "bulmak için" diye açılmış hesap da öyle.
 * "örneğin" duyuru değildir. Sayı vermeden "belirlemek için" diyen
 * sınırlayıcı bölümü de yarım örnektir.
 */
export function announcedExampleGap(text: string): string | null {
  const folded = foldTr(text);
  if (/sinirlay/.test(folded) && /belirlemek icin/.test(folded) && !/\d/.test(text)) {
    return "Örnek yarım: verilen, adımlar ve birimli sonuç aynı bölümde yazılacak. Sayı yoksa başlık kalkacak.";
  }
  const announced =
    namedExample(folded) ||
    (/\buygulamali\b/.test(folded) && /\bhesap/.test(folded)) ||
    (/bulmak icin|hesaplanarak|hesaplayalim|hesaplayin/.test(folded) &&
      /formul|=\s*[A-Za-z]/.test(folded) &&
      new RegExp(`\\d+(?:[.,]\\d+)?\\s*${MEASURE}`, "i").test(text));
  if (!announced) return null;
  if (!exampleIsComplete(text)) {
    return "Örnek yarım: verilen, formül, yerine koyma ve sonuç yazılacak. Sonuç yoksa örnek konmayacak.";
  }
  if (limitingExampleMissingProduct(text, folded)) {
    return "Örnek yarım: sınırlayıcı bulunduktan sonra ürün miktarı da aynı bölümde, birimiyle yazılacak.";
  }
  if (asksMeasuredResult(text, "mass") && !hasMassResult(text)) {
    return "Kütle sorulmuş örnekte sonuç gram, kilogram ya da g/mol ile yazılacak.";
  }
  if (asksMeasuredResult(text, "count") && !hasCountResult(text)) {
    return "Tanecik ya da atom sayısı sorulmuş örnekte sonuç 10 üzeri biçiminde yazılacak.";
  }
  return null;
}

/**
 * "Örnek:" bloğu ya da hesaplanıp bulunur denilen senaryo,
 * yerine koyma ve sonuç taşımıyorsa örnek değildir.
 */
export function isIncompleteExample(text: string): boolean {
  if (!text.trim() || placeholderWork(text)) return false;
  if (announcedExampleGap(text)) return true;
  if (exampleIsComplete(text)) return false;
  const folded = foldTr(text);
  if (/\bornek\s*:/.test(folded)) return true;
  return /hesaplanarak/.test(folded) && /\d/.test(text) && /\bbulunur\b/.test(folded);
}

const FORMULA_STOP = new Set([
  "ve",
  "ic",
  "ile",
  "bir",
  "bu",
  "su",
  "da",
  "de",
  "ki",
  "mi",
  "mu",
  "her",
  "ya",
  "ise",
  "veya",
  "icin",
  "olan",
  "olarak",
  "is",
  "isi",
  "gibi",
]);

function formulaToken(token: string): boolean {
  if (/[∫Δδ()[\]+\-−–×*/^₀-₉⁰-⁹0-9_]/.test(token)) return true;
  const bare = token.replace(/^[.(]+|[.,;:)]+$/g, "");
  if (!bare || FORMULA_STOP.has(foldTr(bare))) return false;
  if (/^d[A-Za-z]$/.test(bare)) return true;
  if (/[A-Z]/.test(bare.slice(1)) || /^ln$/i.test(bare)) return true;
  return bare.length <= 2 && /^[A-Za-zΔδ]+$/.test(bare);
}

/** `22,4` ve `22.4` tek sayıdır; virgül ya da nokta cümle sonu sayılmaz. */
function shieldDecimals(text: string): string {
  return text.replace(/(\d),(\d)/g, "$1\uE000$2").replace(/(\d)\.(\d)/g, "$1\uE001$2");
}

function restoreDecimals(text: string): string {
  return text.replace(/\uE000/g, ",").replace(/\uE001/g, ".");
}

function trimFormula(raw: string): string {
  let equation = shieldDecimals(raw.replace(/\s+/g, " ").trim());
  equation = equation
    .replace(/[,.;:].*$/, "")
    .replace(
      /\s+(?:formül\w*|formul\w*|ba[gğ]lant[ıi]\w*|ba[gğ]ınt[ıi]\w*|şeklinde|seklinde|yazılır|yazilir|bulunur|hesaplanır|hesaplanir|ile|olarak|eşitliği|esitligi|eşitliğe|esitlige).*$/i,
      "",
    )
    .replace(/[,\s]+$/g, "")
    .trim();
  const eq = equation.indexOf("=");
  if (eq < 0) return restoreDecimals(equation);
  const words = equation
    .slice(eq + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && !formulaToken(restoreDecimals(words[words.length - 1]))) words.pop();
  return restoreDecimals(`${equation.slice(0, eq).trim()} = ${words.join(" ")}`.replace(/\s+/g, " ").trim());
}

/** Sayı, birim ya da sayıya uygulanan fonksiyon bir bağıntı değildir. */
function measuredConstant(equation: string): boolean {
  const right = equation.split("=").slice(1).join("=");
  const stripped = right
    .replace(/\b(?:ln|log|exp)(?=\d|\s*\()/gi, "")
    .replace(new RegExp(MEASURE, "gi"), "")
    .replace(/[\d.,\s×*·+\-−/()≈^]/g, "");
  return stripped.length === 0;
}

function symbolicEquations(sentence: string): string[] {
  const normalized = sentence.replace(/\bc\s*_?\s*([vp])\b/gi, "c_$1");
  const start =
    /(?:(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*[-−–+]\s*)?(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*=\s*/g;
  const starts = [...normalized.matchAll(start)];
  const out: string[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const begin = match?.index ?? 0;
    const end = starts[index + 1]?.index ?? normalized.length;
    for (const piece of trimFormula(normalized.slice(begin, end)).split(/\s+ve\s+/i)) {
      const trimmed = trimFormula(piece);
      if (!trimmed || (trimmed.match(/=/g) ?? []).length !== 1) continue;
      if (/\|/.test(trimmed)) continue;
      const right = trimmed.split("=").slice(1).join("=");
      if (!/[A-Za-zΔδ∫]/.test(right) || trimmed.length < 5 || trimmed.length > 120) continue;
      if (measuredConstant(trimmed)) continue;
      out.push(trimmed);
    }
  }
  return out;
}
