"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { googleBlockedWebViewApp } from "@/lib/auth/in-app-browser";
import { installPlatform, installSteps, type InstallPlatform } from "@/lib/pwa/install-platform";

/** Tarayıcının kurulum olayı (standart tip kütüphanesinde yok). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const subscribe = () => () => undefined;

function standaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * "Tek tıkla kur" (28 Ekim 2026): Android ve masaüstü Chrome'da tarayıcının kurulum penceresini açar;
 * iOS'ta olay hiç gelmez, Safari'nin "Ana Ekrana Ekle" adımları gösterilir.
 */
export function InstallApp() {
  const platform = useSyncExternalStore<InstallPlatform | null>(
    subscribe,
    () => installPlatform(navigator.userAgent),
    () => null,
  );
  const webviewApp = useSyncExternalStore(subscribe, () => googleBlockedWebViewApp(navigator.userAgent), () => null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    setInstalled(standaloneNow());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      else setDeclined(true);
    } catch {
      setDeclined(true);
    } finally {
      // Olay tek kullanımlık: aynı olayla ikinci kez pencere açılmaz.
      setPrompt(null);
    }
  }

  if (installed) {
    return (
      <div className="mk-card flex items-start gap-3 p-5" role="status">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#4ade80]" aria-hidden />
        <p className="text-sm">Cortex Plus bu cihazda uygulama olarak kurulu. Ana ekranından açabilirsin.</p>
      </div>
    );
  }

  const steps = platform ? installSteps(platform, webviewApp) : [];
  return (
    <div className="flex flex-col gap-4">
      {prompt ? (
        <button
          type="button"
          onClick={() => void install()}
          className="mk-btn-primary inline-flex w-full items-center justify-center gap-2 px-8 py-3 text-base sm:w-auto"
        >
          <Download className="h-5 w-5" aria-hidden />
          Uygulamayı kur
        </button>
      ) : null}
      {declined ? (
        <p className="text-sm text-[var(--mk-muted)]">Kurulum şimdi yapılmadı. İstediğin zaman aşağıdaki adımlarla kurabilirsin.</p>
      ) : null}
      {steps.length ? (
        <div className="mk-card p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="h-4 w-4" aria-hidden />
            {prompt ? "Düğme çalışmazsa elle kur" : "Elle kurulum"}
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-[var(--mk-muted)]">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
