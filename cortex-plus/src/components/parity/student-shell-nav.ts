import {
  Bell,
  Camera,
  CreditCard,
  FileText,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  History,
  Home,
  Layers,
  MessageCircle,
  Mic,
  NotebookPen,
  Podcast,
  Settings,
  Sparkles,
  Target,
  User,
  Users,
} from "lucide-react";

export type StudentNavItem = {
  id: string;
  href: string;
  label: string;
  /** Alt menüde (telefon) sığmayan uzun adın kısası. */
  shortLabel?: string;
  icon: typeof MessageCircle;
  match: (path: string) => boolean;
};

/** Canonical feature labels — marketing + app aynı isimleri kullanır. */
export const CANONICAL_FEATURES = {
  aiTeacher: "AI Öğretmen",
  studyFromDoc: "Kendi Belgemden Çalış",
  quiz: "Konu Testi",
  flashcard: "Kartlar",
  podcast: "Podcast",
  oral: "Sözlü Sınav",
  mockExam: "Deneme Sınavı",
  photoSolve: "Fotoğraftan Çözüm",
  mistakeNotebook: "Yanlışlar Defteri",
  studyPlan: "Çalışma Planı",
  progress: "İlerleme",
} as const;

/**
 * Ana Sayfa · Sınavlar · Araçlar · Profil
 *
 * 30 Eylül 2026: Ana Sayfa sohbet (kıyas ürününde ilk sekme "Sor"). Ayrı "AI"
 * sekmesi aynı yere gidiyordu; yerini kıyas ürününün ikinci sekmesi Sınavlar aldı.
 *
 * 3 Ekim 2026: "Çalış" sekmesi kalktı. O ekran bütün hazırlıkları ve
 * belgeleri tek programda karıştırıyordu (bir programın altında
 * başka derslerin tekrarları). kıyas ürününde her sınavın yolu yalnız
 * kendi kartında; üçüncü sekme Uygulamalar — bizde Araçlar. Belgeler
 * sekmesi de kalktı (kıyas ürününde yok): Kütüphane'de (13 Kasım 2026'ya kadar adı "Daha fazla").
 */
export const studentBottomTabs: StudentNavItem[] = [
  {
    id: "home",
    href: "/ogretmen",
    label: "Ana Sayfa",
    icon: Home,
    // 13 Kasım 2026: /sohbetler artık Ana Sayfa değil; Kütüphane'deki Geçmiş konuşmalar (LIBRARY_PATHS).
    match: (p) => p === "/dashboard" || p === "/" || p === "/ogretmen" || p.startsWith("/ogretmen/"),
  },
  {
    id: "exams",
    href: "/deneme-sinavlari",
    label: "Sınavlar",
    icon: Target,
    match: (p) => p.startsWith("/deneme-sinavlari"),
  },
  {
    id: "tools",
    href: "/araclar",
    // 8 Kasım 2026: "Araçlar" → "Çalışma Stüdyosu" (sayfanın asıl işi stüdyolar). Telefonun alt menüsünde "Stüdyo".
    label: "Çalışma Stüdyosu",
    shortLabel: "Stüdyo",
    icon: Sparkles,
    match: (p) =>
      p.startsWith("/araclar") ||
      p.startsWith("/studio") ||
      p.startsWith("/quizler") ||
      p.startsWith("/flashcardlar") ||
      p.startsWith("/soru-coz") ||
      p.startsWith("/gunluk"),
  },
  {
    id: "profile",
    href: "/profil",
    label: "Profil",
    icon: User,
    match: (p) => isProfilePath(p),
  },
];

export const studentTopTabs: StudentNavItem[] = studentBottomTabs;

function underAny(path: string, bases: readonly string[]): boolean {
  return bases.some((base) => path === base || path.startsWith(`${base}/`));
}

/**
 * Kütüphane (13 Kasım 2026, Faz 2; eski adı "Daha fazla"): öğrencinin kendi biriktirdikleri. Bu sayfalarda üst
 * çubukta ve telefonun alt çubuğunda Kütüphane etkin görünür, sekmelerden hiçbiri değil.
 */
export const LIBRARY_PATHS = ["/dokumanlar", "/yanlislarim", "/siniflar", "/sohbetler"] as const;

export function isLibraryPath(path: string): boolean {
  return underAny(path, LIBRARY_PATHS);
}

/**
 * Profil panelinin açtığı sayfalar (13 Kasım 2026, Faz 2): telefonda Profil sekmesi bunlarda etkin. Masaüstünde
 * profil sekmesi çubukta değil, kapsül olarak durur.
 */
export const PROFILE_PATHS = [
  "/profil",
  "/ayarlar",
  "/krediler",
  "/ilerleme",
  "/takvimim",
  "/davet",
  "/yardim",
  "/mobil-uygulama",
  "/odemeler",
] as const;

export function isProfilePath(path: string): boolean {
  return underAny(path, PROFILE_PATHS);
}

export const studentMenuGroups: {
  title: string;
  items: { href: string; label: string; icon: typeof MessageCircle }[];
}[] = [
  {
    title: "Çalış",
    items: [
      { href: "/ogretmen", label: CANONICAL_FEATURES.aiTeacher, icon: MessageCircle },
      { href: "/sohbetler", label: "Sohbetler", icon: History },
      { href: "/dokumanlar", label: CANONICAL_FEATURES.studyFromDoc, icon: FileText },
      { href: "/soru-coz", label: CANONICAL_FEATURES.photoSolve, icon: Camera },
      { href: "/studio/quiz", label: CANONICAL_FEATURES.quiz, icon: Gamepad2 },
      { href: "/studio/flashcard", label: CANONICAL_FEATURES.flashcard, icon: Layers },
      { href: "/studio/podcast", label: CANONICAL_FEATURES.podcast, icon: Podcast },
      { href: "/studio/sozlu", label: CANONICAL_FEATURES.oral, icon: Mic },
      { href: "/yanlislarim", label: CANONICAL_FEATURES.mistakeNotebook, icon: NotebookPen },
      { href: "/ilerleme", label: CANONICAL_FEATURES.progress, icon: Sparkles },
      { href: "/siniflar", label: "Çalışma grupları", icon: Users },
      { href: "/davet", label: "Davet et", icon: Sparkles },
    ],
  },
  {
    title: "Sınav",
    items: [
      { href: "/deneme-sinavlari", label: CANONICAL_FEATURES.mockExam, icon: Target },
    ],
  },
  {
    title: "Hesap",
    items: [
      { href: "/krediler", label: "Kullanım limitleri", icon: CreditCard },
      { href: "/pay", label: "Plus'a yükselt", icon: GraduationCap },
      { href: "/profil", label: "Profil", icon: User },
      { href: "/ayarlar", label: "Ayarlar", icon: Settings },
      { href: "/bildirimler", label: "Bildirimler", icon: Bell },
      { href: "/destek", label: "Yardım", icon: HelpCircle },
    ],
  },
];
