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

/** Kurulumu ders ve ilk mesaj dolu açan adres. */
export function catalogCreateHref(item: CatalogItem): string {
  const params = new URLSearchParams({ ders: item.subject, istem: item.prompt });
  return `/deneme-sinavlari/olustur?${params.toString()}`;
}
