/**
 * Araçlar kataloğu.
 *
 * İki tür araç var ve ayrımı gizlemiyoruz:
 *
 *  - "hesap" — burada açılan, kendi başına çalışan bir araç.
 *  - "kisayol" — ürünün başka bir bölümüne götüren bağlantı.
 *
 * Bu ayrım kartlarda da görünüyor. Karıştırmak kullanıcıyı yanıltıyordu:
 * bir kısayola tıklayıp "araç açılacak" beklerken sayfa değişiyordu.
 *
 * Eski katalogda "DNA & genetik" ile "Flashcard stüdyo" aynı sayfaya
 * gidiyordu; yinelenen kaldırıldı, yerine gerçek bir araç kondu.
 */

export type ToolKind = "hesap" | "kisayol";

export type Tool = {
  id: string;
  title: string;
  blurb: string;
  subject: string;
  kind: ToolKind;
  href: string;
};

export const TOOLS: Tool[] = [
  // --- Hesap araçları -------------------------------------------------
  {
    id: "denklem",
    title: "Denklem çözücü",
    blurb: "İkinci derece denklemi çöz, kökleri ve parabolü birlikte gör.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/denklem",
  },
  {
    id: "integral",
    title: "İntegral hesaplayıcı",
    blurb: "Belirli integrali hesapla, eğri altındaki alanı gör.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/integral",
  },
  {
    id: "periyodik",
    title: "Periyodik tablo",
    blurb: "Elemente tıkla; grup, periyot ve özelliklerini incele.",
    subject: "Kimya",
    kind: "hesap",
    href: "/araclar/periyodik",
  },
  {
    id: "birim",
    title: "Birim dönüştürücü",
    blurb: "Uzunluk, kütle, alan, hacim, sıcaklık ve zaman arasında çevir.",
    subject: "Genel",
    kind: "hesap",
    href: "/araclar/birim",
  },

  // --- Kısayollar -----------------------------------------------------
  {
    id: "soru-coz",
    title: "Fotoğraftan çöz",
    blurb: "Sorunun fotoğrafını çek, adım adım çözümü al.",
    subject: "Genel",
    kind: "kisayol",
    href: "/soru-coz",
  },
  {
    id: "flashcard",
    title: "Flashcard stüdyo",
    blurb: "Konudan kart üret, aralıklı tekrarla çalış.",
    subject: "Genel",
    kind: "kisayol",
    href: "/flashcardlar",
  },
  {
    id: "quiz",
    title: "Quiz oluştur",
    blurb: "Herhangi bir konudan kendine test hazırla.",
    subject: "Genel",
    kind: "kisayol",
    href: "/quizler",
  },
  {
    id: "calisma-plani",
    title: "Çalışma planı",
    blurb: "Sınav tarihine göre günlük plan çıkar.",
    subject: "Genel",
    kind: "kisayol",
    href: "/calisma-plani",
  },
  {
    id: "deneme",
    title: "Deneme sınavı",
    blurb: "Gerçek sınav düzeninde dene, sonucunu analiz et.",
    subject: "Genel",
    kind: "kisayol",
    href: "/deneme-sinavlari",
  },
  {
    id: "dokuman",
    title: "Doküman asistanı",
    blurb: "Kendi notlarını yükle, üzerinden çalış.",
    subject: "Genel",
    kind: "kisayol",
    href: "/dokumanlar",
  },
  {
    id: "ilerleme",
    title: "İlerleme panosu",
    blurb: "Neyi ne kadar çalıştığını gör.",
    subject: "Genel",
    kind: "kisayol",
    href: "/ilerleme",
  },
  {
    id: "sohbetler",
    title: "Sohbet geçmişi",
    blurb: "Önceki konuşmalarına dön, kaldığın yerden devam et.",
    subject: "Genel",
    kind: "kisayol",
    href: "/sohbetler",
  },
  {
    id: "yanlislarim",
    title: "Yanlış defteri",
    blurb: "Yanlış yaptığın sorular burada birikir, doğru yapana kadar sorar.",
    subject: "Genel",
    kind: "kisayol",
    href: "/yanlislarim",
  },
  {
    id: "anlat",
    title: "Anlatarak öğren",
    blurb: "Konuyu sen anlat, nerede tökezlediğini birlikte görelim.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/anlat",
  },
];

/** Sayfada açılan araçlar — /araclar/[id] bunları tanıyor. */
export const CALCULATORS = TOOLS.filter((t) => t.kind === "hesap");

export const TOOL_SUBJECTS = [
  "Tümü",
  ...Array.from(new Set(TOOLS.map((t) => t.subject))),
] as const;

export function findTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}
