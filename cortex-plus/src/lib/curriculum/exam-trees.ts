/**
 * KPSS / ALES / DGS / YDS / TUS / DUS kurulum tanımları (1 Kasım 2026). İstemcide de okunur; kayıt defteri JSON'u içermez.
 *
 * ÖSYM bu sınavlar için konu listesi yayımlamaz: kılavuzlar test adını, kapsam cümlesini ve soru sayısını verir.
 * Konu ağaçları kayıt defterindeki `*-2026-tree-*` programlarıdır (data/curriculum/scripts/exam_trees.py) ve
 * her biri dürüst etiketini taşır. Soru sayıları kayıt defterindeki examStructures satırlarından (ÖSYM kılavuzu) gelir.
 */

export type TreeExam = "kpss" | "ales" | "dgs" | "yds" | "tus" | "dus";

export const MEB_TREE_LABEL = "Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir";
export const YDS_TREE_LABEL = "Soru türleri ÖSYM kılavuzundandır; alt başlıklar resmî ÖSYM listesi değildir";
export const MED_TREE_LABEL = "Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir";

export type TreeSubjectDef = {
  /** Program kimliği (aynı zamanda ders anahtarı). */
  programId: string;
  /** ÖSYM testindeki adı. */
  test: string;
  /** examStructures ders adları (soru sayısı); KPSS'de test düzeyinde olduğu için boş. */
  structure: string[];
};

export type TreeGroup = { id: string; chip: string; keys: string[] };

export type TreeExamDef = {
  id: TreeExam;
  /** Kısa ad (ÖSYM). */
  name: string;
  card: string;
  /** examStructures / takvimdeki sınav adı. */
  structureExam: string;
  label: string;
  /** Kaynak satırı (ekranda). */
  sourceNote: string;
  subjects: TreeSubjectDef[];
  groups: TreeGroup[];
};

const ids = (exam: TreeExam, suffixes: string[]) => suffixes.map((s) => `${exam}-2026-tree-${s}`);
const subj = (exam: TreeExam, suffix: string, test: string, structure: string[]): TreeSubjectDef => ({
  programId: `${exam}-2026-tree-${suffix}`,
  test,
  structure,
});

const TUS_TEMEL = ["anatomi", "histoloji", "fizyoloji", "biyokimya", "mikrobiyoloji", "patoloji", "farmakoloji"];
const TUS_KLINIK = ["dahiliye", "pediatri", "cerrahi", "kadin-dogum"];
const DUS_TEMEL = ["anatomi", "histoloji", "fizyoloji", "biyokimya", "mikrobiyoloji", "patoloji", "farmakoloji", "biyoloji-genetik"];
const DUS_KLINIK = ["restoratif", "protetik", "cerrahi", "radyoloji", "periodontoloji", "ortodonti", "endodonti", "pedodonti"];
const TUS_STRUCT: Record<string, string> = {
  anatomi: "Anatomi",
  histoloji: "Histoloji ve Embriyoloji",
  fizyoloji: "Fizyoloji",
  biyokimya: "Tıbbi Biyokimya",
  mikrobiyoloji: "Tıbbi Mikrobiyoloji",
  patoloji: "Tıbbi Patoloji",
  farmakoloji: "Tıbbi Farmakoloji",
  dahiliye: "Dâhiliye Grubu",
  pediatri: "Pediatri",
  cerrahi: "Cerrahi Grubu",
  "kadin-dogum": "Kadın Hastalıkları ve Doğum",
};
const DUS_STRUCT: Record<string, string> = {
  ...TUS_STRUCT,
  "biyoloji-genetik": "Tıbbi Biyoloji ve Genetik",
  restoratif: "Restoratif Diş Tedavisi",
  protetik: "Protetik Diş Tedavisi",
  cerrahi: "Ağız, Diş ve Çene Cerrahisi",
  radyoloji: "Ağız, Diş ve Çene Radyolojisi",
  periodontoloji: "Periodontoloji",
  ortodonti: "Ortodonti",
  endodonti: "Endodonti",
  pedodonti: "Çocuk Diş Hekimliği",
};

const sayisalSozel = (exam: "ales" | "dgs"): TreeGroup[] => [
  { id: "say", chip: "🔢 Sayısal", keys: ids(exam, ["sayisal"]) },
  { id: "soz", chip: "📖 Sözel", keys: ids(exam, ["sozel"]) },
  { id: "hepsi", chip: "⚖️ Sayısal + Sözel", keys: ids(exam, ["sayisal", "sozel"]) },
];

export const TREE_EXAMS: Record<TreeExam, TreeExamDef> = {
  kpss: {
    id: "kpss",
    name: "KPSS",
    card: "ÖSYM Kamu Personel Seçme Sınavı (Genel Yetenek · Genel Kültür)",
    structureExam: "KPSS",
    label: MEB_TREE_LABEL,
    sourceNote: "Testler: ÖSYM 2026 KPSS Lisans Kılavuzu, Tablo-1. Alt başlıklar: MEB 2026 YKS'ye esas kazanımlar.",
    subjects: [
      subj("kpss", "turkce", "Genel Yetenek", []),
      subj("kpss", "matematik", "Genel Yetenek", []),
      subj("kpss", "tarih", "Genel Kültür", []),
      subj("kpss", "cografya", "Genel Kültür", []),
      subj("kpss", "vatandaslik", "Genel Kültür", []),
      subj("kpss", "guncel", "Genel Kültür", []),
    ],
    groups: [
      { id: "gy", chip: "🧠 Genel Yetenek (Türkçe · Matematik)", keys: ids("kpss", ["turkce", "matematik"]) },
      { id: "gk", chip: "🌍 Genel Kültür (Tarih · Coğrafya · Vatandaşlık · Güncel)", keys: ids("kpss", ["tarih", "cografya", "vatandaslik", "guncel"]) },
      { id: "gygk", chip: "🎯 GY + GK", keys: ids("kpss", ["turkce", "matematik", "tarih", "cografya", "vatandaslik", "guncel"]) },
    ],
  },
  ales: {
    id: "ales",
    name: "ALES",
    card: "ÖSYM Akademik Personel ve Lisansüstü Eğitimi Giriş Sınavı",
    structureExam: "ALES",
    label: MEB_TREE_LABEL,
    sourceNote: "Testler: ÖSYM 2026 ALES Kılavuzu (sayısal ve sözel akıl yürütme, 50 + 50 soru). Alt başlıklar: MEB ortaöğretim müfredatı.",
    subjects: [subj("ales", "sayisal", "Sayısal", ["Sayısal"]), subj("ales", "sozel", "Sözel", ["Sözel"])],
    groups: sayisalSozel("ales"),
  },
  dgs: {
    id: "dgs",
    name: "DGS",
    card: "ÖSYM Dikey Geçiş Sınavı",
    structureExam: "DGS",
    label: MEB_TREE_LABEL,
    sourceNote: "Testler: ÖSYM 2026 DGS Kılavuzu (sayısal ve sözel akıl yürütme, 50 + 50 soru). Alt başlıklar: MEB ortaöğretim müfredatı.",
    subjects: [subj("dgs", "sayisal", "Sayısal", ["Sayısal"]), subj("dgs", "sozel", "Sözel", ["Sözel"])],
    groups: sayisalSozel("dgs"),
  },
  yds: {
    id: "yds",
    name: "YDS",
    card: "ÖSYM Yabancı Dil Bilgisi Seviye Tespit Sınavı",
    structureExam: "YDS",
    label: YDS_TREE_LABEL,
    sourceNote: "Soru türleri: ÖSYM 2026 YDS Kılavuzu (sözcük bilgisi, dil bilgisi, çeviri ve okuduğunu anlama; 80 soru).",
    subjects: [subj("yds", "yabanci-dil", "Yabancı Dil", ["Yabancı Dil"])],
    groups: [],
  },
  tus: {
    id: "tus",
    name: "TUS",
    card: "ÖSYM Tıpta Uzmanlık Eğitimi Giriş Sınavı",
    structureExam: "TUS",
    label: MED_TREE_LABEL,
    sourceNote: "Testler ve soru sayıları: ÖSYM 2026 TUS Kılavuzu. Alt başlıklar: YÖK Mezuniyet Öncesi Tıp Eğitimi UÇEP 2020.",
    subjects: [
      ...TUS_TEMEL.map((s) => subj("tus", s, "Temel Tıp Bilimleri Testi", [TUS_STRUCT[s]!])),
      ...TUS_KLINIK.map((s) => subj("tus", s, "Klinik Tıp Bilimleri Testi", [TUS_STRUCT[s]!])),
    ],
    groups: [
      { id: "temel", chip: "🧬 Temel Tıp Bilimleri", keys: ids("tus", TUS_TEMEL) },
      { id: "klinik", chip: "🩺 Klinik Tıp Bilimleri", keys: ids("tus", TUS_KLINIK) },
      { id: "hepsi", chip: "🎯 Temel + Klinik", keys: ids("tus", [...TUS_TEMEL, ...TUS_KLINIK]) },
    ],
  },
  dus: {
    id: "dus",
    name: "DUS",
    card: "ÖSYM Diş Hekimliği Uzmanlık Eğitimi Giriş Sınavı",
    structureExam: "DUS",
    label: MED_TREE_LABEL,
    sourceNote: "Testler ve soru sayıları: ÖSYM 2026 DUS Kılavuzu. Alt başlıklar: YÖK DUÇEP-2024 ve UÇEP 2020.",
    subjects: [
      ...DUS_TEMEL.map((s) => subj("dus", s, "Temel Bilimler Testi", [DUS_STRUCT[s]!])),
      ...DUS_KLINIK.map((s) => subj("dus", s, "Klinik Bilimler Testi", [DUS_STRUCT[s]!])),
    ],
    groups: [
      { id: "temel", chip: "🧬 Temel Bilimler", keys: ids("dus", DUS_TEMEL) },
      { id: "klinik", chip: "🦷 Klinik Bilimler", keys: ids("dus", DUS_KLINIK) },
      { id: "hepsi", chip: "🎯 Temel + Klinik", keys: ids("dus", [...DUS_TEMEL, ...DUS_KLINIK]) },
    ],
  },
};

export const TREE_EXAM_IDS = Object.keys(TREE_EXAMS) as TreeExam[];

export function isTreeExam(value: unknown): value is TreeExam {
  return typeof value === "string" && (TREE_EXAM_IDS as string[]).includes(value);
}
