/**
 * Resmî sınav kurulumu (1 Kasım 2026): ağaç tipleri ve seçim hesabı. Saf fonksiyonlar, istemcide de çalışır.
 * Ekranda gösterilen ünite / kazanım sayısı buradan çıkar ve hazırlığa giden konu listesi de buradan çıkar —
 * söz verilen = teslim edilen.
 */
import { cutAtWord, TOPIC_LABEL_MAX } from "@/lib/curriculum/topic-map";

export type SetupOutcome = { code: string; text: string };
export type SetupUnit = { id: string; programId: string; title: string; outcomes: SetupOutcome[] };
export type SetupSubject = {
  key: string;
  label: string;
  test: string;
  part: "TYT" | "AYT" | null;
  /** ÖSYM / MEB sınav yapısındaki soru sayısı (bilgi). */
  questionCount: number | null;
  units: SetupUnit[];
  sourceLabel: string;
};
export type SetupTree = { exam: "yks" | "lgs"; subjects: SetupSubject[] };

export type UnitRating = "iyi" | "orta" | "zayif";

export type SetupSelection = {
  subjectKeys: string[];
  /** Kaldırılan kazanımlar: `${unitId}|${code}`. */
  removedOutcomes: string[];
  /** Tamamen kaldırılan üniteler. */
  removedUnits: string[];
};

export type PlannedTopic = {
  /** Hazırlıktaki konu adı (benzersiz, en çok 120 karakter). */
  topic: string;
  subjectKey: string;
  programId: string;
  part: "TYT" | "AYT" | null;
  unitId: string;
  unitTitle: string;
  codes: string[];
};

export const outcomeKey = (unitId: string, code: string) => `${unitId}|${code}`;

/** Konu adı: "TYT Fizik · 9. Sınıf · Madde ve Özellikleri" (kelime sınırında 120). */
const GRADE_SEGMENT = /^\d+\.\s*Sınıf\b/u;
const ORDINAL_PREFIX = /^\d+\.\s*(?:Ünite\s*[:\-–]\s*)?/u;

/**
 * Kaynak numaralandırması ekranda gösterilmez (1 Kasım 2026): kayıt bazı programlarda üniteleri
 * "2. Hikâye" diye numaralar ve sınavda çıkmayan üniteler atlandığı için "1." yoktur.
 * Bir programın ünitelerinin çoğu sıra numarasıyla başlıyorsa numara atılır; "9. Sınıf" gibi sınıf
 * bölümü ve "15. Yüzyıl" gibi numarasız programlardaki başlıklar korunur. Kodlar veride kalır.
 */
export function displayUnitTitles(titles: readonly string[]): string[] {
  const name = (title: string) => {
    const parts = title.split(" · ");
    return parts[parts.length - 1] ?? title;
  };
  const numbered = titles.filter((t) => !GRADE_SEGMENT.test(name(t)) && ORDINAL_PREFIX.test(name(t))).length;
  if (!titles.length || numbered * 3 < titles.length * 2) return titles.slice();
  return titles.map((title) => {
    const parts = title.split(" · ");
    const last = parts.length - 1;
    if (GRADE_SEGMENT.test(parts[last]!)) return title;
    const stripped = parts[last]!.replace(ORDINAL_PREFIX, "").trim();
    if (!stripped) return title;
    parts[last] = stripped;
    return parts.join(" · ");
  });
}

export function unitTopicLabel(subjectLabel: string, unitTitle: string): string {
  const full = `${subjectLabel} · ${unitTitle}`.replace(/\s+/g, " ").trim();
  return full.length <= TOPIC_LABEL_MAX ? full : cutAtWord(full, TOPIC_LABEL_MAX) || full.slice(0, TOPIC_LABEL_MAX);
}

/** Seçimden hazırlık yolu: seçili derslerin, en az bir kazanımı kalan her ünitesi bir konu. */
export function plannedTopics(tree: SetupTree, selection: SetupSelection): PlannedTopic[] {
  const picked = new Set(selection.subjectKeys);
  const removedUnits = new Set(selection.removedUnits);
  const removed = new Set(selection.removedOutcomes);
  const used = new Set<string>();
  const out: PlannedTopic[] = [];
  for (const subject of tree.subjects) {
    if (!picked.has(subject.key)) continue;
    for (const unit of subject.units) {
      if (removedUnits.has(unit.id)) continue;
      const codes = unit.outcomes.filter((o) => !removed.has(outcomeKey(unit.id, o.code))).map((o) => o.code);
      if (!codes.length) continue;
      let topic = unitTopicLabel(subject.label, unit.title);
      for (let n = 2; used.has(topic); n += 1) topic = `${unitTopicLabel(subject.label, unit.title).slice(0, TOPIC_LABEL_MAX - 4)} (${n})`;
      used.add(topic);
      out.push({ topic, subjectKey: subject.key, programId: unit.programId, part: subject.part, unitId: unit.id, unitTitle: unit.title, codes });
    }
  }
  return out;
}

export type SelectionCounts = { subjects: number; units: number; outcomes: number };

export function selectionCounts(topics: PlannedTopic[]): SelectionCounts {
  return {
    subjects: new Set(topics.map((t) => t.subjectKey)).size,
    units: topics.length,
    outcomes: topics.reduce((n, t) => n + t.codes.length, 0),
  };
}

/** Bir dersin ağaçtaki toplamları (seçimden bağımsız). */
export function subjectTotals(subject: SetupSubject): { units: number; outcomes: number } {
  return { units: subject.units.length, outcomes: subject.units.reduce((n, u) => n + u.outcomes.length, 0) };
}

export function toggleUnit(selection: SetupSelection, unitId: string): SetupSelection {
  const has = selection.removedUnits.includes(unitId);
  return {
    ...selection,
    removedUnits: has ? selection.removedUnits.filter((id) => id !== unitId) : [...selection.removedUnits, unitId],
    // Üniteyi geri açınca içindeki kazanımlar da geri gelir.
    removedOutcomes: has ? selection.removedOutcomes.filter((k) => !k.startsWith(`${unitId}|`)) : selection.removedOutcomes,
  };
}

export function toggleOutcome(selection: SetupSelection, unitId: string, code: string): SetupSelection {
  const key = outcomeKey(unitId, code);
  const has = selection.removedOutcomes.includes(key);
  return {
    ...selection,
    removedUnits: selection.removedUnits.filter((id) => id !== unitId),
    removedOutcomes: has ? selection.removedOutcomes.filter((k) => k !== key) : [...selection.removedOutcomes, key],
  };
}
