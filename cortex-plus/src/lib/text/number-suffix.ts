/**
 * Rakamla yazılan sayıya iyelik eki: "%67'si", "%60'ı", "%45'i", "%100'ü".
 *
 * Ek, sayının okunuşunun son kelimesine uyar (ünlü uyumu; sonu ünlüyse kaynaştırma "s"):
 * altmış yedi → yedi'si, altmış → altmış'ı, kırk beş → beş'i, yüz → yüz'ü. 24 Ekim 2026'ya kadar
 * Plus kartı eki sabit yazıyordu ve "%67'i" çıkıyordu.
 */

/** 1-9'un okunuşuna göre: bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz. */
const UNIT_SUFFIX = ["", "'i", "'si", "'ü", "'ü", "'i", "'sı", "'si", "'i", "'u"];
/** 10-90'ın okunuşuna göre: on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan. */
const TEN_SUFFIX = ["", "'u", "'si", "'u", "'ı", "'si", "'ı", "'i", "'i", "'ı"];

/** Kesmeyle birlikte ek: possessiveSuffix(67) → "'si". */
export function possessiveSuffix(value: number): string {
  const n = Math.abs(Math.trunc(value));
  if (n === 0) return "'ı"; // sıfır
  if (n % 10) return UNIT_SUFFIX[n % 10]!;
  if (n % 100) return TEN_SUFFIX[Math.floor(n / 10) % 10]!;
  if (n % 1000) return "'ü"; // yüz
  if (n % 1_000_000) return "'i"; // bin
  return "'u"; // milyon
}

/** "67'si" */
export function withPossessive(value: number): string {
  return `${value}${possessiveSuffix(value)}`;
}
