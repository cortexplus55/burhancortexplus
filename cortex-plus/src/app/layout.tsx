import type { Metadata, Viewport } from "next";
import { Figtree, Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
// KaTeX biçimi kök düzende değil (6 Kasım 2026): formül çizen bileşenler kendisi alır (`math-text.ts`,
// `MathText`, `RichBody`, `Markdown`, `ExamLessonBody*`, video tahtası); pazarlama sayfaları yüklemez.
// Premium tasarım sistemi (sınıflar; token kaynağı tokens.css).
import "@/styles/premium-design-system.css";
// Telefonda dokunma alanı tabanı 36 px (6 Kasım 2026 mobil denetimi): her sayfada geçerli tek kural.
import "@/styles/mobile-tap-targets.css";
import { Providers } from "@/components/providers";
import { InAppBrowserBanner } from "@/components/layout/in-app-browser-banner";
import { logSchemaGaps } from "@/lib/admin/schema-probe";

const figtree = Figtree({
  variable: "--font-ui",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/*
 * Yazı tipleri: Figtree metin, JetBrains Mono küçük etiketler. Jersey 10 (piksel karşılama başlığı) 13 Kasım
 * 2026'da kalktı: tasarım sistemi v1 piksel yazıyı yasaklıyor (ürün sahibinin kararı 4). Caveat (el yazısı:
 * "hedef puan", "Ezber kodu") aynı gün ürün sahibinin kararıyla kalktı: "hedef puan" mono, ezber kodu metin
 * yazı tipinde. İkisi de Google Fonts, serbest lisans. Eşaralıklı etiketler daha önce sistemin kendi
 * yazı tipine (Windows'ta Consolas) düşüyordu; "hedef puan" Segoe Print idi (yalnız Windows).
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/*
 * Tırnaklı başlık yazısı (DM Serif Display) 6 Kasım 2026'da tümden kalktı: kök öğeye `--font-display`
 * değişkenini bağlıyor ve tokens.css'teki Figtree değerini eziyordu; /ornek, kayıt ve sohbet başlıkları
 * hâlâ tırnaklı görünüyordu (19 Ekim kararı). `--font-display` artık `--font-ui`.
 */

/** Fallback chain in CSS; body uses Figtree via `--font-ui`. */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 19 Ekim 2026: başlık ürünün ne yaptığını söyler (arama sonucunda ve sekmede görünen ilk satır).
const siteTitle = "Cortex Plus — Ders notundan sınav hazırlığı";
const siteDescription =
  "Ders notunu yükle; ders, podcast, test ve sözlü pratik senin notundan hazırlansın. Sınav hazırlığı için AI öğretmen — cortexplus.app";

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: "%s | Cortex Plus",
  },
  description: siteDescription,
  metadataBase: new URL("https://cortexplus.app"),
  manifest: "/manifest.webmanifest",
  applicationName: "Cortex Plus",
  // Ana ekrandan açılınca tam ekran (28 Ekim 2026, /mobil-uygulama). Simge `apple-icon.png` (180 px, opak).
  appleWebApp: {
    capable: true,
    title: "Cortex Plus",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Eski iOS sürümleri yalnız bu adı okuyor; Next 15 `mobile-web-app-capable` yazıyor.
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "https://cortexplus.app",
    siteName: "Cortex Plus",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
  // Klavye açılınca sayfa küçülsün (31 Ekim 2026, Paket J1 #6): sohbet, sözlü ve denemede alttaki düğmeler klavyenin
  // altında kalıyordu; `100dvh` tek başına Android Chrome'da klavyeyi saymıyor. iOS Safari bu ayarı yok sayar, odaktaki
  // alanı zaten görünür kaydırır.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  logSchemaGaps();
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${figtree.variable} ${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        <Providers>
          {/* Instagram / Facebook / TikTok / WhatsApp tarayıcısında "tarayıcıda aç" şeridi (31 Ekim 2026). */}
          <InAppBrowserBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
