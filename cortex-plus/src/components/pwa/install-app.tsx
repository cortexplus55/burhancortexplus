"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { googleBlockedWebViewApp } from "@/lib/auth/in-app-browser";
import { installPlatform, installSteps, type InstallPlatform } from "@/lib/pwa/install-platform";
import { isStandaloneDisplay, promptInstall, useInstallPrompt } from "@/lib/pwa/install-prompt";

const subscribe = () => () => undefined;

/**
 * "Tek tıkla kur" (28 Ekim 2026): Android ve masaüstü Chrome'da tarayıcının kurulum penceresini açar;
 * iOS'ta olay hiç gelmez, Safari'nin "Ana Ekrana Ekle" adımları gösterilir.
 *
 * Kurulum olayı ortak depodan (20 Kasım 2026, Faz 8, `install-prompt.ts`): öğrenci kabuğunda daha önce yakalanan olay
 * bu sayfaya sayfa yenilenmeden gelinse de kullanılır; hazırlık sayfasındaki kartla aynı olay.
 */
export function InstallApp() {
  const platform = useSyncExternalStore<InstallPlatform | null>(
    subscribe,
    () => installPlatform(navigator.userAgent),
    () => null,
  );
  const webviewApp = useSyncExternalStore(subscribe, () => googleBlockedWebViewApp(navigator.userAgent), () => null);
  const standalone = useSyncExternalStore(subscribe, isStandaloneDisplay, () => false);
  const { prompt, installed: installedNow } = useInstallPrompt();
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  // Mobil uygulamanın içinde (26 Kasım 2026) kurulum gerekmez.
  const installed = standalone || installedNow || accepted || platform === "app";

  async function install() {
    // Olay tek kullanımlık: depo pencereyi açmadan önce siler, aynı olayla ikinci kez pencere açılmaz.
    const outcome = await promptInstall();
    if (outcome === "accepted") setAccepted(true);
    else if (outcome === "dismissed") setDeclined(true);
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
