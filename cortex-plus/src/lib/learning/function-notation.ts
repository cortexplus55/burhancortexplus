/**
 * Bileşke ve ters fonksiyon gösterimi (V6 raporu, 28 Ekim 2026).
 *
 * Açıklamalar "(g∘f)(x) = f(g(x))" ve "f⁻¹(y) = x ⟺ f(y) = x" diye tanımı tersine çeviriyordu; doğru
 * cevabı seçen öğrenci yanlış gerekçe okuyordu. Yazar ve denetçi kuralı aynı cümleyle bilir; kod
 * yalnız birebir yer değiştirmiş biçimi yakalar.
 */
export const FUNCTION_NOTATION_RULE =
  "Fonksiyon gösterimini tersine çevirme: bileşkede sağdaki fonksiyon önce uygulanır, (g∘f)(x) = g(f(x)) " +
  "(önce f, sonra g); f(g(x)) ise (f∘g)(x)'tir. Ters fonksiyonda f⁻¹(y) = x ancak ve ancak f(x) = y; " +
  "f⁻¹(x), 1/f(x) değildir. Anlatım, şık, açıklama ve çözüm bu iki tanımla çelişmez.";

/** LaTeX ve düz yazım biçimlerini tek gösterime indirir; işaretlerin çevresindeki boşluk atılır, sözcük aralığı kalır. */
function normalizeNotation(text: string): string {
  return text
    .replace(/\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\circ/g, "∘")
    .replace(/\^\{\s*-\s*1\s*\}|\^\s*\(\s*-\s*1\s*\)|\^\s*-\s*1/g, "⁻¹")
    .replace(/\\iff|\\Leftrightarrow|<=>|⇔|↔/g, "⟺")
    .replace(/\s+/g, " ")
    .replace(/\s*([()=∘⟺⁻¹,;:])\s*/gu, "$1");
}

const VAR = "[A-Za-z0-9]+";
/** "(g∘f)(x)=f(g(x))" — parantezsiz "g∘f(x)" de. */
const COMPOSITION = new RegExp(`\\(?([A-Za-z])∘([A-Za-z])\\)?\\((${VAR})\\)=([A-Za-z])\\(([A-Za-z])\\((${VAR})\\)\\)`, "g");
/** "f⁻¹(y)=x"; ardından gelen 60 karakterde aynı fonksiyonun "f(…)=…" ifadesi aranır. */
const INVERSE = new RegExp(`([A-Za-z])⁻¹\\((${VAR})\\)=(${VAR})`, "gu");

/** Metindeki tersine çevrilmiş bileşke/ters fonksiyon ifadeleri (boşsa sorun yok). */
export function reversedFunctionNotation(text: string | undefined | null): string[] {
  const value = normalizeNotation(text ?? "");
  if (!value) return [];
  const found: string[] = [];
  for (const m of value.matchAll(COMPOSITION)) {
    const [whole, outer, inner, arg, first, second, innerArg] = m;
    if (outer !== inner && arg === innerArg && first === inner && second === outer) found.push(whole);
  }
  for (const m of value.matchAll(INVERSE)) {
    const [whole, fn, input, output] = m;
    const start = (m.index ?? 0) + whole.length;
    const after = value.slice(start, start + 60);
    const pair = new RegExp(`(?:^|[^A-Za-z⁻])${fn}\\((${VAR})\\)=(${VAR})`).exec(after);
    if (pair && input !== output && pair[1] === input && pair[2] === output) {
      found.push(`${fn}⁻¹(${input})=${output} … ${fn}(${pair[1]})=${pair[2]}`);
    }
  }
  return found;
}

export const FUNCTION_NOTATION_ISSUE =
  "Fonksiyon gösterimi ters: (g∘f)(x) = g(f(x)) ve f⁻¹(y) = x ⟺ f(x) = y; ifadeyi bu tanıma göre düzelt.";
