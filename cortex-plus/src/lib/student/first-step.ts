import { catalogCreateHref, CURRICULUM_LEVELS, curriculumFor, curriculumPick } from "@/lib/learning/exam-catalog";

/**
 * Kayıttan sonraki ilk ekranın kişiselleştirilmiş başlatıcısı (7 Kasım 2026). Hiç hazırlığı olmayan öğrenci boş bir
 * sohbet kutusu yerine üç net kapı görür: kendi notunu yükle, hazır müfredattan başla, çözemediğin soruyu çek.
 *
 * Hepsi var olan yollara gider: belge yükleme sihirbazı (`/deneme-sinavlari/olustur`), resmî sınav kurulumu
 * (`/deneme-sinavlari/resmi/kurulum?sinav=…`) ya da hazır müfredat seçimi (`curriculumPick` → dolu istemle kurulum),
 * soru çözücü (`/soru-coz`). Konu listesi yok; yalnız sınav/düzey adları ve dersler (İÇERİK EV STİLİ).
 */

export type FirstStepChip = { label: string; href: string };

export type FirstStepPlan = {
  /** "YKS (TYT-AYT)", "11. sınıf", "KPSS" gibi: başlıkta "… hedefin için". */
  targetLabel: string;
  /** Hazır müfredat kartının gövdesi: öğrencinin düzeyi adıyla. */
  curriculumBody: string;
  /** Hazır müfredat kartının ana düğmesi. */
  curriculumHref: string;
  /** En çok 4 hızlı ders çipi; üniversitede boş (ders adı serbest). */
  chips: FirstStepChip[];
};

export const FIRST_STEP_UPLOAD_HREF = "/deneme-sinavlari/olustur";
export const FIRST_STEP_SOLVE_HREF = "/soru-coz";

/**
 * "Not yükle" kapısındaki tarama çekirdeğinin başlığı (C2, 13 Kasım 2026). Yeni söz değil: misafir turunun ilk
 * adımının başlığıyla aynı (`JOURNEY_STEPS`, upload); misafir sayfasının dosyası uygulamaya yüklenmesin diye burada
 * durur, bekçi test ikisini eşit tutar.
 */
export const FIRST_STEP_CORE_TITLE = "Notunu tarama çekirdeğine bırak";

function levelChips(levelId: string, subjects: string[]): FirstStepChip[] {
  return subjects
    .map((subject) => {
      const pick = curriculumPick(levelId, subject);
      if (!pick) return null;
      const params = new URLSearchParams({ ders: pick.subject, istem: pick.prompt });
      return { label: subject, href: `/deneme-sinavlari/olustur?${params.toString()}` };
    })
    .filter((chip): chip is FirstStepChip => chip !== null)
    .slice(0, 4);
}

function subjectsOf(levelId: string): string[] {
  return CURRICULUM_LEVELS.find((level) => level.id === levelId)?.subjects ?? [];
}

const EXAM_GOALS: { test: RegExp; levelId: string; label: string; href: string; chips: string[] }[] = [
  { test: /^LGS/i, levelId: "lgs", label: "LGS", href: "/deneme-sinavlari/resmi/kurulum?sinav=lgs", chips: ["Matematik", "Fen Bilimleri", "Türkçe", "T.C. İnkılap Tarihi ve Atatürkçülük"] },
  { test: /^YKS/i, levelId: "tyt", label: "YKS (TYT-AYT)", href: "/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt", chips: ["Türkçe", "Temel Matematik", "Fizik", "Biyoloji"] },
  { test: /^KPSS/i, levelId: "kpss", label: "KPSS", href: "/deneme-sinavlari/resmi/kurulum?sinav=kpss", chips: ["Türkçe", "Matematik", "Tarih", "Vatandaşlık"] },
  { test: /^ALES/i, levelId: "ales", label: "ALES", href: "/deneme-sinavlari/resmi/kurulum?sinav=ales", chips: ["Sayısal", "Sözel"] },
  { test: /^TUS/i, levelId: "tus", label: "TUS", href: "/deneme-sinavlari/resmi/kurulum?sinav=tus", chips: ["Anatomi", "Fizyoloji", "Dahiliye", "Pediatri"] },
];

export function firstStepPlan(input: { gradeLevel?: string | null; goalText?: string | null }): FirstStepPlan {
  const grade = (input.gradeLevel ?? "").trim();
  const goal = (input.goalText ?? "").trim();

  for (const exam of EXAM_GOALS) {
    if (!exam.test.test(goal)) continue;
    const known = subjectsOf(exam.levelId);
    const chips = levelChips(exam.levelId, exam.chips.filter((subject) => known.includes(subject)));
    return {
      targetLabel: exam.label,
      curriculumBody: `Elinde not olmasına gerek yok: ${exam.label} müfredatından dersini seç; konular hazır çıkar, ilk dersin saniyeler içinde açılır.`,
      curriculumHref: exam.href,
      chips,
    };
  }

  if (/üniversite/i.test(grade) || /^Üniversite/i.test(goal)) {
    return {
      targetLabel: "üniversite vize ve final",
      curriculumBody: "Dersinin adını yaz; üniversite müfredatından konular çıkarılır, hocanın notu varsa onu da eklersin.",
      curriculumHref: FIRST_STEP_UPLOAD_HREF,
      chips: [],
    };
  }

  const curriculum = curriculumFor(grade || null);
  const label = /mezun/i.test(grade) ? "YKS (TYT-AYT)" : curriculum.levelLabel;
  return {
    targetLabel: label,
    curriculumBody: `Elinde not olmasına gerek yok: ${label} müfredatından dersini seç; konular hazır çıkar, ilk dersin saniyeler içinde açılır.`,
    curriculumHref: /mezun/i.test(grade) ? "/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt" : "/deneme-sinavlari/mufredat",
    chips: curriculum.items.slice(0, 4).map((item) => ({ label: item.subject.replace(/^(TYT|AYT) /, ""), href: catalogCreateHref(item) })),
  };
}

/** Başlık: "Hoş geldin Ayşe! 🎯 YKS (TYT-AYT) hedefin için ilk adımı 30 saniyede atalım." */
export function firstStepGreeting(firstName: string | null | undefined, targetLabel: string): string {
  const name = (firstName ?? "").trim();
  return `${name ? `Hoş geldin ${name}!` : "Hoş geldin!"} 🎯 ${targetLabel} hedefin için ilk adımı 30 saniyede atalım.`;
}
