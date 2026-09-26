import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Figtree, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Model çıktısındaki LaTeX her yüzeyde render edilebilsin diye kök seviyede.
import "katex/dist/katex.min.css";
// Premium tasarım sistemi (sınıflar; token kaynağı tokens.css).
import "@/styles/premium-design-system.css";
import { Providers } from "@/components/providers";

const figtree = Figtree({
  variable: "--font-ui",
  subsets: ["latin"],
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

const siteTitle = "Cortex Plus — AI destekli öğrenme";
const siteDescription =
  "Sınav hazırlığı, AI öğretmen, quiz ve kişisel çalışma planı — cortexplus.app";

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
        className={`${figtree.variable} ${dmSerif.variable} ${geistSans.variable} ${geistMono.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
