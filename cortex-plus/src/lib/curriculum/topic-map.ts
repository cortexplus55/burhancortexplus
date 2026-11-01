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
 * Konu birimi ünite / alt başlıktır; konunun kotası kazanımlarının toplamıdır.
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

/** Konu birimi sınırları (1 Kasım 2026): konu = ünite / alt başlık; 16'dan fazlası komşularla birleşir. */
export const TOPIC_TARGET_MIN = 8;
export const TOPIC_TARGET_MAX = 16;
/**
 * Alt düzey açma (1 Kasım 2026): 6'dan az ünite ve 8'den az konu varsa resmî hiyerarşinin bir alt düzeyi
 * (kazanımlar) açılır; komşu kazanımlar aynı başlık içinde en fazla 14 konuya dengeli toplanır.
 * Ad, resmî başlık + kümenin ilk resmî kazanım metnidir (uydurma ad yok).
 */
export const OPEN_UNIT_LIMIT = 6;
export const OPEN_TOPIC_MAX = 14;

/** YKS oturum aralıkları kayıtta açık veri olarak durur; istemci/test için aynı varsayılan. */
export type GradeScopes = Record<"TYT" | "AYT" | "YKS", [number, number]>;
export const DEFAULT_GRADE_SCOPES: GradeScopes = { TYT: [9, 10], AYT: [11, 12], YKS: [9, 12] };

export type CurriculumTopicMap = {
  /** Konu adları (ünite ya da alt başlık; kazanım değil). */
  topics: string[];
  /** Her konunun bütün kazanım kodları (sırayla). */
  topicCodes: string[][];
  units: TopicMapUnit[];
  /** Konunun soru sayısı = kazanımlarının kotaları toplamı. */
  quotaByTopic: number[];
  /** Kazanım kodu → soru sayısı. Boşsa kota yok (serbest / ülke geneli). */
  quotaByCode: Record<string, number>;
  /** Kotaların toplamı (resmî yazılının soru sayısı); kota yoksa 0. */
  total: number;
  national: boolean;
  averaged: boolean;
  /** YKS oturum süzgeci (TYT / AYT); null = bütün kazanımlar. */
  part: "TYT" | "AYT" | null;
  /** Kazanım sayısı (süzgeçten sonra). */
  outcomeCount: number;
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

/** Kazanımın sınıfı: açık alan, yoksa kodun sınıf öneki ("10.1.2" / "M.8.1"), yoksa program sınıfı. */
export function outcomeGrade(outcome: Pick<CurriculumOutcome, "code" | "grade">, programGrade: number | null): number | null {
  if (typeof outcome.grade === "number") return outcome.grade;
  if (programGrade != null) return programGrade;
  const m = /^(?:[A-ZÇĞİÖŞÜ]+\.)?(\d{1,2})\./.exec(outcome.code);
  const g = m ? Number(m[1]) : NaN;
  return g >= 1 && g <= 12 ? g : null;
}

/** Oturum süzgeci: kazanımın sınıfı aralıkta mı. Sınıfı bilinmeyen kazanım TYT'ye girmez (AYT/YKS'ye girer). */
export function inPartScope(grade: number | null, part: "TYT" | "AYT" | null, scopes: GradeScopes): boolean {
  if (!part) return true;
  if (grade == null) return part !== "TYT";
  const [lo, hi] = scopes[part];
  return grade >= lo && grade <= hi;
}

type Group = {
  key: string;
  label: string;
  unit: string;
  grade: number | null;
  codes: string[];
  quota: number;
  /** Açılmış alt düzeyde: kazanımın bağlı olduğu resmî başlık. */
  parent?: string;
};

const SEP = " · ";
const NO_TOPIC = /^alt öğrenme alanı yok$/i;

function clampLabel(text: string): string {
  const full = text.replace(/\s+/g, " ").trim();
  if (full.length <= TOPIC_LABEL_MAX) return full;
  const cut = full.slice(0, TOPIC_LABEL_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** "10. Sınıf · A" + "10. Sınıf · B" → "10. Sınıf · A + B" (ortak önek bir kez yazılır). */
function joinLabels(a: string, b: string): string {
  const pa = a.split(SEP);
  const pb = b.split(SEP);
  let k = 0;
  while (k < pa.length - 1 && k < pb.length - 1 && pa[k] === pb[k]) k += 1;
  const head = pa.slice(0, k);
  return [...head, `${pa.slice(k).join(SEP)} + ${pb.slice(k).join(SEP)}`].join(SEP);
}

function commonUnit(a: string, b: string): string {
  if (a === b) return a;
  const pa = a.split(SEP);
  const pb = b.split(SEP);
  const head: string[] = [];
  for (let i = 0; i < Math.min(pa.length, pb.length) - 1 && pa[i] === pb[i]; i += 1) head.push(pa[i]!);
  return head.length ? head.join(SEP) : a;
}

/** Komşu iki grubu (izin verilen kapsamda) en küçük toplamla birleştirir; birleştirme yoksa false. */
function mergeOnce(groups: Group[], same: (a: Group, b: Group) => boolean): boolean {
  let best = -1;
  let bestSize = Infinity;
  for (let i = 0; i + 1 < groups.length; i += 1) {
    const a = groups[i]!;
    const b = groups[i + 1]!;
    if (!same(a, b)) continue;
    const size = a.codes.length + b.codes.length;
    if (size < bestSize) {
      best = i;
      bestSize = size;
    }
  }
  if (best < 0) return false;
  const a = groups[best]!;
  const b = groups[best + 1]!;
  groups.splice(best, 2, {
    key: `${a.key}+${b.key}`,
    label: joinLabels(a.label, b.label),
    unit: commonUnit(a.unit, b.unit),
    grade: a.grade,
    codes: [...a.codes, ...b.codes],
    quota: a.quota + b.quota,
    parent: a.parent === b.parent ? a.parent : a.unit === b.unit ? a.unit : a.parent,
  });
  return true;
}

export type TopicMapOptions = { part?: "TYT" | "AYT" | null; scopes?: GradeScopes };

/**
 * Konu haritası (ders-bağımsız): konu = kazanımın alt başlığı (`topic`), yoksa ünitesi. 16'dan fazla konu
 * çıkarsa önce aynı ünite, sonra aynı sınıf içindeki komşular birleştirilir; hiçbir kazanım düşmez.
 */
export function buildTopicMap(
  program: CurriculumProgram,
  examKey: CurriculumExamKey,
  scenario: CurriculumScenario | null,
  options: TopicMapOptions = {},
): CurriculumTopicMap {
  const exam = examKey === "serbest" ? null : program.exams[examKey] ?? null;
  const national = Boolean(exam?.national);
  const quotaMode = Boolean(exam && !national && scenario != null);
  const scopes = options.scopes ?? DEFAULT_GRADE_SCOPES;
  const part = program.kind === "yks" ? options.part ?? null : null;
  const quotaByCode: Record<string, number> = {};
  const seen = new Set<string>();
  const groups: Group[] = [];
  let outcomeCount = 0;
  for (const unit of program.units) {
    for (const outcome of unit.outcomes) {
      if (seen.has(outcome.code)) continue;
      const grade = outcomeGrade(outcome, program.grade);
      if (!inPartScope(grade, part, scopes)) continue;
      let quota = 0;
      if (quotaMode) {
        quota = quotaFor(outcome, examKey, scenario!, exam!.scenarios);
        if (quota <= 0) continue;
        quotaByCode[outcome.code] = quota;
      }
      seen.add(outcome.code);
      outcomeCount += 1;
      const topic = outcome.topic && !NO_TOPIC.test(outcome.topic.trim()) ? outcome.topic.trim() : null;
      const key = `${unit.title}\u0000${topic ?? ""}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.codes.push(outcome.code);
        last.quota += quota;
      } else {
        groups.push({ key, label: topic ?? unit.title, unit: unit.title, grade, codes: [outcome.code], quota });
      }
    }
  }
  // Az ünite + az konu: bir alt düzey (kazanım) açılır, aynı resmî başlık içinde dengeli toplanır.
  const unitCount = new Set(groups.map((g) => g.unit)).size;
  const distinctTopics = new Set(groups.map((g) => g.key)).size;
  const opened = unitCount < OPEN_UNIT_LIMIT && distinctTopics < TOPIC_TARGET_MIN && outcomeCount > distinctTopics;
  if (opened) {
    const textByCode = new Map<string, string>();
    for (const unit of program.units) for (const o of unit.outcomes) if (!textByCode.has(o.code)) textByCode.set(o.code, o.text);
    const parentSize = new Map<string, number>();
    const parentLabel = new Map<string, string>();
    const fine: Group[] = [];
    for (const g of groups) {
      const parent = `${g.unit}\u0000${g.label}`;
      parentLabel.set(parent, g.label);
      parentLabel.set(g.unit, g.unit);
      parentSize.set(parent, (parentSize.get(parent) ?? 0) + g.codes.length);
      for (const code of g.codes) {
        fine.push({ key: `${g.key}\u0000${code}`, label: "", unit: g.unit, grade: g.grade, codes: [code], quota: quotaByCode[code] ?? 0, parent });
      }
    }
    while (fine.length > OPEN_TOPIC_MAX && mergeOnce(fine, (a, b) => a.parent === b.parent)) {
      /* aynı resmî başlık içinde */
    }
    while (fine.length > OPEN_TOPIC_MAX && mergeOnce(fine, (a, b) => a.unit === b.unit)) {
      /* aynı ünite içinde */
    }
    for (const g of fine) {
      const parent = g.parent ?? g.unit;
      const title = parentLabel.get(parent) ?? g.unit;
      const size = parentSize.get(parent) ?? (g.unit === parent ? Infinity : 0);
      const first = (textByCode.get(g.codes[0]!) ?? g.codes[0]!).replace(/\s+/g, " ").trim().replace(/[.:;]$/, "");
      const short = first.length > 72 ? `${first.slice(0, first.lastIndexOf(" ", 71) > 20 ? first.lastIndexOf(" ", 71) : 71).trimEnd()}…` : first;
      const whole = g.codes.length >= size || (g.unit === parent && fine.filter((x) => x.unit === g.unit).length === 1);
      g.label = whole
        ? title
        : g.codes.length === 1
          ? outcomeTopicLabel({ code: g.codes[0]!, text: textByCode.get(g.codes[0]!) ?? "" })
          : `${title}${SEP}${short} (+${g.codes.length - 1} kazanım)`;
      g.key = g.label;
    }
    groups.splice(0, groups.length, ...fine);
  }
  // Aynı ad iki ayrı yerde geçerse (ör. iki ünitede "Uzay Geometri") ünite adı öne eklenir.
  const byLabel = new Map<string, number>();
  for (const g of groups) byLabel.set(g.label, (byLabel.get(g.label) ?? 0) + 1);
  for (const g of groups) if (!opened && (byLabel.get(g.label) ?? 0) > 1 && g.label !== g.unit) g.label = `${g.unit}${SEP}${g.label}`;
  // Ardışık aynı anahtarlı gruplar zaten tek; ayrık tekrarlar (aynı ünite+başlık) birleştirilir.
  for (let i = 0; i < groups.length && !opened; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (groups[j]!.key === groups[i]!.key) {
        groups[i]!.codes.push(...groups[j]!.codes);
        groups[i]!.quota += groups[j]!.quota;
        groups.splice(j, 1);
        j -= 1;
      }
    }
  }
  while (groups.length > TOPIC_TARGET_MAX && mergeOnce(groups, (a, b) => a.unit === b.unit)) {
    /* aynı ünite içinde */
  }
  while (groups.length > TOPIC_TARGET_MAX && mergeOnce(groups, (a, b) => a.grade === b.grade)) {
    /* aynı sınıf içinde */
  }
  const topics: string[] = [];
  const used = new Set<string>();
  for (const g of groups) {
    let label = clampLabel(g.label);
    for (let n = 2; used.has(label); n += 1) label = `${clampLabel(g.label).slice(0, TOPIC_LABEL_MAX - 6)} (${n})`;
    used.add(label);
    topics.push(label);
  }
  const units: TopicMapUnit[] = [];
  groups.forEach((g, index) => {
    const last = units[units.length - 1];
    if (last && last.title === g.unit) last.topicIndexes.push(index);
    else units.push({ title: g.unit, topicIndexes: [index] });
  });
  const quotaByTopic = groups.map((g) => (quotaMode ? g.quota : 0));
  const total = quotaByTopic.reduce((a, b) => a + b, 0);
  return {
    topics,
    topicCodes: groups.map((g) => g.codes),
    units,
    quotaByTopic,
    quotaByCode,
    total,
    national,
    averaged: quotaMode && scenario === "karma",
    part,
    outcomeCount,
  };
}

/**
 * Konu adı haritada hangi konu (1 Kasım 2026). Önce birebir ad; yoksa eski hazırlıkların "kod metin"
 * adlarındaki kazanım kodu (kodu içeren konu). Bulunmazsa -1.
 */
export function topicIndexForLabel(map: Pick<CurriculumTopicMap, "topics" | "topicCodes">, label: string): number {
  const text = label.replace(/\s+/g, " ").trim();
  const exact = map.topics.indexOf(text);
  if (exact >= 0) return exact;
  const code = matchCodeForLabel(text, map.topicCodes.flat());
  return code ? map.topicCodes.findIndex((codes) => codes.includes(code)) : -1;
}

/** Konunun resmî soru sayısı: yeni konu adı → konu toplamı; eski "kod metin" adı → o kazanımın kotası. */
export function quotaForLabel(map: CurriculumTopicMap, label: string): number {
  const text = label.replace(/\s+/g, " ").trim();
  const exact = map.topics.indexOf(text);
  if (exact >= 0) return map.quotaByTopic[exact] ?? 0;
  const code = matchCodeForLabel(text, Object.keys(map.quotaByCode));
  return code ? map.quotaByCode[code] ?? 0 : 0;
}

/** Yazılı seçeneği hangi senaryoları sunar (kayıtta ne varsa; ders adına göre değil). */
export function scenarioOptions(program: CurriculumProgram, examKey: CurriculumExamKey): number[] {
  if (examKey === "serbest") return [];
  const exam = program.exams[examKey];
  return exam && !exam.national ? [...exam.scenarios].sort((a, b) => a - b) : [];
}

/**
 * Sihirbazın ders/sınav adımında seçilen sınav türünden resmî program düzeyi (1 Kasım 2026).
 * TYT/AYT/YKS → "yks", LGS → "lgs", KPSS → "kpss", "10. sınıf" → "sinif-10"; tanınmazsa null.
 */
export function levelForExamLabel(label: string | null | undefined): string | null {
  const text = (label ?? "").toLocaleUpperCase("tr-TR");
  if (/\b(TYT|AYT|YKS)\b/.test(text)) return "yks";
  if (/\bLGS\b/.test(text)) return "lgs";
  if (/\bKPSS\b/.test(text)) return "kpss";
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

/**
 * Sihirbazda seçilen dersin düzeydeki programı (1 Kasım 2026): "Matematik" → o düzeyin Matematik programı.
 * Önce birebir ad, sonra içerme; bulunmazsa null (öğrenci seçer).
 */
export function programIdForSubject(
  programs: readonly { id: string; subject: string }[],
  subject: string | null | undefined,
): string | null {
  const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
  const want = norm(subject ?? "");
  if (!want) return null;
  const exact = programs.find((p) => norm(p.subject) === want);
  if (exact) return exact.id;
  return programs.find((p) => norm(p.subject).includes(want) || want.includes(norm(p.subject)))?.id ?? null;
}

/**
 * Hazırlık adı seçilen kapsamı izler (1 Kasım 2026 canlı TYT/AYT testi): "YKS Matematik (9–12)" programından
 * TYT seçilince ad "TYT Matematik (9–10. sınıf)" olur. Sınıf aralığı kapsam verisinden (examGradeScopes) gelir.
 */
export function officialPrepTitle(label: string, part: "TYT" | "AYT" | null | undefined, scopes: GradeScopes = DEFAULT_GRADE_SCOPES): string {
  if (!part) return `${label} sınav hazırlığı`;
  const [lo, hi] = scopes[part] ?? DEFAULT_GRADE_SCOPES[part];
  const range = lo === hi ? `${lo}. sınıf` : `${lo}–${hi}. sınıf`;
  const subject = label.replace(/^YKS\s+/u, "").replace(/\s*\([^()]*\)\s*$/u, "").trim() || label;
  return `${part} ${subject} (${range}) sınav hazırlığı`;
}
