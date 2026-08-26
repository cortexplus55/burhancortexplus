import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Geist, Geist_Mono, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1011" },
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
        className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} ${robotoMono.variable} min-h-screen antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
