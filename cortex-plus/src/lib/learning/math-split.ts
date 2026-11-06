import { MATH_SPAN_RE } from "@/lib/text/bracket-spans";

/**
 * KaTeX'siz matematik araçları (6 Kasım 2026): formül ayırma, kaçış ve "matematik var mı" sorusu. KaTeX
 * (~270 KB) yalnız `math-text.ts`te; istemci bileşenleri metni bu modülle ayırır, KaTeX'i ancak metinde
 * formül varsa yükler (`useMathRenderer`). İşlevler `math-text.ts`teki eski hâlleriyle birebir aynı.
 */

export type MathSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

/**
 * Formül parçalarını metinden ayırır.
 *
 * Dört gösterim de tanınıyor: `$$...$$` ve `\[...\]` blok, `$...$` ve
 * `\(...\)` satır içi. Köşeli ve parantezli biçimi sonradan eklemek zorunda
 * kaldık: model matematiği çoğunlukla onlarla yazıyor, yalnızca dolar
 * işaretine bakan ayırıcı ise onları düz metin sanıyordu. Sohbette "2 üssü 3
 * kaç eder?" diye sorduğumda yanıtta ekranda düpedüz `\[ 2^3 \]` yazıyordu.
 *
 * Tek `$` para birimi olarak da kullanılabildiği için, satır içi dolar
 * eşleşmesi yalnızca açılıştan hemen sonra ve kapanıştan hemen önce boşluk
 * olmayan bir karakter varsa geçerli sayılır — "5 $ ve 10 $" bozulmaz.
 *
 * Desen `MATH_SPAN_RE`'den gelir (29 Ekim 2026): ekranda matematik sayılan ile
 * tahta bölücüsünün opak saydığı aynı kümedir. Kopya alınır; paylaşılan global
 * desenin `lastIndex`i buradaki döngüye karışmasın.
 */
export function splitMath(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = new RegExp(MATH_SPAN_RE.source, MATH_SPAN_RE.flags);
  let cursor = 0;

  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: input.slice(cursor, match.index) });
    }
    const block = match[1] ?? match[2];
    const inline = match[3] ?? match[4];
    if (typeof block === "string") {
      segments.push({ type: "math", value: block.trim(), display: true });
    } else if (typeof inline === "string") {
      segments.push({ type: "math", value: inline.trim(), display: false });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < input.length) {
    segments.push({ type: "text", value: input.slice(cursor) });
  }
  return segments;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Metinde işlenmeyi bekleyen matematik var mı — gereksiz işten kaçınmak için.
 *
 * `splitMath` ile aynı gösterimlere bakmak zorunda: yalnızca dolara bakarken
 * köşeli biçimli formüller "matematik yok" sayılıp ham metin olarak geçiyordu.
 */
export function hasMath(input: string): boolean {
  return /\$[^$\n]/.test(input) || /\\\[|\\\(/.test(input) || /\\ce\{/.test(input);
}

/** KaTeX'in işlev adları: kelime sayılmaz. */
const TEX_FUNCTION_WORDS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "lim", "max", "min", "exp", "det", "mod",
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
]);
/** Kısa bağlaçlar: iki kelimenin arasında metnin parçasıdır ("A ve B"). */
const TEXT_JOINERS = new Set(["ve", "ya", "da", "de", "ki", "bu", "şu", "ile", "veya"]);
const WORD_RUN = /(?<![\\\p{L}])\p{L}+(?:['’]\p{L}+)?(?:[ \t]+\p{L}+(?:['’]\p{L}+)?)*/gu;

function isTextWord(word: string, first: boolean): boolean {
  const bare = word.replace(/['’].*$/, "");
  if (TEX_FUNCTION_WORDS.has(bare.toLowerCase())) return false;
  if (bare.length >= 3) return true;
  return !first && TEXT_JOINERS.has(bare.toLocaleLowerCase("tr"));
}

/**
 * Formül adımındaki doğal dil kelimelerini `\text{}` içine alır (30 Ekim 2026, canlı tur): çizimli videoda
 * "Genel fiyat düzeyi = …" matematik kipinde çizilince boşluklar kayboluyor, "ü" iki parçaya ayrılıyordu
 * ("Genelfiyatdu¨zeyi"). Üç ve daha uzun harfli kelimeler (arada "ve", "ile" gibi bağlaçlar) metin olur; tek harfli
 * değişken, "MV" gibi iki harfli çarpım, `\frac` gibi komutlar ve sin/log gibi işlev adları dokunulmaz. Metnin
 * yanındaki sayı ya da harfle arasındaki boşluk korunur. Zaten `\text` taşıyan adım olduğu gibi kalır.
 */
export function textifyFormulaWords(tex: string): string {
  if (/\\(?:text|mathrm|textrm|operatorname)\s*\{/.test(tex)) return tex;
  return tex.replace(WORD_RUN, (run: string, offset: number) => {
    const words = run.split(/[ \t]+/);
    // Baştan ve sondan metin olmayan kelimeleri ayır; ortadaki kesintisiz metin dizisi sarılır.
    let start = 0;
    while (start < words.length && !isTextWord(words[start], true)) start += 1;
    let end = words.length;
    while (end > start && !isTextWord(words[end - 1], true)) end -= 1;
    if (start >= end) return run;
    if (words.slice(start + 1, end - 1).some((word) => TEX_FUNCTION_WORDS.has(word.toLowerCase()))) return run;
    const head = words.slice(0, start).join(" ");
    const tail = words.slice(end).join(" ");
    const before = offset > 0 ? tex[offset - 1] : "";
    const beforeTwo = offset > 1 ? tex[offset - 2] : "";
    const after = tex[offset + run.length] ?? "";
    const afterTwo = tex[offset + run.length + 1] ?? "";
    const gapBefore = !head && /\s/.test(before) && /[\p{L}\p{N})]/u.test(beforeTwo) ? "\\ " : "";
    const gapAfter = !tail && /\s/.test(after) && /[\p{L}\p{N}(]/u.test(afterTwo) ? "\\ " : "";
    const text = `${gapBefore}\\text{${words.slice(start, end).join(" ")}}${gapAfter}`;
    // Matematik kipi boşluğu yutar: metnin yanında kalan değişkenle arası açık kalsın.
    return [head, text, tail].filter(Boolean).join("\\ ");
  });
}


/** KaTeX henüz yüklenmemişken formülün yerine geçen kaçışlı düz metin (`renderMath`in hata yedeğiyle aynı). */
export function plainMath(tex: string): string {
  return escapeHtml(tex);
}

/** Çizimli videonun formül adımı KaTeX ister mi (`formulaStepHtml` ile aynı ölçü). */
export function formulaStepNeedsKatex(step: string): boolean {
  return /[\^_{}]/.test(step);
}

/** TeX'siz formül adımının düz yazı hâli (`formulaStepHtml`in KaTeX'siz dalı). */
export function plainFormulaStepHtml(step: string): string {
  return `<span class="cp-sketch-plain">${escapeHtml(step)}</span>`;
}
