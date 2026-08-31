"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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
  // `||`: the var is usually present but empty, which `??` would pass through
  // as an empty api_host.
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

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
          });
          window.posthog = posthog as unknown as Window["posthog"];
        }
        window.posthog?.capture("$pageview", { path: pathname });
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
