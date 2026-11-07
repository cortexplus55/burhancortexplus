"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { sanitizeAnalyticsProperties, scrubPath } from "@/lib/analytics/scrub";
import {
  COOKIE_CONSENT_EVENT,
  clearAnalyticsStorage,
  hasAnalyticsConsent,
  type CookieConsent,
} from "@/lib/consent/cookie-consent";

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      init: (key: string, options: Record<string, unknown>) => void;
      opt_in_capturing?: () => void;
      opt_out_capturing?: () => void;
      reset?: () => void;
    };
  }
}

/**
 * PostHog yalnız iki koşulda yüklenir: ortamda bir anahtar var ve ziyaretçi analitik çerezlere izin verdi
 * (7 Kasım 2026, uyum paketi; Kurul'un çerez rehberi: zorunlu olmayan çerez rızadan ÖNCE yüklenmez). İzin geri
 * alınınca ölçüm durur, PostHog'un çerezi ve tarayıcı kayıtları silinir. Yerel ve CI çalışmaları üçüncü taraf
 * isteğinden zaten muaf (anahtar yok).
 */
export function Analytics() {
  const pathname = usePathname();
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const consented = hasAnalyticsConsent();
    setAllowed(consented);
    // Bu sürümden önce izinsiz yazılmış PostHog izleri (7 Kasım 2026, canlıda görüldü): izin yoksa açılışta silinir.
    if (!consented) clearAnalyticsStorage();
    const onChange = (event: Event) => {
      const consent = (event as CustomEvent<CookieConsent>).detail;
      const next = consent?.a === true;
      setAllowed(next);
      if (!next && window.posthog) {
        window.posthog.opt_out_capturing?.();
        window.posthog.reset?.();
        clearAnalyticsStorage();
      }
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!key || !allowed) return;
    let cancelled = false;

    import("posthog-js")
      .then(({ default: posthog }) => {
        if (cancelled) return;
        if (!window.posthog) {
          posthog.init(key, {
            api_host: host,
            capture_pageview: false,
            person_profiles: "identified_only",
            // Anketi kendimiz soruyoruz (/api/feedback/weekly); PostHog'un anket betiği her sayfada
            // boşuna yükleniyor ve güvenlik politikasına takılıyordu (20 Ekim 2026).
            disable_surveys: true,
            // Gizlilik (6 Kasım 2026, 360° denetim): çocuklara hizmet veren bir ürün. Tıklama ve form
            // içeriği otomatik toplanmaz, oturum kaydı yok; adreslerdeki belirteç ve kodlar silinir.
            autocapture: false,
            disable_session_recording: true,
            mask_all_text: true,
            mask_all_element_attributes: true,
            before_send: (event) => {
              if (!event) return event;
              if (event.properties) event.properties = sanitizeAnalyticsProperties(event.properties);
              if (event.$set) event.$set = sanitizeAnalyticsProperties(event.$set);
              if (event.$set_once) event.$set_once = sanitizeAnalyticsProperties(event.$set_once);
              return event;
            },
          });
          window.posthog = posthog as unknown as Window["posthog"];
        } else {
          // Aynı sayfada izin önce geri alınıp sonra yeniden verildiyse.
          window.posthog.opt_in_capturing?.();
        }
        window.posthog?.capture("$pageview", { path: scrubPath(pathname ?? "/") });
      })
      .catch(() => {
        /* analytics must never break the app */
      });

    return () => {
      cancelled = true;
    };
  }, [key, host, pathname, allowed]);

  return null;
}
