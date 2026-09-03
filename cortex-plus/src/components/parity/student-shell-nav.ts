import {
  Wrench,
  Bell,
  BookOpen,
  Camera,
  CreditCard,
  FileText,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutGrid,
  MessageCircle,
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

export const studentBottomTabs: StudentNavItem[] = [
  {
    id: "sor",
    href: "/ogretmen",
    label: "Sor",
    icon: MessageCircle,
    match: (p) => p === "/ogretmen" || p.startsWith("/ogretmen/"),
  },
  {
    id: "sinavlar",
    href: "/deneme-sinavlari",
    label: "Sınavlar",
    icon: Target,
    match: (p) => p.startsWith("/deneme-sinavlari"),
  },
  {
    id: "araclar",
    href: "/araclar",
    label: "Araçlar",
    icon: Wrench,
    match: (p) => p === "/araclar" || p.startsWith("/araclar/"),
  },
];

export const studentTopTabs: StudentNavItem[] = [
  {
    id: "sor",
    href: "/ogretmen",
    label: "Sor",
    icon: MessageCircle,
    match: (p) => p === "/ogretmen" || p.startsWith("/ogretmen/"),
  },
  {
    id: "sinav",
    href: "/deneme-sinavlari",
    label: "Sınav hazırlığı",
    icon: Target,
    match: (p) => p.startsWith("/deneme-sinavlari") || p.startsWith("/sinav-hazirligi"),
  },
  {
    id: "araclar",
    href: "/araclar",
    label: "Araçlar",
    icon: Wrench,
    match: (p) => p === "/araclar" || p.startsWith("/araclar/"),
  },
];

export const studentMenuGroups: {
  title: string;
  items: { href: string; label: string; icon: typeof MessageCircle }[];
}[] = [
  {
    title: "Çalış",
    items: [
      { href: "/ogretmen", label: "Yeni sohbet", icon: MessageCircle },
      { href: "/sohbetler", label: "Sohbetler", icon: History },
      { href: "/soru-coz", label: "Fotoğraftan çöz", icon: Camera },
      { href: "/dokumanlar", label: "Dokümanlar", icon: FileText },
      { href: "/studio/quiz", label: "Quiz", icon: Gamepad2 },
      { href: "/studio/flashcard", label: "Flashcard", icon: Layers },
      { href: "/calisma-plani", label: "Çalışma planı", icon: BookOpen },
      { href: "/siniflar", label: "Sınıflar", icon: Users },
      { href: "/davet", label: "Davet et", icon: Sparkles },
      { href: "/ilerleme", label: "İlerleme", icon: Sparkles },
      { href: "/dashboard", label: "Panel", icon: LayoutGrid },
    ],
  },
  {
    title: "Sınav",
    items: [{ href: "/deneme-sinavlari", label: "Deneme sınavı", icon: Target }],
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
