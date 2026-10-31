"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { inAppBrowserApp } from "@/lib/auth/in-app-browser";
import "@/styles/in-app-browser-banner.css";

/*
 * Uygulamanın tarayıcısı önerisi (31 Ekim 2026, ürün sahibinin kararı): öğrenci sosyal medyadan
 * geliyor (Instagram, WhatsApp grubu). Instagram / Facebook / TikTok / WhatsApp'ın kendi
 * tarayıcısında podcast sesi yarıda kesiliyor, dosya seçici ve kamera kısıtlı. Sitenin başında ince
 * bir şerit "tarayıcıda aç" der; kapatılınca bu oturumda yeniden çıkmaz.
 *
 * Sunucuda ve hidrasyonda hiçbir şey çizilmez (tarayıcı kimliği yalnız tarayıcıda okunur, iki çizim
 * aynı kalsın); karar etkide verilir. Kök yerleşimde bir kez: pazarlama, kayıt ve uygulama sayfaları.
 */

export const IN_APP_BANNER_DISMISS_KEY = "cp:in-app-banner-dismissed";
export const IN_APP_BANNER_TEXT =
  "🌐 En iyi ses ve yükleme deneyimi için sağ üstten 'Tarayıcıda (Safari/Chrome) Aç'a dokun";

function dismissedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(IN_APP_BANNER_DISMISS_KEY) === "1";
  } catch {
    // Gizli pencere ya da engellenmiş site verisi: şerit yine gösterilir, kapatma bu sayfada geçerli.
    return false;
  }
}

export function InAppBrowserBanner() {
  const [app, setApp] = useState<string | null>(null);

  useEffect(() => {
    if (dismissedThisSession()) return;
    setApp(inAppBrowserApp(window.navigator.userAgent));
  }, []);

  if (!app) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(IN_APP_BANNER_DISMISS_KEY, "1");
    } catch {
      // Yazılamadıysa yalnız bu sayfada kapanır.
    }
    setApp(null);
  }

  return (
    <aside className="cp-inapp-banner" aria-label={`${app} tarayıcısı önerisi`}>
      <p className="cp-inapp-banner__text">{IN_APP_BANNER_TEXT}</p>
      <button type="button" className="cp-inapp-banner__close" aria-label="Öneriyi kapat" onClick={dismiss}>
        <X className="cp-inapp-banner__icon" aria-hidden />
      </button>
    </aside>
  );
}
