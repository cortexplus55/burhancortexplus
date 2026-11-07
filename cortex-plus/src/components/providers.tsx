"use client";

import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@/components/analytics";
import { CookieBanner } from "@/components/legal/cookie-banner";
import { ConsentGate } from "@/components/legal/consent-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
      <Toaster richColors closeButton position="top-center" />
      {/*
        Uyum paketi (7 Kasım 2026): çerez bandı (zorunlu olmayan çerez izinden önce yüklenmez) ve girişten sonra
        eksik onayı isteyen kapı. İkisi de oturumsuz ziyaretçide sunucuya istek atmaz.
      */}
      <CookieBanner />
      <ConsentGate />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </ThemeProvider>
  );
}
