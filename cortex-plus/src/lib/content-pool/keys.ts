import "server-only";
import { createHash } from "node:crypto";
import { getProgram, programSources } from "@/lib/curriculum/registry";
import type { CurriculumOutcome, CurriculumProgram, CurriculumUnit } from "@/lib/curriculum/types";

/** Havuz içerik şeması sürümü. İstem ya da gövde biçimi değişince artırılır; eski sürüm silinmez. */
export const CONTENT_VERSION = 1;

/** Soru seçenek sayısı program türünden (kayıttaki veri); bilinmeyen tür için 5. */
const CHOICES_BY_KIND: Record<string, number> = { lgs: 4 };
export function choiceCount(program: Pick<CurriculumProgram, "kind">): number {
  return CHOICES_BY_KIND[program.kind] ?? 5;
}

export type PoolOutcome = CurriculumOutcome & { outcomeId: string };
export type PoolUnit = {
  /** Uygulamadaki kimlik (kurulum ağacı, hazırlık): `program#index` (0 tabanlı). */
  appUnitId: string;
  /** Veritabanı kimliği (curriculum_units.id): `program#sıra` (1 tabanlı, tohum betiğiyle aynı). */
  unitId: string;
  program: CurriculumProgram;
  unit: CurriculumUnit;
  outcomes: PoolOutcome[];
  /** Ünitenin resmî içeriğinin özeti: kazanım kodu + metni + sınırlamaları. Değişirse içerik bayatlar. */
  sha256: string;
  sourceLinks: { title: string; url: string; publisher: string }[];
};

/** curriculum_outcomes.id = `program#n` (n programdaki 1 tabanlı genel sıra; data/curriculum/scripts/to_sql_csv.py). */
export function poolUnit(appUnitId: string): PoolUnit | null {
  const match = /^([a-z0-9-]{3,60})#(\d{1,3})$/.exec(appUnitId);
  if (!match) return null;
  const program = getProgram(match[1]!);
  const index = Number(match[2]);
  const unit = program?.units[index];
  if (!program || !unit || unit.outcomes.length === 0) return null;
  let before = 0;
  for (let i = 0; i < index; i += 1) before += program.units[i]!.outcomes.length;
  const outcomes = unit.outcomes.map((o, i) => ({ ...o, outcomeId: `${program.id}#${before + i + 1}` }));
  const sha256 = createHash("sha256")
    .update(JSON.stringify(outcomes.map((o) => [o.code, o.text, o.limitations])))
    .digest("hex");
  const sources = programSources(program);
  const used = new Set(unit.outcomes.map((o) => o.sourceId));
  const sourceLinks = sources
    .filter((s) => used.has(s.id))
    .map((s) => ({ title: s.title, url: s.url, publisher: s.publisher }));
  return { appUnitId, unitId: `${program.id}#${index + 1}`, program, unit, outcomes, sha256, sourceLinks };
}

/** Programın tüm üniteleri (toplu ön üretim betiği için). */
export function poolUnitsForProgram(programId: string, filter?: (title: string) => boolean): PoolUnit[] {
  const program = getProgram(programId);
  if (!program) return [];
  return program.units
    .map((u, i) => (filter && !filter(u.title) ? null : poolUnit(`${programId}#${i}`)))
    .filter((u): u is PoolUnit => u !== null);
}
