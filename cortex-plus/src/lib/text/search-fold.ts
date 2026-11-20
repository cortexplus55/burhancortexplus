import { foldTr } from "@/lib/text/math-normalize";

/**
 * Anlık arama için metin anahtarı (20 Kasım 2026, Faz 3). Türkçe büyük/küçük harf ve şapka farkı yok sayılır
 * ("İSTATİSTİK" = "istatistik" = "Istatistik"), "ş/s", "ğ/g" gibi harfler aynı sayılır (öğrenci Türkçe klavyesiz
 * yazabilir). Harf ve rakam dışındaki her şey (alt çizgi, tire, nokta, parantez) boşluk olur: "ders_notu-3.pdf"
 * "ders notu 3" ile bulunur. Saf ve bağımlılıksız; istemci de okur.
 */
export function foldForSearch(value: string | null | undefined): string {
  return foldTr(value ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Sorgunun her kelimesi metinlerden en az birinde geçiyorsa eşleşir (sıra önemsiz). Boş sorgu her şeyle eşleşir.
 */
export function matchesSearch(haystacks: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const words = foldForSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const folded = haystacks.map(foldForSearch).join(" ");
  return words.every((word) => folded.includes(word));
}
