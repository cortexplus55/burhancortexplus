import type { Metadata, Viewport } from "next";
import { Figtree, Geist, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";
// Model çıktısındaki LaTeX her yüzeyde render edilebilsin diye kök seviyede.
import "katex/dist/katex.min.css";
// Premium tasarım sistemi (token + bileşenler) — bkz. dosyanın başındaki not.
import "@/styles/premium-design-system.css";
import { Providers } from "@/components/providers";

const figtree = Figtree({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

// Astra'nın gövde fontuyla (Figtree) birebir aynı fontu kullanıyorduk —
// "kendi kimliğimiz" kararının en somut karşılığı burada: başlıklar artık
// Astra'da hiç kullanılmayan, daha geometrik/kendinden emin bir yüz alıyor.
// Gövde metni şimdilik Figtree'de kalıyor — bunu da değiştirmek 30+ sayfayı
// tek seferde etkiler, ayrı bir faz olarak planlandı.
const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
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

export const metadata: Metadata = {
  title: {
    default: "Cortex Plus — AI destekli öğrenme",
    template: "%s | Cortex Plus",
  },
  description:
    "Sınav hazırlığı, AI öğretmen, quiz ve kişisel çalışma planı — cortexplus.app",
  metadataBase: new URL("https://cortexplus.app"),
  manifest: "/manifest.webmanifest",
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
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
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
        className={`${figtree.variable} ${sora.variable} ${geistSans.variable} ${geistMono.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
