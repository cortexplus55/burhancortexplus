/**
 * YKS alan (puan türü) → ders eşlemesi (1 Kasım 2026). İstemcide de okunur; kayıt defteri JSON'u içermez.
 *
 * Kaynak: ÖSYM, 2026-YKS Kılavuzu (https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/basvuru_kilavuz06022026.pdf,
 * sha256 67c0aba07a942365e8ee059ef1c63a91151a3b02267d463c58681dd9ce6603c1, kayıt defterinde `osym_yks_2026`).
 *  - Tablo 1B (s. 46): TYT testleri; AYT testleri Türk Dili ve Edebiyatı-Sosyal Bilimler-1 (TDE, Tarih-1, Coğrafya-1),
 *    Sosyal Bilimler-2 (Tarih-2, Coğrafya-2, Felsefe Grubu, DKAB / ilave Felsefe Grubu), Matematik, Fen Bilimleri
 *    (Fizik, Kimya, Biyoloji); YDT Yabancı Dil Testi.
 *  - Tablo 1E (s. 48): SAY = TYT 40 + AYT Matematik 30 + Fizik 10 + Kimya 10 + Biyoloji 10;
 *    EA = TYT 40 + AYT Matematik 30 + TDE 18 + Tarih-1 7 + Coğrafya-1 5;
 *    SÖZ = TYT 40 + TDE 18 + Tarih-1 7 + Coğrafya-1 5 + Tarih-2 8 + Coğrafya-2 8 + Felsefe Grubu 9 + DKAB/ilave Felsefe 5;
 *    DİL = TYT 40 + YDT 60.
 * Ders → program eşlemesi kayıt defterindeki MEB "2026 YKS'ye esas kazanımlar" programlarıdır (`meb_yks_2026`);
 * TYT kapsamı 9–10., AYT kapsamı 11–12. sınıf kazanımlarıdır (`examGradeScopes`). Hiçbir konu burada yazılmaz.
 */

export const OSYM_YKS_GUIDE_URL = "https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/basvuru_kilavuz06022026.pdf";

import { isTreeExam, TREE_EXAMS, TREE_EXAM_IDS, type TreeExam } from "@/lib/curriculum/exam-trees";

export type SetupExam = "yks" | "lgs" | TreeExam;
export const SETUP_EXAMS: SetupExam[] = ["yks", "lgs", ...TREE_EXAM_IDS];

export function isSetupExam(value: unknown): value is SetupExam {
  return value === "yks" || value === "lgs" || isTreeExam(value);
}
export type YksAlan = "tyt" | "say" | "ea" | "soz" | "dil";
export type YksPartKey = "TYT" | "AYT";

/** Kurulumdaki bir ders: bir ya da birkaç resmî program, bir oturum. */
export type SetupSubjectDef = {
  key: string;
  label: string;
  /** ÖSYM testindeki adı (kılavuz Tablo 1B). */
  test: string;
  part: YksPartKey | null;
  programIds: string[];
  /** Soru sayısı için sınav yapısı satırları (KPSS/ALES/DGS/YDS/TUS/DUS). */
  structure?: { exam: string; subjects: string[] };
};

const tyt = (key: string, label: string, test: string, programId: string): SetupSubjectDef => ({
  key: `tyt-${key}`,
  label: `TYT ${label}`,
  test,
  part: "TYT",
  programIds: [programId],
});
const ayt = (key: string, label: string, test: string, programIds: string[]): SetupSubjectDef => ({
  key: `ayt-${key}`,
  label: `AYT ${label}`,
  test,
  part: "AYT",
  programIds,
});

/** TYT testleri (Tablo 1B): Türkçe, Sosyal Bilimler, Temel Matematik, Fen Bilimleri. */
export const TYT_SUBJECTS: SetupSubjectDef[] = [
  tyt("turkce", "Türkçe", "Türkçe Testi", "yks-2026-tde"),
  tyt("matematik", "Temel Matematik", "Temel Matematik Testi", "yks-2026-matematik"),
  tyt("tarih", "Tarih", "Sosyal Bilimler Testi", "yks-2026-tarih"),
  tyt("cografya", "Coğrafya", "Sosyal Bilimler Testi", "yks-2026-cografya"),
  tyt("felsefe", "Felsefe", "Sosyal Bilimler Testi", "yks-2026-felsefe"),
  tyt("dkab", "Din Kültürü ve Ahlak Bilgisi", "Sosyal Bilimler Testi", "yks-2026-dkab"),
  tyt("fizik", "Fizik", "Fen Bilimleri Testi", "yks-2026-fizik"),
  tyt("kimya", "Kimya", "Fen Bilimleri Testi", "yks-2026-kimya"),
  tyt("biyoloji", "Biyoloji", "Fen Bilimleri Testi", "yks-2026-biyoloji"),
];

const TDE_SB1 = "Türk Dili ve Edebiyatı-Sosyal Bilimler-1 Testi";
const SB2 = "Sosyal Bilimler-2 Testi";

export const AYT_SUBJECTS: SetupSubjectDef[] = [
  ayt("matematik", "Matematik", "Matematik Testi", ["yks-2026-matematik"]),
  ayt("fizik", "Fizik", "Fen Bilimleri Testi", ["yks-2026-fizik"]),
  ayt("kimya", "Kimya", "Fen Bilimleri Testi", ["yks-2026-kimya"]),
  ayt("biyoloji", "Biyoloji", "Fen Bilimleri Testi", ["yks-2026-biyoloji"]),
  ayt("tde", "Türk Dili ve Edebiyatı", TDE_SB1, ["yks-2026-tde"]),
  /* Tarih-1 / Tarih-2 ve Coğrafya-1 / Coğrafya-2 ayrımı kılavuzda test düzeyindedir; kazanım belgesinde tek program var. */
  ayt("tarih", "Tarih", `${TDE_SB1} (Tarih-1) / ${SB2} (Tarih-2)`, ["yks-2026-tarih", "yks-2026-inkilap"]),
  ayt("cografya", "Coğrafya", `${TDE_SB1} (Coğrafya-1) / ${SB2} (Coğrafya-2)`, ["yks-2026-cografya"]),
  ayt("felsefe-grubu", "Felsefe Grubu", SB2, ["yks-2026-felsefe", "yks-2026-mantik", "yks-2026-psikoloji", "yks-2026-sosyoloji"]),
  ayt("dkab", "Din Kültürü ve Ahlak Bilgisi", SB2, ["yks-2026-dkab"]),
];

export type AlanDef = {
  id: YksAlan;
  chip: string;
  /** Tablo 1E'deki puan türü. */
  scoreType: string;
  aytKeys: string[];
  /** YDT: kazanım kaydı yok; dürüst not. */
  ydt: boolean;
};

export const YKS_ALANLAR: AlanDef[] = [
  { id: "tyt", chip: "🎯 Sadece TYT (Temel)", scoreType: "TYT", aytKeys: [], ydt: false },
  { id: "say", chip: "🔢 Sayısal (TYT + AYT MF)", scoreType: "SAY", aytKeys: ["ayt-matematik", "ayt-fizik", "ayt-kimya", "ayt-biyoloji"], ydt: false },
  { id: "ea", chip: "⚖️ Eşit Ağırlık (TYT + AYT TM)", scoreType: "EA", aytKeys: ["ayt-matematik", "ayt-tde", "ayt-tarih", "ayt-cografya"], ydt: false },
  {
    id: "soz",
    chip: "📖 Sözel (TYT + AYT TS)",
    scoreType: "SÖZ",
    aytKeys: ["ayt-tde", "ayt-tarih", "ayt-cografya", "ayt-felsefe-grubu", "ayt-dkab"],
    ydt: false,
  },
  { id: "dil", chip: "🌍 Dil (TYT + YDT)", scoreType: "DİL", aytKeys: [], ydt: true },
];

export const YDT_NOTE =
  "YDT (Yabancı Dil Testi, 80 soru) için resmî bir kazanım listesi yayımlanmıyor; bu yüzden konu ağacı yok. Dil alanında yolun şimdilik TYT konularıyla kurulur; YDT çalışmasını ayrıca planlaman gerekir.";

export const LGS_PROGRAM_IDS = [
  "lgs-2027-turkce",
  "lgs-2027-matematik",
  "lgs-2027-fen",
  "lgs-2027-inkilap",
  "lgs-2027-dkab",
  "lgs-2027-ingilizce",
] as const;

/** Bir sınavın bütün ders tanımları (sıra ekrandaki sıradır). */
export function setupSubjectDefs(exam: SetupExam): SetupSubjectDef[] {
  if (exam === "yks") return [...TYT_SUBJECTS, ...AYT_SUBJECTS];
  if (isTreeExam(exam)) {
    const def = TREE_EXAMS[exam];
    return def.subjects.map((s) => ({
      key: s.programId,
      label: "",
      test: s.test,
      part: null,
      programIds: [s.programId],
      structure: { exam: def.structureExam, subjects: s.structure },
    }));
  }
  return LGS_PROGRAM_IDS.map((id) => ({ key: id, label: "", test: "LGS", part: null, programIds: [id] }));
}

/** Alanın ders anahtarları: TYT dersleri + alanın AYT testleri (Tablo 1E). */
export function subjectKeysForAlan(alan: YksAlan): string[] {
  const def = YKS_ALANLAR.find((a) => a.id === alan);
  if (!def) return [];
  return [...TYT_SUBJECTS.map((s) => s.key), ...def.aytKeys];
}

export function isYksAlan(value: unknown): value is YksAlan {
  return typeof value === "string" && YKS_ALANLAR.some((a) => a.id === value);
}
