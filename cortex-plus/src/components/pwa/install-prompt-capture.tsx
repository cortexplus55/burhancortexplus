"use client";

import { useEffect } from "react";
import { useInstallPrompt } from "@/lib/pwa/install-prompt";
import { writeInstallCardMemory } from "@/lib/pwa/install-card";

/**
 * Öğrenci kabuğunda bir kez (20 Kasım 2026, Faz 8): tarayıcının kurulum olayını sayfa geçişlerinde de saklar
 * (`install-prompt.ts`) ve kurulum görülünce "Telefonuna Uygulama Gibi Ekle" kartını bu cihazda kalıcı olarak
 * kapatır. Hiçbir şey çizmez.
 */
export function InstallPromptCapture() {
  const { installed } = useInstallPrompt();
  useEffect(() => {
    if (installed) writeInstallCardMemory({ installed: true });
  }, [installed]);
  return null;
}
