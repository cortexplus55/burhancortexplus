"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sanitizeAnalyticsProperties, scrubPath } from "@/lib/analytics/scrub";

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      init: (key: string, options: Record<string, unknown>) => void;
    };
  }
}

/**
 * PostHog is loaded only when a public key is configured, so local and CI runs
 * stay free of third-party requests.
 */
export function Analytics() {
  const pathname = usePathname();
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  useEffect(() => {
    if (!key) return;
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
        }
        window.posthog?.capture("$pageview", { path: scrubPath(pathname ?? "/") });
      })
      .catch(() => {
        /* analytics must never break the app */
      });

    return () => {
      cancelled = true;
    };
  }, [key, host, pathname]);

  return null;
}
