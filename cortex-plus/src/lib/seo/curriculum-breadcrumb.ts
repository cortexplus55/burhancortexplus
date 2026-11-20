import { outcomePath, unitPath } from "@/lib/curriculum/seo";
import { SITE_NAME } from "@/lib/seo/page-metadata";

/** Müfredat dizininin sayfa başlığı (`/mufredat`); gezinme yolunun ikinci adımı. */
export const CURRICULUM_INDEX_TITLE = "Resmî Müfredat";

/**
 * Müfredat sayfalarının gezinme yolu (20 Kasım 2026, Faz 3): Cortex Plus → Resmî Müfredat → program → ünite →
 * kazanım. Her adımın adı o sayfanın kendi başlığı, adresi sayfadaki "←" bağlantısının gittiği yer.
 */
export function curriculumBreadcrumb(input: {
  program: { id: string; label: string };
  unit?: { index: number; title: string };
  outcome?: { index: number; code: string };
}): Array<{ name: string; path: string }> {
  const trail = [
    { name: SITE_NAME, path: "/" },
    { name: CURRICULUM_INDEX_TITLE, path: "/mufredat" },
    { name: input.program.label, path: `/mufredat/${input.program.id}` },
  ];
  if (input.unit) {
    trail.push({ name: input.unit.title, path: unitPath(input.program.id, input.unit.index) });
    if (input.outcome) {
      trail.push({
        name: input.outcome.code,
        path: outcomePath(input.program.id, input.unit.index, input.outcome.index),
      });
    }
  }
  return trail;
}
