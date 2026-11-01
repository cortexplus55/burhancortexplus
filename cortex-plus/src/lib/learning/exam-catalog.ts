/**
 * Sınav listesinin "Müfredatım" ve "Resmî sınavlar" sekmeleri — Astra düzeni
 * (29 Eylül 2026).
 *
 * Astra bu sekmelerde hazır yollar gösteriyor ("Matematik 1. Yıl" gibi).
 * Bizde hazır içerik yok; kart, sohbetle kurulumu dersi ve ilk mesajı dolu
 * olarak açıyor, konular kurulumda çıkarılıyor. Buradaki metinler yalnızca
 * sınavın adı ve bölümleri — konu listesi iddiası yok (bkz. İÇERİK EV STİLİ:
 * eşik/sınıflandırma iddiası kaynağa bağlanır).
 */

export type CatalogItem = {
  id: string;
  /** Kartın başlığı. */
  title: string;
  /** Kartın alt satırı. */
  detail: string;
  /** Hazırlığın dersi (exam_type). */
  subject: string;
  /** Sohbetle kurulumun ilk mesajı. */
  prompt: string;
};

export const OFFICIAL_EXAMS: CatalogItem[] = [
  {
    id: "tyt",
    title: "YKS · TYT",
    detail: "Türkçe, Temel Matematik, Fen Bilimleri, Sosyal Bilimler",
    subject: "TYT",
    prompt: "YKS TYT'ye hazırlanıyorum.",
  },
  {
    id: "ayt",
    title: "YKS · AYT",
    detail: "Alan Yeterlilik Testleri",
    subject: "AYT",
    prompt: "YKS AYT'ye hazırlanıyorum.",
  },
  {
    id: "lgs",
    title: "LGS",
    detail: "Liselere Geçiş Sistemi merkezi sınavı",
    subject: "LGS",
    prompt: "LGS'ye hazırlanıyorum.",
  },
  {
    id: "kpss",
    title: "KPSS",
    detail: "Genel Yetenek ve Genel Kültür",
    subject: "KPSS",
    prompt: "KPSS'ye hazırlanıyorum.",
  },
  {
    id: "ales",
    title: "ALES",
    detail: "Sayısal ve sözel bölümler",
    subject: "ALES",
    prompt: "ALES'e hazırlanıyorum.",
  },
  {
    id: "dgs",
    title: "DGS",
    detail: "Dikey Geçiş Sınavı",
    subject: "DGS",
    prompt: "DGS'ye hazırlanıyorum.",
  },
  {
    id: "yds",
    title: "YDS / YÖKDİL",
    detail: "Yabancı dil sınavları",
    subject: "YDS",
    prompt: "YDS'ye hazırlanıyorum.",
  },
  {
    id: "tus",
    title: "TUS",
    detail: "Temel ve Klinik Tıp Bilimleri",
    subject: "TUS",
    prompt: "TUS'a hazırlanıyorum.",
  },
  {
    id: "dus",
    title: "DUS",
    detail: "Diş hekimliğinde uzmanlık sınavı",
    subject: "DUS",
    prompt: "DUS'a hazırlanıyorum.",
  },
];

const MIDDLE_SCHOOL = ["Matematik", "Fen Bilimleri", "Türkçe", "Sosyal Bilgiler", "İngilizce"];
const HIGH_SCHOOL = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türk Dili ve Edebiyatı",
  "Tarih",
  "Coğrafya",
  "İngilizce",
];
const GRADUATE = ["TYT Matematik", "TYT Türkçe", "AYT Matematik", "AYT Fizik", "AYT Kimya", "AYT Biyoloji"];

/**
 * Öğrencinin sınıfına göre müfredat dersleri. Sınıf bilinmiyorsa lise
 * dersleri — kayıtta en sık seçilen aralık.
 */
export function curriculumFor(gradeLevel: string | null | undefined): {
  levelLabel: string;
  items: CatalogItem[];
} {
  const grade = (gradeLevel ?? "").trim();
  const number = Number.parseInt(grade, 10);
  if (/mezun/i.test(grade)) {
    return {
      levelLabel: "Mezun",
      items: GRADUATE.map((subject) => ({
        id: subject,
        title: subject,
        detail: "YKS hazırlığı",
        subject,
        prompt: `${subject} konularına çalışmak istiyorum.`,
      })),
    };
  }
  const middle = Number.isFinite(number) && number >= 5 && number <= 8;
  const subjects = middle ? MIDDLE_SCHOOL : HIGH_SCHOOL;
  const levelLabel = Number.isFinite(number) && number >= 5 && number <= 12 ? `${number}. sınıf` : "Lise";
  return {
    levelLabel,
    items: subjects.map((subject) => ({
      id: subject,
      title: subject,
      detail: `${levelLabel} müfredatı`,
      subject,
      prompt: `${levelLabel} ${subject} müfredatındaki konulara çalışmak istiyorum.`,
    })),
  };
}

/**
 * Hazır müfredat seçici (29 Ekim 2026): sihirbazın materyal adımında "Dosyam yok — hazır
 * müfredattan seç". Düzey ve ders seçilince sohbetli kuruluma dolu istemle devredilir; konu listesini
 * kurulum çıkarır ve öğrenci onaylar. Burada yalnız sınav/düzey adları ve dersler var — konu listesi
 * iddiası yok (İÇERİK EV STİLİ).
 */
export type CurriculumLevel = {
  id: string;
  label: string;
  /** Hazırlığın dersi; boşsa seçilen ders adı kullanılır. */
  examType?: string;
  subjects: string[];
  /** Serbest ders adı (üniversite). */
  freeSubject?: boolean;
};

const LGS_SUBJECTS = ["Matematik", "Fen Bilimleri", "Türkçe", "T.C. İnkılap Tarihi ve Atatürkçülük", "Din Kültürü ve Ahlak Bilgisi", "İngilizce"];
const TYT_SUBJECTS = ["Türkçe", "Temel Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji", "Tarih", "Coğrafya", "Felsefe", "Din Kültürü"];
const AYT_SUBJECTS = ["Matematik", "Fizik", "Kimya", "Biyoloji", "Türk Dili ve Edebiyatı", "Tarih", "Coğrafya", "Felsefe"];
const KPSS_SUBJECTS = ["Türkçe", "Matematik", "Tarih", "Coğrafya", "Vatandaşlık", "Güncel Bilgiler", "Eğitim Bilimleri"];
const TUS_SUBJECTS = ["Anatomi", "Fizyoloji", "Biyokimya", "Mikrobiyoloji", "Patoloji", "Farmakoloji", "Dahiliye", "Pediatri", "Genel Cerrahi", "Kadın Doğum", "Küçük Stajlar"];
const DUS_SUBJECTS = ["Temel Bilimler", "Klinik Bilimler"];

export const CURRICULUM_LEVELS: CurriculumLevel[] = [
  ...[5, 6, 7, 8].map((grade) => ({ id: `sinif-${grade}`, label: `${grade}. sınıf`, subjects: MIDDLE_SCHOOL })),
  ...[9, 10, 11, 12].map((grade) => ({ id: `sinif-${grade}`, label: `${grade}. sınıf`, subjects: HIGH_SCHOOL })),
  { id: "lgs", label: "LGS", examType: "LGS", subjects: LGS_SUBJECTS },
  { id: "tyt", label: "TYT", examType: "TYT", subjects: TYT_SUBJECTS },
  { id: "ayt", label: "AYT", examType: "AYT", subjects: AYT_SUBJECTS },
  { id: "kpss", label: "KPSS", examType: "KPSS", subjects: KPSS_SUBJECTS },
  { id: "ales", label: "ALES", examType: "ALES", subjects: ["Sayısal", "Sözel"] },
  { id: "dgs", label: "DGS", examType: "DGS", subjects: ["Sayısal", "Sözel"] },
  { id: "yds", label: "YDS / YÖKDİL", examType: "YDS", subjects: ["İngilizce", "Almanca", "Fransızca"] },
  { id: "tus", label: "TUS", examType: "TUS", subjects: TUS_SUBJECTS },
  { id: "dus", label: "DUS", examType: "DUS", subjects: DUS_SUBJECTS },
  { id: "universite", label: "Üniversite", subjects: [], freeSubject: true },
];

/** Seçimden kurulumun dersi ve ilk mesajı; `curriculumFor` ile aynı cümle kalıbı. */
export function curriculumPick(levelId: string, subject: string): { subject: string; prompt: string } | null {
  const level = CURRICULUM_LEVELS.find((item) => item.id === levelId);
  const name = subject.trim();
  if (!level || !name) return null;
  if (level.freeSubject) {
    return { subject: name, prompt: `${name} dersinin üniversite müfredatındaki konulara çalışmak istiyorum.` };
  }
  if (level.examType) {
    return { subject: `${level.examType} ${name}`, prompt: `${level.examType} ${name} müfredatındaki konulara çalışmak istiyorum.` };
  }
  return { subject: name, prompt: `${level.label} ${name} müfredatındaki konulara çalışmak istiyorum.` };
}

/** Kurulumu ders ve ilk mesaj dolu açan adres. */
/** Kayıt defteri destekli resmî kurulum (1 Kasım 2026): YKS ve LGS kartları belge sormadan ders → konu → tarih akışına gider. */
const OFFICIAL_SETUP_HREF: Record<string, string> = {
  tyt: "/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt",
  ayt: "/deneme-sinavlari/resmi/kurulum?sinav=yks",
  lgs: "/deneme-sinavlari/resmi/kurulum?sinav=lgs",
};

export function catalogCreateHref(item: CatalogItem): string {
  const official = OFFICIAL_SETUP_HREF[item.id];
  if (official && OFFICIAL_EXAMS.includes(item)) return official;
  const params = new URLSearchParams({ ders: item.subject, istem: item.prompt });
  return `/deneme-sinavlari/olustur?${params.toString()}`;
}
