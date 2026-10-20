/**
 * Günü gelen tekrarın (20 Ekim 2026) sonuç ekranı satırı. Ayrı dosyada: etkinlik ekranı istemci
 * paketine `review-items.ts`'in ders/sözlü bağımlılıklarını taşımasın.
 *
 * Yalnız gerçekten yazılan yanlışlar sayılır; "yarın" her zaman doğru: yanlış 1. basamaktan (1 gün)
 * başlar, sınav yarınsa da tekrar sınav günü sabahı, yani yine yarın.
 */
export function reviewScheduledLine(count: number, kind?: string): string | null {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return null;
  if (kind === "flashcards" || kind === "spaced") {
    return n === 1 ? "Hatırlamadığın kart yarın yeniden sorulacak." : `Hatırlamadığın ${n} kart yarın yeniden sorulacak.`;
  }
  return n === 1 ? "Yanlış yaptığın soru yarın yeniden sorulacak." : `Yanlış yaptığın ${n} soru yarın yeniden sorulacak.`;
}
