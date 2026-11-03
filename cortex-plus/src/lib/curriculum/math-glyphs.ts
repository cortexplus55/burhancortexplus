/**
 * MEB PDF'inden çıkarılan sınırlamalarda matematik italik harfler ikilenmiş geliyor ("𝑝𝑝 ⇒ 𝑞𝑞", 4 Kasım 2026 Senaryo A).
 * Yalnız gösterim ve model girdisi için düzeltilir: kayıt metni (ve ünite özeti `unit_sha256`) değişmez, böylece
 * havuz içerikleri ve paylaşımlı medya geçersizleşmez, yeniden üretim tetiklenmez.
 */
const MATH_ITALIC_LOWER = 0x1d44e; // 𝑎
const MATH_ITALIC_UPPER = 0x1d434; // 𝐴

function plainLetter(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp >= MATH_ITALIC_LOWER && cp < MATH_ITALIC_LOWER + 26) return String.fromCharCode(97 + cp - MATH_ITALIC_LOWER);
  if (cp === 0x210e) return "h";
  if (cp >= MATH_ITALIC_UPPER && cp < MATH_ITALIC_UPPER + 26) return String.fromCharCode(65 + cp - MATH_ITALIC_UPPER);
  return ch;
}

export function cleanMathGlyphs(text: string): string {
  // İkilenmiş aynı italik harf → tek harf; kalan italik harfler düz harfe.
  return text
    .replace(/([\u{1D434}-\u{1D467}\u210E])\1/gu, "$1")
    .replace(/[\u{1D434}-\u{1D467}\u210E]/gu, plainLetter);
}
