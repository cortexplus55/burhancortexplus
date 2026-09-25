/**
 * Hazırlığa kaç dosya gireceği.
 *
 * Sayaç yalnızca hazırlığa yazılmış dosyaları sayar. Seçilen deste tam
 * sınıra eşitse hepsi kabul edilir; sınırın üstü ayrıca reddedilir.
 */
export function filesAcceptedFromSelection(input: {
  committedCount: number;
  selectedCount: number;
  cap: number;
}): { accepted: number; overflow: number } {
  const committed = Math.max(0, Math.floor(input.committedCount));
  const selected = Math.max(0, Math.floor(input.selectedCount));
  const cap = Math.max(0, Math.floor(input.cap));
  const room = Math.max(0, cap - committed);
  const accepted = Math.min(selected, room);
  return { accepted, overflow: selected - accepted };
}
