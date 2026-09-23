import {
  Bell,
  BookOpen,
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
  icon: typeof MessageCircle;
  match: (path: string) => boolean;
};

/** Canonical feature labels — marketing + app aynı isimleri kullanır. */
export const CANONICAL_FEATURES = {
  aiTeacher: "AI Öğretmen",
  studyFromDoc: "Kendi Belgemden Çalış",
  quiz: "Quiz",
  flashcard: "Flashcard",
  podcast: "Podcast",
  oral: "Sözlü Sınav",
  mockExam: "Deneme Sınavı",
  photoSolve: "Fotoğraftan Çözüm",
  mistakeNotebook: "Yanlışlar Defteri",
  studyPlan: "Çalışma Planı",
  progress: "İlerleme Analizi",
} as const;

/** Ana Sayfa · Çalış · AI · Belgeler · Profil */
export const studentBottomTabs: StudentNavItem[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Ana Sayfa",
    icon: Home,
    match: (p) => p === "/dashboard" || p === "/",
  },
  {
    id: "study",
    href: "/calisma-plani",
    label: "Çalış",
    icon: BookOpen,
    match: (p) =>
      p.startsWith("/calisma-plani") ||
      p.startsWith("/gunluk") ||
      p.startsWith("/yanlislarim") ||
      p.startsWith("/studio"),
  },
  {
    id: "ai",
    href: "/ogretmen",
    label: "AI",
    icon: MessageCircle,
    match: (p) =>
      p === "/ogretmen" ||
      p.startsWith("/ogretmen/") ||
      p.startsWith("/sohbetler"),
  },
  {
    id: "docs",
    href: "/dokumanlar",
    label: "Belgeler",
    icon: FileText,
    match: (p) => p.startsWith("/dokumanlar"),
  },
  {
    id: "profile",
    href: "/profil",
    label: "Profil",
    icon: User,
    match: (p) =>
      p.startsWith("/profil") ||
      p.startsWith("/ayarlar") ||
      p.startsWith("/krediler"),
  },
];

export const studentTopTabs: StudentNavItem[] = studentBottomTabs;

export const studentMenuGroups: {
  title: string;
  items: { href: string; label: string; icon: typeof MessageCircle }[];
}[] = [
  {
    title: "Çalış",
    items: [
      { href: "/dashboard", label: "Ana Sayfa", icon: Home },
      { href: "/ogretmen", label: CANONICAL_FEATURES.aiTeacher, icon: MessageCircle },
      { href: "/sohbetler", label: "Sohbetler", icon: History },
      { href: "/dokumanlar", label: CANONICAL_FEATURES.studyFromDoc, icon: FileText },
      { href: "/soru-coz", label: CANONICAL_FEATURES.photoSolve, icon: Camera },
      { href: "/studio/quiz", label: CANONICAL_FEATURES.quiz, icon: Gamepad2 },
      { href: "/studio/flashcard", label: CANONICAL_FEATURES.flashcard, icon: Layers },
      { href: "/studio/podcast", label: CANONICAL_FEATURES.podcast, icon: Podcast },
      { href: "/studio/sozlu", label: CANONICAL_FEATURES.oral, icon: Mic },
      { href: "/yanlislarim", label: CANONICAL_FEATURES.mistakeNotebook, icon: NotebookPen },
      { href: "/calisma-plani", label: CANONICAL_FEATURES.studyPlan, icon: BookOpen },
      { href: "/ilerleme", label: CANONICAL_FEATURES.progress, icon: Sparkles },
      { href: "/siniflar", label: "Sınıflar", icon: Users },
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
      { href: "/krediler", label: "Limitler", icon: CreditCard },
      { href: "/pay", label: "Plus'a yükselt", icon: GraduationCap },
      { href: "/profil", label: "Profil", icon: User },
      { href: "/ayarlar", label: "Ayarlar", icon: Settings },
      { href: "/bildirimler", label: "Bildirimler", icon: Bell },
      { href: "/destek", label: "Yardım", icon: HelpCircle },
    ],
  },
];
