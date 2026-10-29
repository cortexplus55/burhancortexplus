/**
 * Ayraç aralıkları: bölücüler için "bu nokta bir çiftin içinde mi" sorusunun tek cevabı
 * (29 Ekim 2026).
 *
 * Neden: ders tahtası düzenleyicisi (`lesson-board.ts`) cümleyi düz karakter dizisi gibi
 * bölüyordu. Canlıda "A = {1, 2, 3} kümesinden B = {a, b} kümesine 1 → a, 1 → b, 2 → a
 * eşlemesinde…" küme virgüllerinden satırlara kırıldı; "(−1, 4), (0, 2) noktaları"nda "2)"
 * liste imi sanılıp silindi; "(bkz. Şekil 2)" noktası cümle sonu sayıldı. Burada `$…$`
 * matematiği ve eşlenen ayraç çiftleri bir kez bulunur; bölücü yalnız derinlik 0'daki
 * eşleşmeyi kullanır. Bağımlılık yok (katex yok): istemci ve sunucu aynı modülü okur.
 *
 * Kurallar:
 * - Önce `MATH_SPAN_RE` (math-text.ts ile tek kaynak) eşleşmeleri opak aralıktır; içi taranmaz.
 *   Para birimi ("5 $ ve 10 $") splitMath'teki kararla aynı: matematik değil.
 * - Kalan metinde `()`, `[]`, `{}`, `⟨⟩`, `⌊⌋`, `⌈⌉` yığınla eşlenir. Kapanış yalnız yığın
 *   tepesi aynı türse eşer; tek istisna yarı açık aralık: "[−1, 2)" ve "(0, 2]" — yuvarlak ile
 *   köşeli birbirini kapatır.
 * - Eşleşmeyen kapanış ("a) şıkkı", "b)") yok sayılır; kapanmayan açılış ("f(x") aralık
 *   üretmez. Metin bozulmaz, kalan kısım bugünkü gibi bölünür.
 * - `|` İZLENMEZ: tek "|" küme kurucu ({x | x > 0}), koşullu olasılık (P(A | B)) ve tablo
 *   satırıdır; açılış/kapanış ayrımı yok. Mutlak değer yalnız dıştaki çiftle korunur.
 * - Çok uzun bir çift aralık sayılmaz (`MAX_PAIR_LENGTH`): kaçak bir "(" ile çok sonraki bir
 *   ")" bütün paragrafı yutup her bölmeyi kapatmasın.
 * - Yer tutucular (U+E000 sıra noktası, U+E100/U+E101 vurgu) düz metindir.
 */

/** math-text.ts `splitMath` ile aynı desen: `$$…$$`, `\[…\]`, `\(…\)` blok; `$…$` satır içi. */
export const MATH_SPAN_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g;

/** [açılış indeksi, kapanış indeksi] — ikisi de dahil. */
export type BracketSpan = [open: number, close: number];

const PAIRS = new Map<string, string>([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["⟨", "⟩"],
  ["⌊", "⌋"],
  ["⌈", "⌉"],
]);
const CLOSERS = new Set(PAIRS.values());
/** Yarı açık aralık: "[a, b)" ve "(a, b]" — yuvarlak ve köşeli birbirini kapatır. */
const INTERVAL_FAMILY = new Set(["(", "[", ")", "]"]);
/** Bundan uzun bir çift kaçak sayılır: ders paragrafındaki gerçek parantez 100-150 karakteri geçmez. */
const MAX_PAIR_LENGTH = 240;

function closes(opener: string, closer: string): boolean {
  if (PAIRS.get(opener) === closer) return true;
  return INTERVAL_FAMILY.has(opener) && INTERVAL_FAMILY.has(closer);
}

/** Metindeki opak matematik ve eşlenen ayraç çiftleri, açılış sırasıyla. */
export function bracketSpans(text: string): BracketSpan[] {
  const spans: BracketSpan[] = [];
  const math = new RegExp(MATH_SPAN_RE.source, MATH_SPAN_RE.flags);
  for (let match = math.exec(text); match; match = math.exec(text)) {
    spans.push([match.index, match.index + match[0].length - 1]);
  }
  const opaque = [...spans];
  let nextOpaque = 0;
  const stack: Array<{ ch: string; at: number }> = [];
  for (let i = 0; i < text.length; i += 1) {
    const skip = opaque[nextOpaque];
    if (skip && i === skip[0]) {
      i = skip[1];
      nextOpaque += 1;
      continue;
    }
    const ch = text[i]!;
    if (PAIRS.has(ch)) {
      stack.push({ ch, at: i });
      continue;
    }
    if (!CLOSERS.has(ch)) continue;
    const top = stack[stack.length - 1];
    // Eşleşmeyen kapanış ("a) şıkkı") yok sayılır; yığın bozulmaz.
    if (!top || !closes(top.ch, ch)) continue;
    stack.pop();
    if (i - top.at <= MAX_PAIR_LENGTH) spans.push([top.at, i]);
  }
  return spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

/** `index` bir aralığın içinde mi: açılış hariç, kapanış dahil (open < index ≤ close). */
export function insideSpan(spans: readonly BracketSpan[], index: number): boolean {
  return spans.some(([open, close]) => open < index && index <= close);
}

function globalCopy(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

/**
 * `text.matchAll(re)` eşleşmelerinden yalnız başlangıcı ayraç dışında olanlar. Bütün metin
 * üzerinde çalışır: `(?<=…)` lookbehind'lı desen de `String.split` ile aynı yerleri bulur
 * (parçalanmış alt dizilerde çalışmazdı).
 */
export function matchesOutsideBrackets(text: string, re: RegExp): RegExpExecArray[] {
  const spans = bracketSpans(text);
  const out: RegExpExecArray[] = [];
  for (const match of text.matchAll(globalCopy(re))) {
    if (!insideSpan(spans, match.index)) out.push(match);
  }
  return out;
}

/**
 * `text.split(re)` ile derinlik 0'da birebir aynı parçalar (yakalama grubu olmayan, boş
 * eşleşmeyen desenler için); ayraç içindeki eşleşme bölmez. `accept` verilirse yalnız onun
 * kabul ettiği eşleşmede kesilir.
 */
export function splitOutsideBrackets(
  text: string,
  re: RegExp,
  accept?: (match: RegExpExecArray) => boolean,
): string[] {
  const parts: string[] = [];
  let cursor = 0;
  for (const match of matchesOutsideBrackets(text, re)) {
    if (!match[0].length || match.index < cursor) continue;
    if (accept && !accept(match)) continue;
    parts.push(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return parts;
}

/** `from` ve sonrasında, ayraç dışındaki ilk eşleşmenin indeksi; yoksa -1. */
export function firstIndexOutsideBrackets(text: string, re: RegExp, from = 0): number {
  const match = matchesOutsideBrackets(text, re).find((candidate) => candidate.index >= from);
  return match ? match.index : -1;
}
