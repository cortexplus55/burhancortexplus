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
export type ToolCategory = "simulasyon" | "studio" | "odak";

export type Tool = {
  id: string;
  title: string;
  blurb: string;
  subject: string;
  kind: ToolKind;
  href: string;
  category: ToolCategory;
};

export const TOOL_CATEGORIES: { id: ToolCategory; label: string; emoji: string }[] = [
  { id: "simulasyon", label: "İnteraktif Simülasyonlar", emoji: "🔬" },
  { id: "studio", label: "Çalışma Stüdyoları", emoji: "🧠" },
  { id: "odak", label: "Zihin & Odak Araçları", emoji: "🎮" },
];

export const TOOLS: Tool[] = [
  {
    id: "birim-cember",
    title: "Birim çember laboratuvarı",
    blurb: "Açıyı sürükle; sin, cos, tan uzunluklarını ve bölge işaretlerini canlı gör.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/birim-cember",
    category: "simulasyon",
  },
  {
    id: "parabol",
    title: "Parabol keşfedici",
    blurb: "a, b, c kaydır; tepe noktası, diskriminant ve kökler birlikte hareket eder.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/parabol",
    category: "simulasyon",
  },
  {
    id: "hucre",
    title: "Hücre laboratuvarı",
    blurb: "Organelleri yerleştir, doğru-yanlış geri bildirimi ve sınav ipuçlarını al.",
    subject: "Biyoloji",
    kind: "hesap",
    href: "/araclar/hucre",
    category: "simulasyon",
  },
  // --- Hesap araçları -------------------------------------------------
  {
    id: "denklem",
    title: "Denklem çözücü",
    blurb: "İkinci derece denklemi çöz, kökleri ve parabolü birlikte gör.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/denklem",
    category: "odak",
  },
  {
    id: "integral",
    title: "İntegral hesaplayıcı",
    blurb: "Belirli integrali hesapla, eğri altındaki alanı gör.",
    subject: "Matematik",
    kind: "hesap",
    href: "/araclar/integral",
    category: "odak",
  },
  {
    id: "periyodik",
    title: "Periyodik tablo",
    blurb: "Elemente tıkla; grup, periyot ve özelliklerini incele.",
    subject: "Kimya",
    kind: "hesap",
    href: "/araclar/periyodik",
    category: "odak",
  },
  {
    id: "birim",
    title: "Birim dönüştürücü",
    blurb: "Uzunluk, kütle, alan, hacim, sıcaklık ve zaman arasında çevir.",
    subject: "Genel",
    kind: "hesap",
    href: "/araclar/birim",
    category: "odak",
  },

  // --- Kısayollar -----------------------------------------------------
  {
    id: "soru-coz",
    title: "Fotoğraftan Çözüm",
    blurb: "Sorunun fotoğrafını çek, adım adım çözümü al.",
    subject: "Genel",
    kind: "kisayol",
    href: "/soru-coz",
    category: "studio",
  },
  // 19 Ekim 2026: kartlar ve test belge seçebilen stüdyolara gider (eski /flashcardlar ve /quizler
  // yalnız konu yazdırıyordu); doğru/yanlış stüdyosu da listede.
  {
    id: "flashcard",
    title: "Kartlar",
    blurb: "Konudan ya da belgenden kart üret, aralıklı tekrarla çalış.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/flashcard",
    category: "studio",
  },
  {
    id: "quiz",
    title: "Konu testi",
    blurb: "Konudan ya da belgenden kendine test hazırla; her şık açıklanır.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/quiz",
    category: "studio",
  },
  {
    id: "dogru-yanlis",
    title: "Doğru / Yanlış",
    blurb: "Hızlı kontrol; yanlış cümlenin doğrusu yanında.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/dogru-yanlis",
    category: "studio",
  },
  {
    id: "deneme",
    title: "Deneme Sınavı",
    blurb: "Gerçek sınav düzeninde dene, sonucunu analiz et.",
    subject: "Genel",
    kind: "kisayol",
    href: "/deneme-sinavlari",
    category: "studio",
  },
  {
    id: "dokuman",
    title: "Kendi Belgemden Çalış",
    blurb: "Kendi notlarını yükle, üzerinden çalış.",
    subject: "Genel",
    kind: "kisayol",
    href: "/dokumanlar",
    category: "odak",
  },
  {
    id: "ilerleme",
    title: "İlerleme Analizi",
    blurb: "Neyi ne kadar çalıştığını gör.",
    subject: "Genel",
    kind: "kisayol",
    href: "/ilerleme",
    category: "odak",
  },
  {
    id: "sohbetler",
    title: "Sohbet geçmişi",
    blurb: "Önceki konuşmalarına dön, kaldığın yerden devam et.",
    subject: "Genel",
    kind: "kisayol",
    href: "/sohbetler",
    category: "odak",
  },
  {
    id: "yanlislarim",
    title: "Yanlışlar Defteri",
    blurb: "Yanlış yaptığın sorular burada birikir, doğru yapana kadar sorar.",
    subject: "Genel",
    kind: "kisayol",
    href: "/yanlislarim",
    category: "odak",
  },
  {
    id: "podcast",
    title: "Podcast",
    blurb: "Ders notlarını dinleyerek tekrar et.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/podcast",
    category: "studio",
  },
  {
    id: "sozlu",
    title: "Sözlü Sınav",
    blurb: "Sesli veya yazılı anlat, anında geri bildirim al.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/sozlu",
    category: "studio",
  },
  {
    id: "anlat",
    title: "Anlatarak öğren",
    blurb: "Konuyu sen anlat, nerede tökezlediğini birlikte görelim.",
    subject: "Genel",
    kind: "kisayol",
    href: "/studio/anlat",
    category: "studio",
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
