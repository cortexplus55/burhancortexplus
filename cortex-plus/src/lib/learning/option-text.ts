/**
 * Seçenek harfi ve hedef süre ayıklama (2 Kasım 2026 canlı ALES kontrolü): model şıkları "A) P", "B) Q" diye yazınca
 * ekran kendi harfini de basıyor, "A  A) P" görünüyordu. Yalnız TÜM şıklar sırayla A, B, C… imiyle başlıyorsa imler
 * atılır; "A-1, B-2" gibi içerik ya da tek bir şıkta geçen harf dokunulmaz.
 */
const LETTER = /^\s*\(?([A-Ea-e])\s*[).:]\s+/;

export function stripOptionLetters<T extends string>(options: readonly T[]): string[] {
  if (options.length < 2) return [...options];
  const ok = options.every((o, i) => {
    const m = LETTER.exec(o);
    return !!m && m[1]!.toUpperCase().charCodeAt(0) - 65 === i && o.replace(LETTER, "").trim().length > 0;
  });
  return ok ? options.map((o) => o.replace(LETTER, "").trim()) : [...options];
}

/** Kökün başındaki "⏱ Hedef süre: 45 sn" satırını ayırır; ekran bunu kökten ayrı bir çip olarak gösterir. */
export function splitTargetTime(prompt: string): { seconds: number | null; prompt: string } {
  const m = /^\s*⏱?\s*Hedef süre:\s*(\d{1,3})\s*sn\.?\s*(?:\n|$)/.exec(prompt);
  if (!m) return { seconds: null, prompt };
  return { seconds: Number(m[1]), prompt: prompt.slice(m[0].length).trimStart() };
}
