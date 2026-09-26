/**
 * Dashboard "Son ilerleme" satırı — tek cümle; veri yoksa satır çizilmez.
 * Ayrı bir istatistik kataloğu değil, öğrencinin döngüde nerede olduğunu
 * hatırlatan bir cümle.
 */
export type ProgressSummary = {
  onTargetTopics: number;
  totalTopics: number;
  masteredMistakes: number;
  openMistakes: number;
  lastExamScore: number | null;
  lastExamAt: string | null;
};

export function formatProgressLine(p: ProgressSummary): string | null {
  const parts: string[] = [];
  if (p.totalTopics > 0) {
    parts.push(`${p.totalTopics} konudan ${p.onTargetTopics}'i hedef seviyede`);
  }
  if (p.masteredMistakes > 0) {
    parts.push(`${p.masteredMistakes} yanlış defterden çıktı`);
  }
  if (p.lastExamScore != null) {
    parts.push(`son deneme %${p.lastExamScore}`);
  }
  if (!parts.length) return null;
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
