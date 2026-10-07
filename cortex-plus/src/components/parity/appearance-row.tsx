"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", label: "Açık", Icon: Sun },
  { id: "dark", label: "Koyu", Icon: Moon },
  { id: "system", label: "Sistem", Icon: Monitor },
] as const;

/**
 * Profil menüsündeki "Görünüm" satırı — Astra'da tema seçimi profil
 * menüsünde duruyor; bizde yalnızca Ayarlar sayfasındaydı.
 */
export function AppearanceRow() {
  const { theme, setTheme } = useTheme();
  // Tema istemcide okunuyor; sunucu çiziminde seçili düğme gösterilmez.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div className="cp-pp-appearance">
      <span className="cp-pp-appearance-label">
        <Moon className="h-4 w-4" aria-hidden />
        Görünüm
      </span>
      <div className="cp-pp-appearance-options" role="radiogroup" aria-label="Görünüm">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            className={cn(current === id && "is-on")}
            onClick={() => setTheme(id)}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
