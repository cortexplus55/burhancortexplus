"use client";

import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@/components/analytics";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
      <Toaster richColors closeButton position="top-center" />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </ThemeProvider>
  );
}
