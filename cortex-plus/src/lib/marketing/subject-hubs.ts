import "server-only";
import type { Icon3DName } from "@/components/ui/icon-3d";
import { FREE_PHOTO_PER_MONTH } from "@/lib/billing/free-meters";
import { CURRICULUM, getProgram } from "@/lib/curriculum/registry";
import { REVIEW_LADDER_DAYS } from "@/lib/learning/review-items";
import { guidePath, SUBJECT_HUB_LINKS, type GuideSlug, type SubjectHubId } from "@/lib/marketing/content-hub-links";
import type { FaqItem } from "@/lib/marketing/landing-content";
import { REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";

/*
  Ders açılış sayfaları (27 Kasım 2026, SEO ve GEO; ürün sahibinin isteği): `/ders/matematik`, `/ders/kimya`, `/ders/fizik`,
  `/ders/biyoloji`, `/ders/turkce`, `/ders/tarih`, `/ders/cografya`, `/ders/ingilizce`.

  Kurallar (bekçi `ders-rehber-sayfalari.test.tsx`):
  - Tanım iki cümle ve üst menü dahil ilk 100 görünür kelimede: ders notundan kişisel çalışma programı, adım adım çözüm,
    yazılı ve canlı sesli öğretmen.
  - Sınavlara göre kapsam kayıt defterinden: soru sayıları `examStructures` satırlarından (MEB ve ÖSYM 2026 kılavuzları),
    ünite sayıları programlardan. KPSS'nin ders ders dağılımı ÖSYM tarafından yayımlanmaz; sayı yazılmaz. YDT ürünümüzde
    yok; yazılmaz.
  - Her ders için beş "cevap önce" soru (en çok üç cümle). Ürün sözleri koddan: canlı ses erişimi
    (`REFUSAL_MESSAGE.plus_required`), ücretsiz fotoğraf hakkı (`FREE_PHOTO_PER_MONTH`), tekrar günleri
    (`REVIEW_LADDER_DAYS`). Sabit fiyat, rakip adı, uydurma istatistik yok.
*/

/** "Sınav Haftası, Plus ve Sigma": canlı ses ucunun ret metniyle aynı (bekçi tutar). */
export const LIVE_VOICE_PLANS = "Sınav Haftası, Plus ve Sigma";
export const LIVE_VOICE_ACCESS = REFUSAL_MESSAGE.plus_required;

const REVIEW_DAYS = (() => {
  const days = REVIEW_LADDER_DAYS.map(String);
  return `${days.slice(0, -1).join(", ")} ve ${days[days.length - 1]}`;
})();

export type ScopeExam = "LGS" | "TYT" | "AYT" | "KPSS" | "YDS" | "Okul yazılıları" | "Üniversite";

export type SubjectScopeRow = {
  exam: ScopeExam;
  /** `examStructures` eşleşmesi: soru sayısı bu satırların toplamı. Yoksa sayı yazılmaz. */
  structure?: { exam: string; subjects: readonly string[] };
  note: string;
  programIds: readonly string[];
  link?: { href: string; label: string };
};

export type SubjectHub = {
  id: SubjectHubId;
  path: string;
  name: string;
  /** Cümle içindeki küçük harfli adı ("matematik", "Türkçe"). */
  lower: string;
  /** "Matematikte", "Kimyada". */
  locative: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  definition: readonly [string, string];
  scope: readonly SubjectScopeRow[];
  features: ReadonlyArray<{ icon: Icon3DName; title: string; body: string; chip?: string }>;
  faq: readonly FaqItem[];
  guides: readonly GuideSlug[];
  llmsNote: string;
};

/** `examStructures` toplamı (soru sayısı); satır yoksa null. */
export function structureCount(exam: string, subjects: readonly string[]): number | null {
  const rows = CURRICULUM.examStructures.filter((row) => row.exam === exam && subjects.includes(row.subject));
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/** Satırın soru sayısı (yapı yoksa null). */
export function scopeCount(row: SubjectScopeRow): number | null {
  return row.structure ? structureCount(row.structure.exam, row.structure.subjects) : null;
}

const n = (exam: string, ...subjects: string[]) => {
  const count = structureCount(exam, subjects);
  if (count == null) throw new Error(`Sınav yapısında yok: ${exam} ${subjects.join(", ")}`);
  return count;
};

const range = (prefix: string, grades: readonly number[], subject: string) => grades.map((grade) => `${prefix}-${grade}-${subject}`);

const LGS_LINK = { href: "/lgs-hazirlik", label: "LGS hazırlık" };
const YKS_LINK = { href: "/yks-hazirlik", label: "YKS hazırlık" };
const KPSS_LINK = { href: "/kpss-hazirlik", label: "KPSS hazırlık" };
const UNI_ROW: SubjectScopeRow = {
  exam: "Üniversite",
  note: "Vize ve final için kendi ders notundan ya da slaytlarından; ders adını yazarak da kurulur.",
  programIds: [],
  link: { href: guidePath("vize-haftasi-slayt-ozetleme-taktikleri"), label: "Vize haftası rehberi" },
};
const SOURCE_SENTENCE = "Sayılar MEB ve ÖSYM'nin 2026 kılavuzlarından.";
const KPSS_NO_SPLIT = "ÖSYM ders ders soru sayısı yayımlamaz";

function featureList(lower: string): SubjectHub["features"] {
  return [
    {
      icon: "ders",
      title: "Notundan kişisel program",
      body: `${capitalize(lower)} notunu (PDF, slayt, Word ya da defter fotoğrafı) yüklersin; konular çıkarılır ve sınav tarihine göre ders, konu testi ve kartlarla gün gün sıralanır.`,
    },
    {
      icon: "denklem",
      title: "Adım adım soru çözümü",
      body: `Takıldığın ${lower} sorusunun fotoğrafını çekersin ya da yazarsın; adım adım çözüm gelir, şıklı soruda her şıkkın açıklaması da. Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü var.`,
    },
    {
      icon: "bos-sohbet",
      title: "Yazılı ve canlı sesli öğretmen",
      body: `Yazılı öğretmen takıldığın yeri adım adım anlatır ve cevabı notuna dayandırır. ${LIVE_VOICE_ACCESS}`,
      chip: "Canlı ses Plus'ta",
    },
    {
      icon: "kartlar",
      title: "Kartlar ve günü gelen tekrar",
      body: `Konu testinde yanlış yaptığın sorunun altından ikiz soruyu açarsın; yanlışların ${REVIEW_DAYS} gün sonra yeniden sorulur.`,
    },
  ];
}

function capitalize(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase("tr")}${text.slice(1)}`;
}

function definition(name: string, focus: string): readonly [string, string] {
  return [
    `${name} için Cortex Plus, kendi ders notundan ya da MEB ve ÖSYM kazanımlarından ${focus} ve sınav tarihine göre kişisel bir çalışma programı hazırlayan yapay zekâ öğretmenidir.`,
    `Takıldığın soruyu yazılı öğretmene sorar ya da fotoğrafını çekip adım adım çözüm alırsın; canlı sesli öğretmen ${LIVE_VOICE_PLANS}'da açık.`,
  ];
}

function sharedFaq(hub: { name: string; lower: string; locative: string; notesFrom: string }): {
  solve: FaqItem;
  notes: FaqItem;
  mistakes: FaqItem;
} {
  return {
    solve: {
      q: `${hub.locative} takıldığım soruyu nasıl çözdürürüm?`,
      a: `Sorunun fotoğrafını çekersin ya da yazarsın; adım adım çözüm gelir ve şıklı soruda her şıkkın neden doğru ya da yanlış olduğu açıklanır. Kendi çözümünü fotoğrafla gönderirsen ilk hatalı satırın gösterilir. Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü var.`,
    },
    notes: {
      q: `Kendi ${hub.lower} notumdan çalışma programı çıkarabilir miyim?`,
      a: `Evet; PDF, slayt, Word ya da defter fotoğrafını yüklersin, konular çıkarılır ve sınav tarihine göre gün gün bir yol kurulur. Her konu ders, konu testi ve kartlarla ilerler; bir günü kaçırırsan kalan günlere yeniden dağıtılır. Notun yoksa ${hub.notesFrom} başlarsın.`,
    },
    mistakes: {
      q: `Yanlış yaptığım ${hub.lower} sorularını nasıl tekrar ederim?`,
      a: `Konu testinde yanlış yaptığın sorunun altından ikiz soruyu açarsın: aynı kavram, sayıları ya da öncülleri değişmiş tek soru. Yanlışların yanlışlar defterine yazılır ve ${REVIEW_DAYS} gün sonra yeniden sorulur.`,
    },
  };
}

/** "9. Sınıf · Atom ve Periyodik Sistem" → { grade: 9, title: "Atom ve Periyodik Sistem" }. */
export function unitGrade(title: string): { grade: number | null; title: string } {
  const match = /^(\d{1,2})\. Sınıf · (.+)$/.exec(title);
  return match ? { grade: Number(match[1]), title: match[2]! } : { grade: null, title };
}

/** Bir YKS programının verilen sınıflardaki ünite adları (kayıt defteri sırasıyla). */
export function programUnitsForGrades(programId: string, grades: readonly number[]): string[] {
  const program = getProgram(programId);
  if (!program) return [];
  return program.units.flatMap((unit) => {
    const parsed = unitGrade(unit.title);
    return parsed.grade != null && grades.includes(parsed.grade) ? [parsed.title] : [];
  });
}

export const AYT_GRADES = (CURRICULUM.examGradeScopes as Record<string, number[]>).AYT ?? [11, 12];
export const TYT_GRADES = (CURRICULUM.examGradeScopes as Record<string, number[]>).TYT ?? [9, 10];
const gradeWords = (grades: readonly number[]) => `${grades.join(". ve ")}. sınıf`;

function scienceHub(input: {
  id: SubjectHubId;
  name: string;
  lower: string;
  locative: string;
  examSubject: string;
  program: string;
  focus: string;
  studyQuestion: FaqItem;
  guides: readonly GuideSlug[];
  llmsNote: string;
}): SubjectHub {
  const tyt = n("TYT", input.examSubject);
  const ayt = n("AYT", input.examSubject);
  const lgsFen = n("LGS", "Fen Bilimleri");
  const shared = sharedFaq({ ...input, notesFrom: "MEB'in LGS ve YKS kazanımlarından" });
  return {
    id: input.id,
    path: `/ders/${input.id}`,
    name: input.name,
    lower: input.lower,
    locative: input.locative,
    metaTitle: `${input.name} çalışma programı ve soru çözümü`,
    metaDescription: `${input.name} için ders notundan kişisel çalışma programı, adım adım soru çözümü, yazılı ve canlı sesli öğretmen; LGS, TYT ve AYT kapsamı resmî kazanımlarla.`,
    eyebrow: "Ders · LGS · TYT · AYT · Üniversite",
    h1: `${input.name}: kendi notundan kişisel çalışma programı`,
    definition: definition(input.name, input.focus),
    scope: [
      {
        exam: "LGS",
        note: `${capitalize(input.lower)} konuları ${lgsFen} soruluk Fen Bilimleri testinin içinde; 8. sınıf kazanımları (MEB).`,
        programIds: ["lgs-2027-fen"],
        link: LGS_LINK,
      },
      {
        exam: "TYT",
        structure: { exam: "TYT", subjects: [input.examSubject] },
        note: `Ağırlıkla ${gradeWords(TYT_GRADES)} kazanımları.`,
        programIds: [input.program],
        link: YKS_LINK,
      },
      {
        exam: "AYT",
        structure: { exam: "AYT", subjects: [input.examSubject] },
        note: `Ağırlıkla ${gradeWords(AYT_GRADES)} kazanımları.`,
        programIds: [input.program],
        link: YKS_LINK,
      },
      {
        exam: "Okul yazılıları",
        note: "Lise yazılıları için sınıf sınıf MEB kazanımları.",
        programIds: range("meb", [9, 10, 11, 12], input.id),
      },
      UNI_ROW,
    ],
    features: featureList(input.lower),
    faq: [
      {
        q: `${input.name} sınavlarda kaç soruyla geliyor?`,
        a: `TYT'de ${tyt}, AYT Fen Bilimleri testinde ${ayt} ${input.lower} sorusu var. LGS'de ${input.lower} konuları ${lgsFen} soruluk Fen Bilimleri testinin içindedir. ${SOURCE_SENTENCE}`,
      },
      shared.solve,
      input.studyQuestion,
      shared.notes,
      shared.mistakes,
    ],
    guides: input.guides,
    llmsNote: input.llmsNote,
  };
}

function buildHubs(): Record<SubjectHubId, SubjectHub> {
  const ayKimya = programUnitsForGrades("yks-2026-kimya", AYT_GRADES);

  const matematikShared = sharedFaq({
    name: "Matematik",
    lower: "matematik",
    locative: "Matematikte",
    notesFrom: "MEB'in LGS ve YKS kazanımlarından ya da KPSS konu ağacından",
  });
  const matematik: SubjectHub = {
    id: "matematik",
    path: "/ders/matematik",
    name: "Matematik",
    lower: "matematik",
    locative: "Matematikte",
    metaTitle: "Matematik çalışma programı ve soru çözümü",
    metaDescription:
      "Matematik için ders notundan kişisel çalışma programı, adım adım soru çözümü, yazılı ve canlı sesli öğretmen; LGS, TYT, AYT ve KPSS kapsamı resmî kazanımlarla.",
    eyebrow: "Ders · LGS · TYT · AYT · KPSS",
    h1: "Matematik: kendi notundan kişisel çalışma programı",
    definition: definition("Matematik", "formül kartlı konu anlatımı, adım adım çözümlü sorular"),
    scope: [
      {
        exam: "LGS",
        structure: { exam: "LGS", subjects: ["Matematik"] },
        note: "8. sınıf kazanımları (MEB), Sayısal Bölüm.",
        programIds: ["lgs-2027-matematik"],
        link: LGS_LINK,
      },
      {
        exam: "TYT",
        structure: { exam: "TYT", subjects: ["Temel Matematik"] },
        note: `Temel Matematik; ağırlıkla ${gradeWords(TYT_GRADES)} kazanımları.`,
        programIds: ["yks-2026-matematik"],
        link: YKS_LINK,
      },
      {
        exam: "AYT",
        structure: { exam: "AYT", subjects: ["Matematik"] },
        note: `Ağırlıkla ${gradeWords(AYT_GRADES)} kazanımları.`,
        programIds: ["yks-2026-matematik"],
        link: YKS_LINK,
      },
      {
        exam: "KPSS",
        note: `Genel Yetenek testinin içinde; ${KPSS_NO_SPLIT}. Konu ağacı resmî ÖSYM listesi değildir.`,
        programIds: ["kpss-2026-deep-matematik"],
        link: KPSS_LINK,
      },
      {
        exam: "Okul yazılıları",
        note: "Ortaokul ve lise yazılıları için sınıf sınıf MEB kazanımları.",
        programIds: range("meb", [5, 6, 7, 8, 9, 10, 11, 12], "matematik"),
      },
      UNI_ROW,
    ],
    features: featureList("matematik"),
    faq: [
      {
        q: "Matematik sınavlarda kaç soruyla geliyor?",
        a: `LGS'de ${n("LGS", "Matematik")}, TYT'de ${n("TYT", "Temel Matematik")} (Temel Matematik), AYT'de ${n("AYT", "Matematik")} matematik sorusu var. KPSS'de matematik Genel Yetenek testinin içindedir; ${KPSS_NO_SPLIT}. ${SOURCE_SENTENCE}`,
      },
      matematikShared.solve,
      {
        q: "Matematik formüllerini nasıl akılda tutarım?",
        a: `Formülü ezberlemek yerine bir soruda kullanarak hatırla: derslerde formüller ayrı bir formül kartında gösterilir ve her ekran bir soruyla biter. Kartlarla tekrar ve günü gelen tekrar aynı bilgiyi ${REVIEW_DAYS} gün aralıklarla yeniden sorar. Sınavdan önceki sabah Plus'taki sınav sabahı kâğıdı formül özetini tek sayfada toplar.`,
      },
      matematikShared.notes,
      matematikShared.mistakes,
    ],
    guides: ["tyt-matematik-netleri-nasil-artar", "ders-notundan-calisma-programi-nasil-yapilir", "gece-ders-calisirken-takilan-soru-cozumu"],
    llmsNote: "LGS, TYT, AYT ve KPSS matematiği; formül kartlı ders, adım adım çözüm, yazılı ve canlı sesli öğretmen.",
  };

  const kimya = scienceHub({
    id: "kimya",
    name: "Kimya",
    lower: "kimya",
    locative: "Kimyada",
    examSubject: "Kimya",
    program: "yks-2026-kimya",
    focus: "formül kartlı konu anlatımı, adım adım çözümlü hesap soruları",
    studyQuestion: {
      q: "AYT kimyada hangi konular var?",
      a: `AYT kimya soruları ağırlıkla ${gradeWords(AYT_GRADES)} konularından gelir: ${ayKimya.slice(0, 4).join(", ")} ve ${ayKimya.length - 4} ünite daha. Bütün liste ve önerilen çalışma sırası AYT kimya rehberinde. ${gradeWords(TYT_GRADES).replace(/^./, (c) => c.toLocaleUpperCase("tr"))} konuları bu ünitelerin temelidir.`,
      link: { label: "AYT kimya rehberini oku", href: guidePath("ayt-kimya-calisma-sirasi-ve-konulari") },
    },
    guides: ["ayt-kimya-calisma-sirasi-ve-konulari", "ders-notundan-calisma-programi-nasil-yapilir", "gece-ders-calisirken-takilan-soru-cozumu"],
    llmsNote: "LGS Fen, TYT ve AYT kimyası; formül kartlı ders, adım adım hesap çözümü, kartlar ve tekrar.",
  });

  const fizik = scienceHub({
    id: "fizik",
    name: "Fizik",
    lower: "fizik",
    locative: "Fizikte",
    examSubject: "Fizik",
    program: "yks-2026-fizik",
    focus: "formül kartlı konu anlatımı, adım adım çözümlü problemler",
    studyQuestion: {
      q: "Fizik problemlerinde nereden başlamalıyım?",
      a: "Önce verilenleri ve isteneni birimleriyle yaz, sonra ilgili bağıntıyı seç ve sayıları en sonda yerleştir. Cortex Plus'ın çözümleri de adım adım gelir; fotoğrafla gönderdiğin kendi çözümünde ilk hatalı satırı gösterir.",
    },
    guides: ["gece-ders-calisirken-takilan-soru-cozumu", "ders-notundan-calisma-programi-nasil-yapilir", "vize-haftasi-slayt-ozetleme-taktikleri"],
    llmsNote: "LGS Fen, TYT ve AYT fiziği; formül kartlı ders, adım adım problem çözümü, el yazısı çözüm kontrolü.",
  });

  const biyoloji = scienceHub({
    id: "biyoloji",
    name: "Biyoloji",
    lower: "biyoloji",
    locative: "Biyolojide",
    examSubject: "Biyoloji",
    program: "yks-2026-biyoloji",
    focus: "şemalı konu anlatımı, kavram kartları",
    studyQuestion: {
      q: "Biyoloji terimlerini nasıl kalıcı öğrenirim?",
      a: "Terimi tanımıyla okumak yerine bir soruyla hatırlamaya çalış: kart önce soruyu gösterir, sen düşündükten sonra çevirirsin. Cortex Plus'ta kartlar aynı bilgiyi iki kez sormaz ve zorlandığın kart önce gelir. Derslerde gerektiğinde ezber kodu kutusu da çıkar.",
    },
    guides: ["ders-notundan-calisma-programi-nasil-yapilir", "vize-haftasi-slayt-ozetleme-taktikleri", "gece-ders-calisirken-takilan-soru-cozumu"],
    llmsNote: "LGS Fen, TYT ve AYT biyolojisi; şemalı ders, kavram kartları, aralıklı tekrar.",
  });

  const turkceShared = sharedFaq({
    name: "Türkçe",
    lower: "Türkçe",
    locative: "Türkçede",
    notesFrom: "MEB'in LGS ve YKS kazanımlarından ya da KPSS konu ağacından",
  });
  const turkce: SubjectHub = {
    id: "turkce",
    path: "/ders/turkce",
    name: "Türkçe",
    lower: "Türkçe",
    locative: "Türkçede",
    metaTitle: "Türkçe çalışma programı ve soru çözümü",
    metaDescription:
      "Türkçe için ders notundan kişisel çalışma programı, açıklamalı testler, yazılı ve canlı sesli öğretmen; LGS, TYT, AYT Türk Dili ve Edebiyatı ve KPSS kapsamı.",
    eyebrow: "Ders · LGS · TYT · AYT · KPSS",
    h1: "Türkçe: kendi notundan kişisel çalışma programı",
    definition: definition("Türkçe", "konu anlatımı, her şıkkı açıklanan testler"),
    scope: [
      {
        exam: "LGS",
        structure: { exam: "LGS", subjects: ["Türkçe"] },
        note: "8. sınıf kazanımları (MEB), Sözel Bölüm.",
        programIds: ["lgs-2027-turkce"],
        link: LGS_LINK,
      },
      {
        exam: "TYT",
        structure: { exam: "TYT", subjects: ["Türkçe"] },
        note: "Türk Dili ve Edebiyatı kazanımları (9–12, MEB).",
        programIds: ["yks-2026-tde"],
        link: YKS_LINK,
      },
      {
        exam: "AYT",
        structure: { exam: "AYT", subjects: ["Türk Dili ve Edebiyatı"] },
        note: "Türk Dili ve Edebiyatı testi.",
        programIds: ["yks-2026-tde"],
        link: YKS_LINK,
      },
      {
        exam: "KPSS",
        note: `Genel Yetenek testinin içinde; ${KPSS_NO_SPLIT}. Konu ağacı resmî ÖSYM listesi değildir.`,
        programIds: ["kpss-2026-deep-turkce"],
        link: KPSS_LINK,
      },
      {
        exam: "Okul yazılıları",
        note: "Ortaokul Türkçe ve lise Türk Dili ve Edebiyatı için sınıf sınıf MEB kazanımları.",
        programIds: [...range("meb", [5, 6, 7, 8], "turkce"), ...range("meb", [9, 10, 11, 12], "tde")],
      },
      UNI_ROW,
    ],
    features: featureList("Türkçe"),
    faq: [
      {
        q: "Türkçe sınavlarda kaç soruyla geliyor?",
        a: `LGS'de ${n("LGS", "Türkçe")}, TYT'de ${n("TYT", "Türkçe")} Türkçe sorusu var; AYT'de Türk Dili ve Edebiyatı testinde ${n("AYT", "Türk Dili ve Edebiyatı")} soru sorulur. KPSS'de Türkçe Genel Yetenek testinin içindedir; ${KPSS_NO_SPLIT}. ${SOURCE_SENTENCE}`,
      },
      turkceShared.solve,
      {
        q: "Paragraf sorularında nasıl hızlanırım?",
        a: "Önce soru kökünü oku, sonra paragrafta yalnız kökün sorduğu bilgiyi ara; ana düşünce sorusunda paragrafın tamamını kapsayan şıkkı seç. Cortex Plus'ın konu testinde her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı açıklanır; hangi tuzağa düştüğünü bu açıklamalardan görürsün.",
      },
      turkceShared.notes,
      turkceShared.mistakes,
    ],
    guides: ["ders-notundan-calisma-programi-nasil-yapilir", "gece-ders-calisirken-takilan-soru-cozumu", "sinav-hazirlik-uygulamasi-nasil-secilir"],
    llmsNote: "LGS ve TYT Türkçesi, AYT Türk Dili ve Edebiyatı, KPSS Türkçe; açıklamalı testler ve yazılı öğretmen.",
  };

  const tarihShared = sharedFaq({
    name: "Tarih",
    lower: "tarih",
    locative: "Tarihte",
    notesFrom: "MEB'in LGS ve YKS kazanımlarından ya da KPSS konu ağacından",
  });
  const tarih: SubjectHub = {
    id: "tarih",
    path: "/ders/tarih",
    name: "Tarih",
    lower: "tarih",
    locative: "Tarihte",
    metaTitle: "Tarih çalışma programı ve soru çözümü",
    metaDescription:
      "Tarih için ders notundan kişisel çalışma programı, kavram kartları, yazılı ve canlı sesli öğretmen; LGS İnkılap Tarihi, TYT, AYT ve KPSS kapsamı resmî kazanımlarla.",
    eyebrow: "Ders · LGS · TYT · AYT · KPSS",
    h1: "Tarih: kendi notundan kişisel çalışma programı",
    definition: definition("Tarih", "konu anlatımı, kavram kartları"),
    scope: [
      {
        exam: "LGS",
        structure: { exam: "LGS", subjects: ["T.C. İnkılap Tarihi ve Atatürkçülük"] },
        note: "T.C. İnkılap Tarihi ve Atatürkçülük; 8. sınıf kazanımları (MEB).",
        programIds: ["lgs-2027-inkilap"],
        link: LGS_LINK,
      },
      {
        exam: "TYT",
        structure: { exam: "TYT", subjects: ["Tarih"] },
        note: "Tarih ve İnkılap Tarihi kazanımları (MEB).",
        programIds: ["yks-2026-tarih", "yks-2026-inkilap"],
        link: YKS_LINK,
      },
      {
        exam: "AYT",
        structure: { exam: "AYT", subjects: ["Tarih-1", "Tarih-2"] },
        note: "Tarih-1 ve Tarih-2 testleri toplamı.",
        programIds: ["yks-2026-tarih", "yks-2026-inkilap"],
        link: YKS_LINK,
      },
      {
        exam: "KPSS",
        note: `Genel Kültür testinin içinde; ${KPSS_NO_SPLIT}. Konu ağacı resmî ÖSYM listesi değildir.`,
        programIds: ["kpss-2026-deep-tarih"],
        link: KPSS_LINK,
      },
      {
        exam: "Okul yazılıları",
        note: "Ortaokul İnkılap Tarihi ve lise tarih için sınıf sınıf MEB kazanımları.",
        programIds: ["meb-8-inkilap", ...range("meb", [9, 10, 11], "tarih"), "meb-12-inkilap"],
      },
      UNI_ROW,
    ],
    features: featureList("tarih"),
    faq: [
      {
        q: "Tarih sınavlarda kaç soruyla geliyor?",
        a: `LGS'de ${n("LGS", "T.C. İnkılap Tarihi ve Atatürkçülük")} İnkılap Tarihi, TYT'de ${n("TYT", "Tarih")} tarih sorusu var; AYT'de Tarih-1 ve Tarih-2 testlerinde toplam ${n("AYT", "Tarih-1", "Tarih-2")} soru sorulur. KPSS'de tarih Genel Kültür testinin içindedir; ${KPSS_NO_SPLIT}. ${SOURCE_SENTENCE}`,
      },
      tarihShared.solve,
      {
        q: "Tarihte olayları ve tarihleri nasıl karıştırmam?",
        a: `Olayları tek tek değil, neden-sonuç zinciri ve sırayla öğren; aynı dönemin olaylarını bir zaman çizgisinde yan yana koy. Cortex Plus derslerinde süreç ve zaman çizelgesi gibi şemalar kullanılır; kartlar aynı bilgiyi ${REVIEW_DAYS} gün aralıklarla yeniden sorar.`,
      },
      tarihShared.notes,
      tarihShared.mistakes,
    ],
    guides: ["ders-notundan-calisma-programi-nasil-yapilir", "vize-haftasi-slayt-ozetleme-taktikleri", "sinav-hazirlik-uygulamasi-nasil-secilir"],
    llmsNote: "LGS İnkılap Tarihi, TYT ve AYT tarihi, KPSS tarih; kavram kartları, şemalı ders ve aralıklı tekrar.",
  };

  const cografyaShared = sharedFaq({
    name: "Coğrafya",
    lower: "coğrafya",
    locative: "Coğrafyada",
    notesFrom: "MEB'in YKS kazanımlarından ya da KPSS konu ağacından",
  });
  const cografya: SubjectHub = {
    id: "cografya",
    path: "/ders/cografya",
    name: "Coğrafya",
    lower: "coğrafya",
    locative: "Coğrafyada",
    metaTitle: "Coğrafya çalışma programı ve soru çözümü",
    metaDescription:
      "Coğrafya için ders notundan kişisel çalışma programı, notundaki harita ve şemaları okuyan dersler, yazılı ve canlı sesli öğretmen; TYT, AYT ve KPSS kapsamı.",
    eyebrow: "Ders · TYT · AYT · KPSS · Üniversite",
    h1: "Coğrafya: kendi notundan kişisel çalışma programı",
    definition: definition("Coğrafya", "notundaki şema ve grafikleri de okuyan konu anlatımı"),
    scope: [
      {
        exam: "TYT",
        structure: { exam: "TYT", subjects: ["Coğrafya"] },
        note: "Coğrafya kazanımları (MEB).",
        programIds: ["yks-2026-cografya"],
        link: YKS_LINK,
      },
      {
        exam: "AYT",
        structure: { exam: "AYT", subjects: ["Coğrafya-1", "Coğrafya-2"] },
        note: "Coğrafya-1 ve Coğrafya-2 testleri toplamı.",
        programIds: ["yks-2026-cografya"],
        link: YKS_LINK,
      },
      {
        exam: "KPSS",
        note: `Genel Kültür testinin içinde; ${KPSS_NO_SPLIT}. Konu ağacı resmî ÖSYM listesi değildir.`,
        programIds: ["kpss-2026-deep-cografya"],
        link: KPSS_LINK,
      },
      {
        exam: "Okul yazılıları",
        note: "Lise coğrafya yazılıları için sınıf sınıf MEB kazanımları.",
        programIds: range("meb", [9, 10, 11, 12], "cografya"),
      },
      UNI_ROW,
    ],
    features: featureList("coğrafya"),
    faq: [
      {
        q: "Coğrafya sınavlarda kaç soruyla geliyor?",
        a: `TYT'de ${n("TYT", "Coğrafya")} coğrafya sorusu var; AYT'de Coğrafya-1 ve Coğrafya-2 testlerinde toplam ${n("AYT", "Coğrafya-1", "Coğrafya-2")} soru sorulur. LGS'de coğrafya testi yoktur; KPSS'de coğrafya Genel Kültür testinin içindedir. ${SOURCE_SENTENCE}`,
      },
      cografyaShared.solve,
      {
        q: "Coğrafyada harita ve grafik sorularına nasıl çalışırım?",
        a: "Haritayı ezberlemek yerine her konumu bir olguyla eşle (iklim, yer şekli, nüfus) ve grafikte önce eksenleri ve birimleri oku. Cortex Plus notundaki harita, şema ve grafikleri de okur; şekilli sayfa derste “Belgedeki Şema” kartıyla açılır.",
      },
      cografyaShared.notes,
      cografyaShared.mistakes,
    ],
    guides: ["ders-notundan-calisma-programi-nasil-yapilir", "gece-ders-calisirken-takilan-soru-cozumu", "sinav-hazirlik-uygulamasi-nasil-secilir"],
    llmsNote: "TYT ve AYT coğrafyası, KPSS coğrafya; notundaki harita ve şemaları okuyan dersler ve aralıklı tekrar.",
  };

  const ingilizceShared = sharedFaq({
    name: "İngilizce",
    lower: "İngilizce",
    locative: "İngilizcede",
    notesFrom: "MEB'in LGS ve okul kazanımlarından ya da YDS konu ağacından",
  });
  const ingilizce: SubjectHub = {
    id: "ingilizce",
    path: "/ders/ingilizce",
    name: "İngilizce",
    lower: "İngilizce",
    locative: "İngilizcede",
    metaTitle: "İngilizce çalışma programı ve kelime tekrarı",
    metaDescription:
      "İngilizce için ders notundan kişisel çalışma programı, kelime kartları ve aralıklı tekrar, yazılı ve canlı sesli öğretmen; LGS, okul yazılıları ve YDS kapsamı.",
    eyebrow: "Ders · LGS · Okul · YDS · Üniversite",
    h1: "İngilizce: kendi notundan kişisel çalışma programı",
    definition: definition("İngilizce", "kelime kartları, açıklamalı testler"),
    scope: [
      {
        exam: "LGS",
        structure: { exam: "LGS", subjects: ["Yabancı Dil"] },
        note: "Yabancı Dil testi; 8. sınıf kazanımları (MEB).",
        programIds: ["lgs-2027-ingilizce"],
        link: LGS_LINK,
      },
      {
        exam: "YDS",
        structure: { exam: "YDS", subjects: ["Yabancı Dil"] },
        note: "Soru türleri ÖSYM kılavuzundan; alt başlıklar resmî ÖSYM listesi değildir.",
        programIds: ["yds-2026-deep-yabanci-dil"],
      },
      {
        exam: "Okul yazılıları",
        note: "Ortaokul ve lise İngilizce yazılıları için sınıf sınıf MEB kazanımları.",
        programIds: range("meb", [5, 6, 7, 8, 9, 10, 11, 12], "ingilizce"),
      },
      UNI_ROW,
    ],
    features: featureList("İngilizce"),
    faq: [
      {
        q: "İngilizce sınavlarda kaç soruyla geliyor?",
        a: `LGS'de Yabancı Dil testinde ${n("LGS", "Yabancı Dil")}, YDS'de ${n("YDS", "Yabancı Dil")} soru var. TYT ve AYT'de İngilizce yoktur; Cortex Plus YDT'ye özel hazırlık sunmaz. ${SOURCE_SENTENCE}`,
      },
      ingilizceShared.solve,
      {
        q: "İngilizce kelimeleri nasıl kalıcı ezberlerim?",
        a: `Kelimeyi bir cümle içinde öğren ve aralıkları açarak tekrar et. Cortex Plus'ta kartlar zorlandığın kelimeyi önce getirir; günü gelen tekrar yanlış yaptığın soruları ${REVIEW_DAYS} gün sonra yeniden sorar.`,
      },
      ingilizceShared.notes,
      ingilizceShared.mistakes,
    ],
    guides: ["ders-notundan-calisma-programi-nasil-yapilir", "gece-ders-calisirken-takilan-soru-cozumu", "sinav-hazirlik-uygulamasi-nasil-secilir"],
    llmsNote: "LGS İngilizce, okul yazılıları ve YDS; kelime kartları, aralıklı tekrar ve yazılı öğretmen.",
  };

  return { matematik, kimya, fizik, biyoloji, turkce, tarih, cografya, ingilizce };
}

export const SUBJECT_HUBS: Record<SubjectHubId, SubjectHub> = buildHubs();

/** Sayfa sırası (bağlantı listesiyle aynı). */
export const SUBJECT_HUB_LIST: readonly SubjectHub[] = SUBJECT_HUB_LINKS.map((link) => SUBJECT_HUBS[link.id]);

export function subjectHubSummary(hub: SubjectHub): string {
  return hub.definition.join(" ");
}

/** Satırın program bağlantıları (kayıt defterinde olmayan atlanır). */
export function scopePrograms(row: SubjectScopeRow) {
  return row.programIds.flatMap((id) => {
    const program = getProgram(id);
    return program ? [{ id, href: `/mufredat/${id}`, label: program.label, units: program.units.length }] : [];
  });
}
