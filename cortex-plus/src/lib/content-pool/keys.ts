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
  /** Kanonik kimlik = curriculum_units.id: `program#sort_order` (1 tabanlı, tohum betiğiyle aynı). API, betik ve havuz yalnız bunu kullanır. */
  unitId: string;
  /** Yalnız kurulum ağacıyla eşleme için: o ağacın `program#index` (0 tabanlı) kimliği. Dışarıdan girdi olarak kabul edilmez. */
  appUnitId: string;
  program: CurriculumProgram;
  unit: CurriculumUnit;
  outcomes: PoolOutcome[];
  /** Ünitenin resmî içeriğinin özeti: kazanım kodu + metni + sınırlamaları. Değişirse içerik bayatlar. */
  sha256: string;
  sourceLinks: { title: string; url: string; publisher: string }[];
};

/** Kanonik ünite kimliği biçimi (curriculum_units.id). */
export const UNIT_ID_PATTERN = /^([a-z0-9-]{3,60})#([1-9]\d{0,2})$/;

/**
 * `unitId` = curriculum_units.id (`program#sort_order`, 1 tabanlı). curriculum_outcomes.id = `program#n`
 * (n programdaki 1 tabanlı genel sıra; data/curriculum/scripts/to_sql_csv.py).
 */
export function poolUnit(unitId: string): PoolUnit | null {
  const match = UNIT_ID_PATTERN.exec(unitId);
  if (!match) return null;
  const program = getProgram(match[1]!);
  const index = Number(match[2]) - 1;
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
  return { unitId: `${program.id}#${index + 1}`, appUnitId: `${program.id}#${index}`, program, unit, outcomes, sha256, sourceLinks };
}

/** Programın tüm üniteleri (toplu ön üretim betiği için). */
export function poolUnitsForProgram(programId: string, filter?: (title: string) => boolean): PoolUnit[] {
  const program = getProgram(programId);
  if (!program) return [];
  return program.units
    .map((u, i) => (filter && !filter(u.title) ? null : poolUnit(`${programId}#${i + 1}`)))
    .filter((u): u is PoolUnit => u !== null);
}
