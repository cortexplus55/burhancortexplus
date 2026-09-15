/** Marketing ders kartları. */

import type { LucideIcon } from "lucide-react";
import {
  Atom,
  Brain,
  BookOpen,
  Dna,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  ScrollText,
  Sigma,
  Terminal,
  TrendingUp,
} from "lucide-react";

/**
 * İkonlar neden emoji değil.
 *
 * Kartlarda emoji vardı ve dördü bayraktı: 🇬🇧 🇩🇪 🇪🇸 🇫🇷. Bayrak emojileri
 * Windows'ta hiç çizilmiyor — yerine iki harfli bir kutu ("GB") çıkıyor ve
 * Türkiye'de masaüstü kullanıcılarının önemli bir kısmı orada. Geri kalan
 * emojiler de her işletim sisteminde başka bir çizimle geliyor: aynı ızgarada
 * yan yana duran on beş kart on beş ayrı üsluptan derlenmiş gibi görünüyor.
 *
 * Lucide seti zaten bağımlılıkta ve uygulamanın geri kalanı onu kullanıyor;
 * ders kartları da aynı dile geçiyor.
 *
 * Dört dilin ikonu BİLEREK aynı: hepsi aynı türde iş. Ayrımı rastgele
 * seçilmiş ikonlar değil, ders adı ve kartın kendi vurgu rengi yapıyor —
 * uydurma bir ayrım, ayrımsızlıktan kötüdür.
 */
export type MarketingSubject = {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Kart ikonunun vurgu rengi; dil dersleri ikonu paylaştığı için ayırt edici. */
  tint: string;
  blurb: string;
};

export const MARKETING_SUBJECTS: MarketingSubject[] = [
  {
    slug: "matematik",
    label: "Matematik",
    icon: Sigma,
    tint: "#7c6cf7",
    blurb: "Sorunun fotoğrafını çek; adım adım, anlaşılır çözüm al.",
  },
  {
    slug: "kimya",
    label: "Kimya",
    icon: FlaskConical,
    tint: "#34c77b",
    blurb: "Molekülden tepkimeye — her konuda açıklama ve örnek.",
  },
  {
    slug: "fizik",
    label: "Fizik",
    icon: Atom,
    tint: "#f4ae0b",
    blurb: "Kuvvet, enerji ve hareketi interaktif problem çözümüyle kavra.",
  },
  {
    slug: "ingilizce",
    label: "İngilizce",
    icon: Languages,
    tint: "#6b8cff",
    blurb: "Kişisel AI öğretmenle dilbilgisi ve kelime pratiği.",
  },
  {
    slug: "almanca",
    label: "Almanca",
    icon: Languages,
    tint: "#e06c4f",
    blurb: "Dilbilgisi kuralları ve kelime dağarcığı — örneklerle pekiştir.",
  },
  {
    slug: "biyoloji",
    label: "Biyoloji",
    icon: Dna,
    tint: "#2fbf8f",
    blurb: "Hücreden ekosisteme — süreçler ve gerçek dünya örnekleri.",
  },
  {
    slug: "ispanyolca",
    label: "İspanyolca",
    icon: Languages,
    tint: "#f0a73a",
    blurb: "Dilbilgisi, kelimeler ve ifadeler — akıcı konuşma için alıştırma.",
  },
  {
    slug: "cografya",
    label: "Coğrafya",
    icon: Globe,
    tint: "#3fa9d6",
    blurb: "Haritalardan iklime — yapı, nüfus ve ekonomi adım adım.",
  },
  {
    slug: "tarih",
    label: "Tarih",
    icon: ScrollText,
    tint: "#c08a4a",
    blurb: "Neden-sonuç, zaman çizelgesi ve önemli isimler net anlatım.",
  },
  {
    slug: "ekonomi",
    label: "Ekonomi",
    icon: TrendingUp,
    tint: "#4fc3a1",
    blurb: "Arz-talep, piyasalar ve finans — pratik örneklerle.",
  },
  {
    slug: "bilgisayar",
    label: "Bilgisayar bilimi",
    icon: Terminal,
    tint: "#8b9cf7",
    blurb: "Algoritma ve veri — somut örneklerle adım adım.",
  },
  {
    slug: "felsefe",
    label: "Felsefe",
    icon: Landmark,
    tint: "#b28ce0",
    blurb: "Kavramlar, argümanlar ve mantık — günlük örneklerle.",
  },
  {
    slug: "psikoloji",
    label: "Psikoloji",
    icon: Brain,
    tint: "#e57ba8",
    blurb: "Davranış ve zihinsel süreçler — teoriler sade dille.",
  },
  {
    slug: "fransizca",
    label: "Fransızca",
    icon: Languages,
    tint: "#5fb0e8",
    blurb: "Dilbilgisi ve kelime — pratik cümlelerle konuşma pratiği.",
  },
  {
    slug: "turkce",
    label: "Türkçe",
    icon: BookOpen,
    tint: "#d4544f",
    blurb: "Anlatım bozuklukları, edebiyat ve yazım — sınav odaklı.",
  },
];
