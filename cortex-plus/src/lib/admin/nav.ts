import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Coins,
  Crown,
  FileText,
  Gauge,
  GraduationCap,
  History,
  LifeBuoy,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  ServerCog,
  ShieldAlert,
  ShieldQuestion,
  Ticket,
  ToggleRight,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/admin-role";

/**
 * Yönetim panelinin menüsü — tek kaynak (6 Kasım 2026: beş kategori).
 *
 * Adlar gündelik Türkçe; İngilizce terim yazılmaz (bekçi: `yonetim-temeli.test.ts`). Her maddenin tek
 * cümlelik karşılığı menüde ipucu, sayfanın başında açıklama olarak görünür.
 *
 * YENİ SAYFA EKLERKEN: uygun kategoriye bir öğe ekleyin. Sayfa yalnız kurucuya açıksa `founderOnly: true`
 * yazın ve sayfada `requireFounderPage()` çağırın; yöneticiye öğe kilitli görünür.
 *
 * `href` değerleri değişmedi: mevcut yer imleri ve bağlantılar kırılmasın.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Menüde ipucu, sayfa başında açıklama olarak kullanılıyor. */
  blurb: string;
  /** Yalnız kurucu: yöneticiye kilitli görünür, sayfa 404 verir. */
  founderOnly?: boolean;
};

export type AdminNavGroup = {
  group: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: "📊 Genel Bakış & Kokpit",
    items: [
      {
        href: "/admin",
        label: "Ana Kokpit",
        icon: LayoutDashboard,
        blurb: "Bütün iş tek ekranda: kayıt ve aktif öğrenci, ücretsizden ücretliye dönüşüm, OpenAI gideri ile gelir ve kâr marjı, karantinadaki sorular ve hata bildirimleri.",
      },
      {
        href: "/admin/maliyetler",
        label: "Birim Ekonomisi & Maliyetler",
        icon: TrendingUp,
        blurb: "Yapay zekâ sağlayıcısına ödenen tahmini tutar. Gelirle karşılaştırmak için.",
      },
      {
        href: "/admin/ai-kullanimi",
        label: "AI Kullanımı",
        icon: Activity,
        blurb: "Hangi işlem ne sıklıkla çalışmış, ne kadar metin işlenmiş.",
      },
    ],
  },
  {
    group: "👥 Kullanıcılar & Ekip",
    items: [
      {
        href: "/admin/kullanicilar",
        label: "Kullanıcı Yönetimi",
        icon: Users,
        blurb: "Hesapları ara, kredi ver ya da al, öğretmen yetkisi değiştir, hesabı askıya al.",
      },
      {
        href: "/admin/yoneticiler",
        label: "Yöneticiler ve Yetkiler",
        icon: Crown,
        blurb: "Panele kimin girebildiği. Kurucu e-postayla var olan bir hesaba yönetici yetkisi verir ya da geri alır; her işlem kayda geçer.",
        founderOnly: true,
      },
      {
        href: "/admin/destek",
        label: "Destek Talepleri",
        icon: LifeBuoy,
        blurb: "Öğrencilerin /destek formundan yazdıkları. Cevap e-postayla gider; burada \"Cevaplandı\" ile süre yazılır.",
      },
      {
        href: "/admin/kotuye-kullanim",
        label: "Kötüye Kullanım",
        icon: ShieldAlert,
        blurb: "Sınırlara takılan, tavanı zorlayan ya da kod deneyen hesaplar. Şimdilik yalnızca kaydediliyor, kimse kendiliğinden engellenmiyor.",
      },
    ],
  },
  {
    group: "💳 Gelir & Paketler",
    items: [
      {
        href: "/admin/odemeler",
        label: "Ödemeler",
        icon: Receipt,
        blurb: "Gelen ödemeleri gör, başarısız olanları incele, iade edileni işaretle.",
      },
      {
        href: "/admin/paketler",
        label: "Paket Fiyatları",
        icon: Package,
        blurb: "Satıştaki planlar ve fiyatları. Fiyat değişikliği herkesi anında etkiler; yalnız kurucu değiştirir.",
        founderOnly: true,
      },
      {
        href: "/admin/kredi-kurallari",
        label: "Kredi Kuralları",
        icon: Coins,
        blurb: "Her işlemin öğrenciden kaç kredi yaktığı. Buradaki sayı doğrudan faturayı etkiler; yalnız kurucu değiştirir.",
        founderOnly: true,
      },
      {
        href: "/admin/promosyonlar",
        label: "Promosyon ve Hediye Kodları",
        icon: Ticket,
        blurb: "Ana ekrandaki duyuru bandı, hediye kredi kodları ve beta kodları (Plus denemesi). Bant, verdiğin bitiş tarihinde kendiliğinden kaybolur.",
      },
    ],
  },
  {
    group: "📚 İçerik & Kalite",
    items: [
      {
        href: "/admin#karantina",
        label: "Karantina ve Soru Bildirimleri",
        icon: ShieldQuestion,
        blurb: "Kokpitteki kalite bölümü: saatlik denetimin kenara aldığı havuz soruları ve öğrencilerin hata bildirimleri.",
      },
      {
        href: "/admin/ders-hatalari",
        label: "Ders Hataları",
        icon: AlertTriangle,
        blurb: "Ders üretimi neden düştü: kaynak, kalite kapısı, sağlayıcı. Türkiye saatiyle.",
      },
      {
        href: "/admin/yanit-oylari",
        label: "Yanıt Oyları",
        icon: MessageSquare,
        blurb: "Öğrencilerin işine yaramadı dediği yanıtlar. Talimatları nereden düzelteceğini burası söylüyor.",
      },
      {
        href: "/admin/promptlar",
        label: "İstemler",
        icon: FileText,
        blurb: "Yapay zekâya verilen yönergeler. Öğretmenin nasıl anlattığını bunlar belirliyor.",
      },
      {
        href: "/admin/anket",
        label: "Haftalık Anket",
        icon: ClipboardList,
        blurb: "Öğrencilerin haftalık kısa ankete cevapları: ne kadar yardımcı oldu, önerir mi, en çok neyi kullandı, ne değişsin.",
      },
      {
        href: "/admin/beta",
        label: "Beta Ölçütleri",
        icon: Gauge,
        blurb: "Kapalı betadan lansmana geçiş için altı ölçüt: atılan kavram, ders açılış süreleri, ödeme başarısı, destek cevabı, Sentry.",
      },
    ],
  },
  {
    group: "⚙️ Sistem & Güvenlik",
    items: [
      {
        href: "/admin/sistem",
        label: "Sistem Sağlığı",
        icon: ServerCog,
        blurb: "Veritabanı, e-posta ve ödeme bağlantıları çalışıyor mu.",
      },
      {
        href: "/admin/feature-flags",
        label: "Özellik Anahtarları",
        icon: ToggleRight,
        blurb: "Bir özelliği tüm kullanıcılara açıp kapatan anahtarlar. Etkisi anında; yalnız kurucu değiştirir.",
        founderOnly: true,
      },
      {
        href: "/admin/audit-log",
        label: "İşlem Kayıtları",
        icon: History,
        blurb: "Bu panelde kim, ne zaman, neyi değiştirdi.",
      },
      {
        href: "/admin/adaptive",
        label: "Uyarlamalı Öğrenme Hata Ayıklama",
        icon: Activity,
        blurb: "Öğrenci bazında Jev kararları, yedek yola düşme oranı, oturum ve plan sürümü.",
      },
      {
        href: "/admin/ogretmen-basvurulari",
        label: "Öğretmen Başvuruları",
        icon: GraduationCap,
        blurb: "Ürün yalnız öğrenciye dönmeden önce gelmiş başvurular. Yenisi gelmiyor; onaylamak yalnızca test sınırını yükseltiyor.",
      },
    ],
  },
];

/** Menü dışı sayfaların başlığı (kapı). */
export const ADMIN_GATE_NAV: AdminNavItem = {
  href: "/admin/kapi",
  label: "🔐 Kurucu Yönetim Girişi",
  icon: Crown,
  blurb: "Panele girmeden önce kurucunun belirlediği PIN istenir. Doğrulanınca bu cihazda 12 saat geçerli.",
};

/** Sayfa başlığı ve açıklaması için tek kaynak (ilk eşleşme; "/admin" Ana Kokpit'tir). */
export function adminNavItem(href: string): AdminNavItem | null {
  if (href === ADMIN_GATE_NAV.href) return ADMIN_GATE_NAV;
  for (const group of ADMIN_NAV) {
    const hit = group.items.find((item) => item.href === href);
    if (hit) return hit;
  }
  return null;
}

/** Bu rol öğeyi açabilir mi. */
export function canOpenAdminItem(item: Pick<AdminNavItem, "founderOnly">, role: AdminRole): boolean {
  return !item.founderOnly || role === "founder";
}
