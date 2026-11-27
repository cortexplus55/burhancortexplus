import "server-only";
import { CURRICULUM, getProgram } from "@/lib/curriculum/registry";
import { isTreeExam, TREE_EXAMS } from "@/lib/curriculum/exam-trees";
import { displayUnitTitles } from "@/lib/curriculum/unit-title";
import { cutAtWord } from "@/lib/curriculum/topic-map";
import type { CurriculumProgram } from "@/lib/curriculum/types";
import { SITE_URL } from "@/lib/seo/page-metadata";

/** Taban adres tek kaynaktan (`lib/seo/page-metadata.ts`). */
export const SITE_BASE = SITE_URL;

/** Konu ağacı programı (KPSS/ALES/DGS/YDS/TUS/DUS) için resmî liste olmadığını söyleyen etiket; MEB/ÖSYM resmî programda null. */
export function treeLabelFor(program: Pick<CurriculumProgram, "kind">): string | null {
  return isTreeExam(program.kind) ? TREE_EXAMS[program.kind].label : null;
}

/** Ünite adresi 1'den başlar (/mufredat/<program>/<n>); kayıt sırası değişmez. */
export function unitBySlug(programId: string, unitSlug: string) {
  const program = getProgram(programId);
  if (!program || !/^\d{1,3}$/.test(unitSlug)) return null;
  const index = Number(unitSlug) - 1;
  const unit = program.units[index];
  if (!unit) return null;
  const title = displayUnitTitles(program.units.map((u) => u.title))[index] ?? unit.title;
  return { program, unit, index, title };
}

export function outcomeBySlug(programId: string, unitSlug: string, outcomeSlug: string) {
  const hit = unitBySlug(programId, unitSlug);
  if (!hit || !/^\d{1,3}$/.test(outcomeSlug)) return null;
  const oIndex = Number(outcomeSlug) - 1;
  const outcome = hit.unit.outcomes[oIndex];
  return outcome ? { ...hit, outcome, oIndex } : null;
}

export const unitPath = (programId: string, index: number) => `/mufredat/${programId}/${index + 1}`;
export const outcomePath = (programId: string, index: number, oIndex: number) => `${unitPath(programId, index)}/${oIndex + 1}`;

export function shortText(text: string, max = 150): string {
  return cutAtWord(text, max) || text.slice(0, max);
}

/**
 * Eski konu ağacının derin karşılığı (27 Kasım 2026, /mufredat ince içerik temizliği). `*-2026-tree-*` programının
 * `*-2026-deep-*` eşi kayıt defterinde varsa eski ağaç aynı dersi ikinci kez, daha sığ kapsar: sayfaları açık kalır
 * (onlara bağlı eski hazırlıklar çalışır), ama arama motoruna `noindex, follow` gider ve site haritasına girmez.
 * Derin eşi olmayan ağaç (KPSS güncel bilgiler) değişmez.
 */
export function supersededBy(program: Pick<CurriculumProgram, "id">): CurriculumProgram | null {
  if (!program.id.includes("-2026-tree-")) return null;
  return getProgram(program.id.replace("-2026-tree-", "-2026-deep-")) ?? null;
}

/** Arama motoruna önerilmeyen sayfanın robots değeri (bağlantılar taranmaya devam eder). */
export const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/** Site haritası: program, ünite ve kazanım sayfaları (kayıt defterinden; veritabanı yok). Derin eşi olan eski ağaçlar yok. */
export function curriculumSitemapPaths(): string[] {
  const out = ["/mufredat"];
  for (const p of CURRICULUM.programs) {
    if (supersededBy(p)) continue;
    out.push(`/mufredat/${p.id}`);
    p.units.forEach((u, i) => {
      out.push(unitPath(p.id, i));
      u.outcomes.forEach((_, j) => out.push(outcomePath(p.id, i, j)));
    });
  }
  return out;
}
