/**
 * Kaynakta ölçü var mı (bütün dersler).
 *
 * Yıl ve tarih ölçü değildir. Formül, yüzde, üs ya da sayı + kısa birim varsa
 * sayısal yer açılabilir. Ders adı ya da kelime listesi yok.
 */

const YEAR = /\b(?:1[0-9]{3}|20[0-9]{2})\b/g;
const DATE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;

export function stripDatesAndYears(text: string): string {
  return text.replace(DATE, " ").replace(YEAR, " ");
}

/** Kaynakta ölçülebilir nicelik var (tarih ve yıl sayılmaz). */
export function sourceHasMeasurableQuantities(text: string): boolean {
  const stripped = stripDatesAndYears(text);
  if (/%\s*\d|\d+(?:[.,]\d+)?\s*%/.test(stripped)) return true;
  if (/[\p{L}\p{N}]\s*=\s*[\p{L}\p{N}]/u.test(stripped)) return true;
  if (/\d\s*\^\s*\d/.test(stripped)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*[A-Za-z]{1,4}\b/.test(stripped)) return true;
  return false;
}

/** Noktadaki sayılar (0 ve 1 ile yıl/tarih hariç). Boşsa imza eşlemesi gerekmez. */
export function measurableTokens(text: string): string[] {
  const stripped = stripDatesAndYears(text);
  const out: string[] = [];
  for (const match of stripped.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const token = match[0];
    if (token === "0" || token === "1") continue;
    out.push(token);
  }
  return [...new Set(out)];
}
