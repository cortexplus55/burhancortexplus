import {
  Activity,
  Coins,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  ServerCog,
  Ticket,
  ToggleRight,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Yönetim panelinin menüsü.
 *
 * Adlar bilerek gündelik Türkçe. Eskiden "Feature flag", "Audit log",
 * "Promptlar" yazıyordu; bu terimler yazılımcı olmayan birine hiçbir şey
 * söylemiyor. Her maddenin bir de tek cümlelik karşılığı var — menüde ve
 * sayfanın başında aynı cümle görünüyor, böylece nereye geldiğini iki kez
 * okumadan anlıyorsun.
 *
 * `href` değerleri değişmedi: mevcut yer imleri ve bağlantılar kırılmasın.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Menüde ipucu, sayfa başında açıklama olarak kullanılıyor. */
  blurb: string;
};

export type AdminNavGroup = {
  group: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: "Genel",
    items: [
      {
        href: "/admin",
        label: "Özet",
        icon: LayoutDashboard,
        blurb: "Sistemin bugünkü durumu tek ekranda: kaç kişi var, ne kadar gelir geldi, bekleyen iş var mı.",
      },
    ],
  },
  {
    group: "Kişiler",
    items: [
      {
        href: "/admin/kullanicilar",
        label: "Kullanıcılar",
        icon: Users,
        blurb: "Hesapları ara, kredi ver ya da al, yetki değiştir, hesabı askıya al.",
      },
      {
        href: "/admin/ogretmen-basvurulari",
        label: "Öğretmen başvuruları",
        icon: GraduationCap,
        blurb: "Öğretmen olmak için başvuranların belgesini incele, onayla ya da reddet.",
      },
    ],
  },
  {
    group: "Para",
    items: [
      {
        href: "/admin/odemeler",
        label: "Ödemeler",
        icon: Receipt,
        blurb: "Gelen ödemeleri gör, başarısız olanları incele, iade edileni işaretle.",
      },
      {
        href: "/admin/paketler",
        label: "Paketler",
        icon: Package,
        blurb: "Satıştaki planlar ve fiyatları. Fiyat değişikliği herkesi anında etkiler.",
      },
      {
        href: "/admin/promosyonlar",
        label: "Kampanyalar",
        icon: Ticket,
        blurb: "Ana ekrandaki duyuru bandı ve hediye kredi kodları. Bant, verdiğin bitiş tarihinde kendiliğinden kaybolur.",
      },
    ],
  },
  {
    group: "Yapay zekâ",
    items: [
      {
        href: "/admin/kredi-kurallari",
        label: "Kredi bedelleri",
        icon: Coins,
        blurb: "Her işlemin öğrenciden kaç kredi yaktığı. Buradaki sayı doğrudan faturayı etkiler.",
      },
      {
        href: "/admin/ai-kullanimi",
        label: "AI kullanımı",
        icon: Activity,
        blurb: "Hangi işlem ne sıklıkla çalışmış, ne kadar metin işlenmiş.",
      },
      {
        href: "/admin/maliyetler",
        label: "Giderler",
        icon: TrendingUp,
        blurb: "Yapay zekâ sağlayıcısına ödenen tahmini tutar. Gelirle karşılaştırmak için.",
      },
      {
        href: "/admin/yanit-oylari",
        label: "Yanıt oyları",
        icon: MessageSquare,
        blurb: "Öğrencilerin işine yaramadı dediği yanıtlar. Talimatları nereden düzelteceğini burası söylüyor.",
      },
      {
        href: "/admin/promptlar",
        label: "AI talimatları",
        icon: FileText,
        blurb: "Yapay zekâya verilen yönergeler. Öğretmenin nasıl anlattığını bunlar belirliyor.",
      },
    ],
  },
  {
    group: "Sistem",
    items: [
      {
        href: "/admin/feature-flags",
        label: "Özellik anahtarları",
        icon: ToggleRight,
        blurb: "Bir özelliği tüm kullanıcılara açıp kapatan anahtarlar. Etkisi anında.",
      },
      {
        href: "/admin/audit-log",
        label: "İşlem geçmişi",
        icon: History,
        blurb: "Bu panelde kim, ne zaman, neyi değiştirdi.",
      },
      {
        href: "/admin/sistem",
        label: "Sistem durumu",
        icon: ServerCog,
        blurb: "Veritabanı, e-posta ve ödeme bağlantıları çalışıyor mu.",
      },
    ],
  },
];

/** Sayfa başlığı ve açıklaması için tek kaynak. */
export function adminNavItem(href: string): AdminNavItem | null {
  for (const group of ADMIN_NAV) {
    const hit = group.items.find((item) => item.href === href);
    if (hit) return hit;
  }
  return null;
}
