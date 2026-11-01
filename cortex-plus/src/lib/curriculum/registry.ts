import "server-only";
import { isTreeExam, TREE_EXAMS } from "@/lib/curriculum/exam-trees";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  CurriculumProgram,
  CurriculumProgramSummary,
  CurriculumRef,
  CurriculumRegistry,
  CurriculumSource,
} from "@/lib/curriculum/types";
import { buildTopicMap, matchCodeForLabel, topicIndexForLabel, type CurriculumTopicMap } from "@/lib/curriculum/topic-map";

/**
 * Resmî müfredat kayıt defteri (sunucu). Aynı veri Supabase `curriculum_*` tablolarında da var
 * (herkese açık okuma); uygulama paketlenmiş kopyayı okur, böylece konu haritası ağ beklemeden çıkar.
 */
/*
 * 1 Kasım 2026: 800 KB'lık JSON `import` ile her sunucu paketine gömülüyordu (9 giriş noktası); Vercel
 * derlemesi bellek sınırını aşıp SIGKILL aldı. Dosya çalışma anında bir kez okunur, pakete girmez;
 * dağıtıma `outputFileTracingIncludes` ile kopyalanır.
 */
export const CURRICULUM: CurriculumRegistry = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/lib/curriculum/registry.json"), "utf8"),
) as CurriculumRegistry;

const BY_ID = new Map(CURRICULUM.programs.map((p) => [p.id, p]));

export function getProgram(id: string): CurriculumProgram | null {
  return BY_ID.get(id) ?? null;
}

export function programSources(program: CurriculumProgram): CurriculumSource[] {
  return program.sourceIds.map((id) => CURRICULUM.sources[id]).filter((s): s is CurriculumSource => Boolean(s));
}

/** YKS oturum aralıkları (kayıttaki açık veri). */
export const GRADE_SCOPES = CURRICULUM.examGradeScopes;

function topicCountsFor(program: CurriculumProgram): Record<string, number> {
  const count = (part: "TYT" | "AYT" | null) =>
    buildTopicMap(program, "serbest", null, { part, scopes: GRADE_SCOPES }).topics.length;
  return program.kind === "yks" ? { TYT: count("TYT"), AYT: count("AYT"), YKS: count(null) } : { all: count(null) };
}

export function listProgramSummaries(): CurriculumProgramSummary[] {
  return CURRICULUM.programs.map((program) => {
    const { units, ...rest } = program;
    return {
      ...rest,
      unitCount: units.length,
      outcomeCount: units.reduce((n, u) => n + u.outcomes.length, 0),
      topicCounts: topicCountsFor(program),
    };
  });
}

/** Hazırlıkta saklanan başvurudan kota haritası; program yoksa ya da başvuru bozuksa null. */
export function topicMapForRef(ref: CurriculumRef | null | undefined): CurriculumTopicMap | null {
  if (!ref) return null;
  const program = getProgram(ref.programId);
  if (!program) return null;
  return buildTopicMap(program, ref.examKey, ref.scenario, { part: ref.part ?? null, scopes: GRADE_SCOPES });
}

/**
 * Konuya karşılık gelen resmî kazanımların tamamı (ders anlatımı ve quiz dayanağı). Yeni hazırlıkta konu adı
 * haritadaki konudur (bütün kazanımları döner); eski "kod metin" adlarında yalnız o kazanım döner.
 */
export function outcomesForTopic(ref: CurriculumRef | null | undefined, topicLabel: string) {
  if (!ref) return [];
  const program = getProgram(ref.programId);
  if (!program) return [];
  const where = new Map<string, { unit: string; outcome: CurriculumProgram["units"][number]["outcomes"][number] }>();
  for (const unit of program.units) for (const o of unit.outcomes) if (!where.has(o.code)) where.set(o.code, { unit: unit.title, outcome: o });
  const text = topicLabel.replace(/\s+/g, " ").trim();
  const map = topicMapForRef(ref);
  const exact = map ? map.topics.indexOf(text) : -1;
  if (map && exact >= 0) return map.topicCodes[exact]!.map((code) => where.get(code)!).filter(Boolean);
  const code = matchCodeForLabel(text, where.keys());
  if (code) return [where.get(code)!];
  // Eski konu adı haritada başka biçimde olabilir (ör. süzgeç değişti): kodu içeren konu.
  const index = map ? topicIndexForLabel(map, text) : -1;
  return index >= 0 && map ? map.topicCodes[index]!.map((c) => where.get(c)!).filter(Boolean) : [];
}

export const CURRICULUM_REF_SCHEMA_EXAM_KEYS = ["d1y1", "d1y2", "serbest"] as const;

const EXAM_KEY_LABEL: Record<string, string> = { d1y1: "1. Dönem 1. Yazılı", d1y2: "1. Dönem 2. Yazılı" };

/** Hazırlıkta saklanan başvuruyu okur; biçim bozuksa null. */
export function readCurriculumRef(prefs: unknown): CurriculumRef | null {
  const ref = (prefs as { curriculum?: unknown } | null)?.curriculum as Partial<CurriculumRef> | undefined;
  if (!ref || typeof ref.programId !== "string" || typeof ref.examKey !== "string") return null;
  const part = ref.part === "TYT" || ref.part === "AYT" ? ref.part : null;
  return { programId: ref.programId, examKey: ref.examKey, scenario: ref.scenario ?? null, ...(part ? { part } : {}) } as CurriculumRef;
}

/** Resmî programa dayanan hazırlık için dürüst kaynak notu; program kayıtta yoksa null. */
export function officialSourceNote(ref: CurriculumRef | null | undefined): string | null {
  const program = ref ? getProgram(ref.programId) : null;
  if (!ref || !program) return null;
  const parts = [`${program.label} (${program.badge} / ${program.programVersion})`];
  if (ref.part) parts.push(`${ref.part} kapsamı`);
  const exam = EXAM_KEY_LABEL[ref.examKey];
  if (exam) {
    const sc = ref.scenario == null ? "" : ref.scenario === "karma" ? " · Karma senaryo" : ` · Senaryo ${ref.scenario}`;
    parts.push(`${exam}${sc}`);
  }
  return `🏛️ Bu hazırlık resmî programdaki kazanımlara göre hazırlandı: ${parts.join(" · ")}`;
}

/** Resmî sınav kurulumundan (officialPlan) kurulan hazırlık için kaynak notu; yoksa null. */
export function officialPlanNote(prefs: unknown): string | null {
  const plan = (prefs as { officialPlan?: { exam?: string; units?: { programId: string; codes: string[] }[] } } | null)?.officialPlan;
  if (!plan || !Array.isArray(plan.units) || !plan.units.length) return null;
  const programs = new Set(plan.units.map((u) => u.programId));
  const outcomes = plan.units.reduce((n, u) => n + (Array.isArray(u.codes) ? u.codes.length : 0), 0);
  if (isTreeExam(plan.exam)) {
    const def = TREE_EXAMS[plan.exam];
    return `🏛️ Bu hazırlık ${def.name} konu ağacına göre hazırlandı (${def.label}) · ${programs.size} ders · ${plan.units.length} konu · ${outcomes} alt başlık`;
  }
  const source = plan.exam === "lgs" ? "MEB LGS 2027 kazanımları" : "MEB 2026 YKS'ye esas kazanımlar · ÖSYM 2026-YKS Kılavuzu";
  return `🏛️ Bu hazırlık resmî programdaki kazanımlara göre hazırlandı: ${source} · ${programs.size} program · ${plan.units.length} ünite · ${outcomes} kazanım`;
}
