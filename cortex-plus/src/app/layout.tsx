import type { Metadata, Viewport } from "next";
import { Caveat, DM_Serif_Display, Figtree, Geist, Geist_Mono, JetBrains_Mono, Jersey_10 } from "next/font/google";
import "./globals.css";
// Model çıktısındaki LaTeX her yüzeyde render edilebilsin diye kök seviyede.
import "katex/dist/katex.min.css";
// Premium tasarım sistemi (sınıflar; token kaynağı tokens.css).
import "@/styles/premium-design-system.css";
import { Providers } from "@/components/providers";

const figtree = Figtree({
  variable: "--font-ui",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/*
 * Astra'nın dört yazı tipi (17 Ekim 2026, ürün sahibinin kararı: birebir): Figtree metin,
 * JetBrains Mono küçük etiketler, Jersey 10 karşılama başlığı, Caveat el yazısı ("hedef puan").
 * Dördü de Google Fonts, serbest lisans. Eşaralıklı etiketler daha önce sistemin kendi
 * yazı tipine (Windows'ta Consolas) düşüyordu; "hedef puan" Segoe Print idi (yalnız Windows).
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const jersey = Jersey_10({
  variable: "--font-pixel-face",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-hand-face",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${figtree.variable} ${dmSerif.variable} ${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${jersey.variable} ${caveat.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
