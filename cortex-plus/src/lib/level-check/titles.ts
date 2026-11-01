import { getProgram } from "@/lib/curriculum/registry";
import { displayUnitTitles } from "@/lib/curriculum/unit-title";

/**
 * Havuz ünitesinin (`program#n`, 1 tabanlı) ekran başlığı: ortak `displayUnitTitles` ile program bağlamında sıra
 * numarası atılır ("9. Sınıf · 1. Tarih ve Zaman" → "9. Sınıf · Tarih ve Zaman"). Seviye kontrolündeki her başlık
 * (API yükü, tarama sonucu, ünite kartı, misafir ön izleme) buradan geçer.
 */
export function levelUnitTitle(poolUnitId: string): string | null {
  const m = /^(.+)#(\d+)$/.exec(poolUnitId);
  const program = m ? getProgram(m[1]!) : null;
  const index = m ? Number(m[2]) - 1 : -1;
  if (!program || !program.units[index]) return null;
  return displayUnitTitles(program.units.map((u) => u.title))[index] ?? null;
}
