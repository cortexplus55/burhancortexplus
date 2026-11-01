/**
 * Resmî müfredat kayıt defteri tipleri (1 Kasım 2026).
 * Veri `registry.json`'dan gelir; o dosya resmî MEB / ÖDSGM / ÖSYM / Diyanet belgelerinden ayrıştırılır
 * (`data/curriculum/scripts`). Hiçbir satır elle ya da modelle üretilmez.
 */

export type CurriculumSource = {
  id: string;
  url: string;
  sha256: string;
  program_version: string;
  publisher: string;
  title: string;
  fetched_at: string;
  page?: string;
};

/** Senaryo numarası (metin) → o senaryodaki soru sayısı. */
export type ScenarioQuotas = Record<string, number>;

export type CurriculumOutcome = {
  code: string;
  text: string;
  topic: string | null;
  limitations: string[];
  /** Sınav anahtarı (d1y1, d1y2) → senaryo kotaları. */
  quotas: Record<string, ScenarioQuotas>;
  sourceId: string;
  xlsxSourceId?: string;
  similarity?: number;
};

export type CurriculumUnit = { title: string; outcomes: CurriculumOutcome[] };

export type CurriculumExamInfo = { scenarios: number[]; national: boolean };

export type CurriculumProgram = {
  id: string;
  kind: "okul" | "yks";
  grade: number | null;
  subjectKey: string;
  subject: string;
  label: string;
  programVersion: string;
  badge: string;
  scope: string;
  sourceIds: string[];
  units: CurriculumUnit[];
  exams: Record<string, CurriculumExamInfo>;
};

export type ExamStructureRow = {
  exam: string;
  section: string;
  subject: string;
  count: number;
  weight: number | null;
  minutes: number | null;
  sourceId: string;
  order: number;
};

export type CalendarEvent = {
  id: string;
  kind: "meb" | "sinav" | "dini";
  label: string;
  starts: string;
  ends: string;
  sourceId: string;
  exam: string | null;
};

export type Exclusion = { source: string; section: string; code?: string | null; reason: string };

export type CurriculumRegistry = {
  version: string;
  fetchedAt: string;
  sources: Record<string, CurriculumSource>;
  programs: CurriculumProgram[];
  examStructures: ExamStructureRow[];
  calendar: CalendarEvent[];
  excluded: Exclusion[];
};

/** Öğrencinin hazırlandığı yazılı: 1. dönem 1. / 2. ortak yazılı ya da serbest ünite seçimi. */
export type CurriculumExamKey = "d1y1" | "d1y2" | "serbest";
export type CurriculumScenario = number | "karma";

/** Hazırlığın `learning_preferences.curriculum` alanı. Kotalar sunucuda kayıt defterinden yeniden hesaplanır. */
export type CurriculumRef = {
  programId: string;
  examKey: CurriculumExamKey;
  scenario: CurriculumScenario | null;
};

/** Program listesi (istemciye giden hafif özet). */
export type CurriculumProgramSummary = Omit<CurriculumProgram, "units"> & {
  unitCount: number;
  outcomeCount: number;
};
