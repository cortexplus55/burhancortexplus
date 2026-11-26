"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp, useNetworkStatus } from "@/lib/platform/native";
import { appUrlPath } from "@/lib/platform/native-links";
import { initNativePush } from "@/lib/platform/native-push";
import { OfflineBar } from "@/components/native/offline-bar";
import "@/styles/native-app.css";

/**
 * Mobil uygulamanın açılışı (26 Kasım 2026, Aşama 1). Kök düzende bir kez; web'de hiçbir şey yapmaz ve çizmez.
 *
 * - Açılış ekranı sayfa hazır olunca kapanır (yapılandırmadaki 2,5 sn yalnız emniyet).
 * - Durum çubuğu koyu zeminde açık yazı.
 * - Android geri tuşu: geçmiş varsa bir sayfa geri, yoksa uygulama arka plana alınır (kapanmaz).
 * - Uygulamayı açan bağlantı (bildirim, evrensel bağlantı) kendi alan adımızsa o sayfa açılır.
 * - Anlık bildirim dinleyicileri; izin daha önce verilmişse cihaz kaydı yenilenir.
 * - Bağlantı kopunca üstte "Bağlantı koptu — tekrar dene" çubuğu.
 */
export function NativeBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    const cleanups: (() => void)[] = [];
    let active = true;
    const navigate = (path: string) => router.push(path);

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        /* yapılandırmadaki süre dolunca kendiliğinden kapanır */
      }
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* durum çubuğu süs */
      }
      try {
        const { App } = await import("@capacitor/app");
        const back = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else void App.minimizeApp();
        });
        const open = await App.addListener("appUrlOpen", ({ url }) => {
          const path = appUrlPath(url);
          if (path) navigate(path);
        });
        if (active) cleanups.push(() => void back.remove(), () => void open.remove());
        else {
          void back.remove();
          void open.remove();
        }
      } catch {
        /* uygulama eklentisi yoksa varsayılan davranış */
      }
      await initNativePush(navigate);
    })();

    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [router]);

  return <NativeOfflineLayer />;
}

function NativeOfflineLayer() {
  const status = useNetworkStatus();
  if (!status.checked || status.online || !isNativeApp()) return null;
  return <OfflineBar />;
}
