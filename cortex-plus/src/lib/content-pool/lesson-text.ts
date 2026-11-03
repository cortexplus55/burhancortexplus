import type { LessonBody } from "@/lib/content-pool/schema";

/**
 * Havuz anlatımı → düz kaynak metni (3 Kasım 2026). Belgesiz (havuz) hazırlıkta sözlü sınav bu metinden yazılır:
 * eskiden kaynak boş kalıyor, sözlü "Bu konu belgelerinde eşleşmedi" diyordu. Saf işlev; sınır karakter sayısı.
 */
export function poolLessonText(body: LessonBody, heading: string, maxChars = 12_000): string {
  const lines: string[] = [`## ${heading.trim() || body.title}`];
  if (body.overview?.trim()) lines.push(body.overview.trim());
  if (body.key_terms?.length) lines.push(`Temel kavramlar: ${body.key_terms.map((t) => `${t.term}: ${t.definition}`).join("; ")}`);
  for (const section of body.sections ?? []) {
    lines.push(`### ${section.heading}`);
    if (section.explanation?.trim()) lines.push(section.explanation.trim());
    if (section.key_points?.length) lines.push(section.key_points.map((p) => `• ${p}`).join("\n"));
    if (section.worked_example?.trim()) lines.push(`Örnek: ${section.worked_example.trim()}`);
  }
  if (body.summary?.trim()) lines.push(`Özet: ${body.summary.trim()}`);
  const text = lines.join("\n\n").trim();
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  return text.slice(0, cut > maxChars / 2 ? cut : maxChars).trim();
}
