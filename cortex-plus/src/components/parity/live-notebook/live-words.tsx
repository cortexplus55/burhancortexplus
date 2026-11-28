"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Canlı Defter Modu (28 Kasım 2026): bu bağlam açıkken `RichBody` düz metni kelime kelime (`.lw`), formülü ve
 * vurguyu tek parça (`.lw-atom`, `.lw-hl`) çizer. Bölme metnin kendi ayrıştırıcısından SONRA yapılır; ham TeX
 * ya da Markdown kelimeye bölünmez. Bağlam kapalıyken çıktı bugünküyle aynıdır.
 */
const LiveWordsContext = createContext(false);

export function LiveWords({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return <LiveWordsContext.Provider value={on}>{children}</LiveWordsContext.Provider>;
}

export function useLiveWords(): boolean {
  return useContext(LiveWordsContext);
}
