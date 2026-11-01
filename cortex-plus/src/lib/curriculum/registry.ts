import "server-only";
import raw from "@/lib/curriculum/registry.json";
import type {
  CurriculumProgram,
  CurriculumProgramSummary,
  CurriculumRef,
  CurriculumRegistry,
  CurriculumSource,
} from "@/lib/curriculum/types";
import { buildTopicMap, type CurriculumTopicMap } from "@/lib/curriculum/topic-map";

/**
 * Resmî müfredat kayıt defteri (sunucu). Aynı veri Supabase `curriculum_*` tablolarında da var
 * (herkese açık okuma); uygulama paketlenmiş kopyayı okur, böylece konu haritası ağ beklemeden çıkar.
 */
export const CURRICULUM: CurriculumRegistry = raw as unknown as CurriculumRegistry;

const BY_ID = new Map(CURRICULUM.programs.map((p) => [p.id, p]));

export function getProgram(id: string): CurriculumProgram | null {
  return BY_ID.get(id) ?? null;
}

export function programSources(program: CurriculumProgram): CurriculumSource[] {
  return program.sourceIds.map((id) => CURRICULUM.sources[id]).filter((s): s is CurriculumSource => Boolean(s));
}

export function listProgramSummaries(): CurriculumProgramSummary[] {
  return CURRICULUM.programs.map(({ units, ...rest }) => ({
    ...rest,
    unitCount: units.length,
    outcomeCount: units.reduce((n, u) => n + u.outcomes.length, 0),
  }));
}

/** Hazırlıkta saklanan başvurudan kota haritası; program yoksa ya da başvuru bozuksa null. */
export function topicMapForRef(ref: CurriculumRef | null | undefined): CurriculumTopicMap | null {
  if (!ref) return null;
  const program = getProgram(ref.programId);
  if (!program) return null;
  return buildTopicMap(program, ref.examKey, ref.scenario);
}

/** Konu adlarına (kodla başlayan) karşılık gelen resmî kazanımlar: ders anlatımı ve quiz için dayanak. */
export function outcomesForTopic(ref: CurriculumRef | null | undefined, topicLabel: string) {
  if (!ref) return [];
  const program = getProgram(ref.programId);
  if (!program) return [];
  const text = topicLabel.replace(/\s+/g, " ").trim();
  const hits = [];
  for (const unit of program.units) {
    for (const o of unit.outcomes) {
      if (text === o.code || text.startsWith(`${o.code} `)) hits.push({ unit: unit.title, outcome: o });
    }
  }
  hits.sort((a, b) => b.outcome.code.length - a.outcome.code.length);
  return hits.slice(0, 1);
}

export const CURRICULUM_REF_SCHEMA_EXAM_KEYS = ["d1y1", "d1y2", "serbest"] as const;

const EXAM_KEY_LABEL: Record<string, string> = { d1y1: "1. Dönem 1. Yazılı", d1y2: "1. Dönem 2. Yazılı" };

/** Hazırlıkta saklanan başvuruyu okur; biçim bozuksa null. */
export function readCurriculumRef(prefs: unknown): CurriculumRef | null {
  const ref = (prefs as { curriculum?: unknown } | null)?.curriculum as Partial<CurriculumRef> | undefined;
  if (!ref || typeof ref.programId !== "string" || typeof ref.examKey !== "string") return null;
  return { programId: ref.programId, examKey: ref.examKey, scenario: ref.scenario ?? null } as CurriculumRef;
}

/** Resmî programa dayanan hazırlık için dürüst kaynak notu; program kayıtta yoksa null. */
export function officialSourceNote(ref: CurriculumRef | null | undefined): string | null {
  const program = ref ? getProgram(ref.programId) : null;
  if (!ref || !program) return null;
  const parts = [`${program.label} (${program.badge} / ${program.programVersion})`];
  const exam = EXAM_KEY_LABEL[ref.examKey];
  if (exam) {
    const sc = ref.scenario == null ? "" : ref.scenario === "karma" ? " · Karma senaryo" : ` · Senaryo ${ref.scenario}`;
    parts.push(`${exam}${sc}`);
  }
  return `🏛️ Bu hazırlık resmî programdaki kazanımlara göre hazırlandı: ${parts.join(" · ")}`;
}
