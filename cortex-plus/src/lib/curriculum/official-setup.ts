import "server-only";
import { CURRICULUM, getProgram, GRADE_SCOPES } from "@/lib/curriculum/registry";
import { inPartScope, outcomeGrade, cutAtWord } from "@/lib/curriculum/topic-map";
import { setupSubjectDefs, type SetupExam } from "@/lib/curriculum/yks-alan";
import { displayUnitTitles } from "@/lib/curriculum/unit-title";
import { type SetupSubject, type SetupTree, type SetupUnit } from "@/lib/curriculum/official-setup-select";

/** Ders anahtarı → sınav yapısındaki (examStructures) ders adları; soru sayısı bunların toplamı. */
const STRUCTURE_SUBJECTS: Record<string, string[]> = {
  "tyt-turkce": ["Türkçe"],
  "tyt-matematik": ["Temel Matematik"],
  "tyt-tarih": ["Tarih"],
  "tyt-cografya": ["Coğrafya"],
  "tyt-felsefe": ["Felsefe"],
  "tyt-dkab": ["Din Kültürü ve Ahlak Bilgisi (veya ilave Felsefe)"],
  "tyt-fizik": ["Fizik"],
  "tyt-kimya": ["Kimya"],
  "tyt-biyoloji": ["Biyoloji"],
  "ayt-matematik": ["Matematik"],
  "ayt-fizik": ["Fizik"],
  "ayt-kimya": ["Kimya"],
  "ayt-biyoloji": ["Biyoloji"],
  "ayt-tde": ["Türk Dili ve Edebiyatı"],
  "ayt-tarih": ["Tarih-1", "Tarih-2"],
  "ayt-cografya": ["Coğrafya-1", "Coğrafya-2"],
  "ayt-felsefe-grubu": ["Felsefe Grubu"],
  "ayt-dkab": ["Din Kültürü ve Ahlak Bilgisi"],
  "lgs-2027-turkce": ["Türkçe"],
  "lgs-2027-matematik": ["Matematik"],
  "lgs-2027-fen": ["Fen Bilimleri"],
  "lgs-2027-inkilap": ["T.C. İnkılap Tarihi ve Atatürkçülük"],
  "lgs-2027-dkab": ["Din Kültürü ve Ahlak Bilgisi"],
  "lgs-2027-ingilizce": ["Yabancı Dil"],
};

const OUTCOME_TEXT_MAX = 220;

function questionCount(key: string, exam: string): number | null {
  const names = STRUCTURE_SUBJECTS[key];
  if (!names) return null;
  const rows = CURRICULUM.examStructures.filter((r) => r.exam === exam && names.includes(r.subject));
  return rows.length ? rows.reduce((n, r) => n + r.count, 0) : null;
}

/** Kurulum ağacı: ders → ünite → kazanım, yalnız kayıt defterinden (model yok, uydurma konu yok). */
export function buildSetupTree(exam: SetupExam): SetupTree {
  const subjects: SetupSubject[] = [];
  for (const def of setupSubjectDefs(exam)) {
    const units: SetupUnit[] = [];
    const sources = new Set<string>();
    let label = def.label;
    for (const programId of def.programIds) {
      const program = getProgram(programId);
      if (!program) continue;
      if (!label) label = program.subject;
      program.sourceIds.forEach((id) => sources.add(CURRICULUM.sources[id]?.publisher ?? id));
      const start = units.length;
      program.units.forEach((unit, index) => {
        const outcomes = unit.outcomes
          .filter((o) => inPartScope(outcomeGrade(o, program.grade), def.part, GRADE_SCOPES))
          .map((o) => ({ code: o.code, text: cutAtWord(o.text, OUTCOME_TEXT_MAX) || o.text.slice(0, OUTCOME_TEXT_MAX) }));
        if (!outcomes.length) return;
        units.push({ id: `${programId}#${index}`, programId, title: unit.title, outcomes });
      });
      const shown = displayUnitTitles(units.slice(start).map((u) => u.title));
      shown.forEach((title, i) => {
        units[start + i]!.title = title;
      });
    }
    if (!units.length) continue;
    subjects.push({
      key: def.key,
      label,
      test: def.test,
      part: def.part,
      questionCount: questionCount(def.key, def.part ?? "LGS"),
      units,
      sourceLabel: [...sources].join(" · "),
    });
  }
  return { exam, subjects };
}

/** İstemciden gelen konu planını kayıtla doğrular: kazanım kodu ünitede yoksa düşer, boş ünite düşer. */
export function verifyPlannedUnits<T extends { unitId: string; codes: string[] }>(items: T[]): T[] {
  return items
    .map((item) => {
      const [programId, rawIndex] = item.unitId.split("#");
      const unit = getProgram(programId ?? "")?.units[Number(rawIndex)];
      if (!unit) return null;
      const known = new Set(unit.outcomes.map((o) => o.code));
      const codes = item.codes.filter((c) => known.has(c));
      return codes.length ? { ...item, codes } : null;
    })
    .filter((x): x is T => x !== null);
}

/** Ünite konusu için resmî kazanımlar (ünite düzeyi; kaldırılan kazanımlar hariç). */
export function outcomesForPlannedUnit(unitId: string, codes: string[]) {
  const [programId, rawIndex] = unitId.split("#");
  const program = getProgram(programId ?? "");
  const unit = program?.units[Number(rawIndex)];
  if (!program || !unit) return null;
  const pick = new Set(codes);
  return { program, unit, outcomes: unit.outcomes.filter((o) => pick.has(o.code)) };
}

/**
 * Konu adı kayıttaki ünite başlığıyla yazılır (numarasız). Eski istemci numaralı başlık gönderdiyse
 * kayıttaki ham başlık gösterilen başlıkla değiştirilir; kod/ünite kimliği aynı kalır.
 */
export function officialUnitTopic(unitId: string, topic: string): string {
  const [programId, rawIndex] = unitId.split("#");
  const program = getProgram(programId ?? "");
  const index = Number(rawIndex);
  const raw = program?.units[index]?.title;
  if (!program || !raw) return topic;
  const shown = displayUnitTitles(program.units.map((u) => u.title))[index] ?? raw;
  return shown !== raw && topic.includes(raw) ? topic.replace(raw, shown) : topic;
}
