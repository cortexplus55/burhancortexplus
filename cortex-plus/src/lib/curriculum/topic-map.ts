/**
 * Resmî programdan anında konu haritası (model çağrısı yok). Saf fonksiyonlar: sihirbaz, hazırlık kurulumu
 * ve deneme motoru aynı hesabı okur — gösterilen dağılım teslim edilen dağılımdır.
 *
 * Kural ders-bağımsızdır: hiçbir ders adına göre dal yoktur; yalnız kayıttaki kotalar okunur.
 *  - Senaryo N: o senaryoda soru alan kazanımlar, kotası aynen.
 *  - Bilmiyorum / Karma: herhangi bir senaryoda soru alan kazanımlar; kota = senaryolar ortalaması (yuvarlanır,
 *    en az 1). Toplam tek bir gerçek senaryoya eşit olmayabilir; ekranda "ortalama" diye yazılır.
 *  - Ülke geneli ortak sınav: tablo sınav öncesi yayımlanacak; bütün kazanımlar listelenir, kota yoktur.
 *  - Serbest ünite seçimi: bütün kazanımlar, kota yok.
 */
import type {
  CurriculumExamKey,
  CurriculumOutcome,
  CurriculumProgram,
  CurriculumScenario,
} from "@/lib/curriculum/types";

export const TOPIC_LABEL_MAX = 120;

/** Hazırlık konu adı: "kod metin", 120 karakterde kelime sınırından kırpılır. Kod başta kalır (eşleme anahtarı). */
export function outcomeTopicLabel(outcome: Pick<CurriculumOutcome, "code" | "text">): string {
  const full = `${outcome.code} ${outcome.text}`.replace(/\s+/g, " ").trim();
  if (full.length <= TOPIC_LABEL_MAX) return full;
  const cut = full.slice(0, TOPIC_LABEL_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > outcome.code.length ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Konu adı hangi kazanım koduyla başlıyor (kodlar boşluk içerebilir: "DKAB 5.1.1"); en uzun eşleşme kazanır. */
export function matchCodeForLabel(label: string, codes: Iterable<string>): string | null {
  const text = label.replace(/\s+/g, " ").trim();
  let best: string | null = null;
  for (const code of codes) {
    if ((text === code || text.startsWith(`${code} `)) && (!best || code.length > best.length)) best = code;
  }
  return best;
}

export type TopicMapUnit = { title: string; topicIndexes: number[] };

export type CurriculumTopicMap = {
  topics: string[];
  codes: string[];
  units: TopicMapUnit[];
  /** Kazanım kodu → soru sayısı. Boşsa kota yok (serbest / ülke geneli). */
  quotaByCode: Record<string, number>;
  /** Kotaların toplamı (resmî yazılının soru sayısı); kota yoksa 0. */
  total: number;
  national: boolean;
  averaged: boolean;
};

function quotaFor(outcome: CurriculumOutcome, examKey: string, scenario: CurriculumScenario, scenarios: number[]): number {
  const table = outcome.quotas?.[examKey] ?? {};
  if (scenario === "karma") {
    const values = scenarios.map((s) => Number(table[String(s)] ?? 0));
    if (!values.some((v) => v > 0)) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.max(1, Math.round(mean));
  }
  return Number(table[String(scenario)] ?? 0);
}

export function buildTopicMap(
  program: CurriculumProgram,
  examKey: CurriculumExamKey,
  scenario: CurriculumScenario | null,
): CurriculumTopicMap {
  const exam = examKey === "serbest" ? null : program.exams[examKey] ?? null;
  const national = Boolean(exam?.national);
  const quotaMode = Boolean(exam && !national && scenario != null);
  const topics: string[] = [];
  const codes: string[] = [];
  const units: TopicMapUnit[] = [];
  const quotaByCode: Record<string, number> = {};
  for (const unit of program.units) {
    const indexes: number[] = [];
    for (const outcome of unit.outcomes) {
      let quota = 0;
      if (quotaMode) {
        quota = quotaFor(outcome, examKey, scenario!, exam!.scenarios);
        if (quota <= 0) continue;
      }
      if (codes.includes(outcome.code)) continue;
      indexes.push(topics.length);
      topics.push(outcomeTopicLabel(outcome));
      codes.push(outcome.code);
      if (quotaMode) quotaByCode[outcome.code] = quota;
    }
    if (indexes.length) units.push({ title: unit.title, topicIndexes: indexes });
  }
  const total = Object.values(quotaByCode).reduce((a, b) => a + b, 0);
  return { topics, codes, units, quotaByCode, total, national, averaged: quotaMode && scenario === "karma" };
}

/** Yazılı seçeneği hangi senaryoları sunar (kayıtta ne varsa; ders adına göre değil). */
export function scenarioOptions(program: CurriculumProgram, examKey: CurriculumExamKey): number[] {
  if (examKey === "serbest") return [];
  const exam = program.exams[examKey];
  return exam && !exam.national ? [...exam.scenarios].sort((a, b) => a - b) : [];
}

/**
 * Sihirbazın ders/sınav adımında seçilen sınav türünden resmî program düzeyi (1 Kasım 2026).
 * TYT/AYT/YKS → "yks", LGS → "sinif-8", "10. sınıf" → "sinif-10"; tanınmazsa null.
 */
export function levelForExamLabel(label: string | null | undefined): string | null {
  const text = (label ?? "").toLocaleUpperCase("tr-TR");
  if (/\b(TYT|AYT|YKS)\b/.test(text)) return "yks";
  if (/\bLGS\b/.test(text)) return "sinif-8";
  const grade = /\b(\d{1,2})\s*\.?\s*SINIF/.exec(text);
  return grade ? `sinif-${Number(grade[1])}` : null;
}

/** Seçilen sınav TYT mi AYT mi (YKS programında dürüst not için); ikisi de değilse null. */
export function yksPartForLabel(label: string | null | undefined): "TYT" | "AYT" | null {
  const text = (label ?? "").toLocaleUpperCase("tr-TR");
  if (/\bTYT\b/.test(text)) return "TYT";
  if (/\bAYT\b/.test(text)) return "AYT";
  return null;
}

/** Programın okul yazılısı var mı; yoksa "Hangi yazılı" seçimi gösterilmez. */
export function hasSchoolExams(program: { exams: Record<string, unknown> }): boolean {
  return Object.keys(program.exams ?? {}).length > 0;
}
