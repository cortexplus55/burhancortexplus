"use client";

import { useCallback, useEffect, useState } from "react";
import { dismissGrowth, growthVisible, markGrowthShown, type GrowthPlacement, type GrowthStore } from "@/lib/growth/growth-prompt";

/** `share_prompt_shown`: hak sistemi olaylarıyla aynı yol (PostHog yalnız çerez izniyle yüklü); hata fırlatmaz. */
function trackShown(placement: GrowthPlacement, plan: string): void {
  try {
    const ph = (window as unknown as { posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void } }).posthog;
    ph?.capture?.("share_prompt_shown", { source: "growth", placement, plan });
  } catch {
    // olay kaybolabilir; arayüz etkilenmez
  }
}

function browserStore(): GrowthStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Büyüme yerleşiminin görünürlüğü (Faz 11C). İlk çizimde sunucu ve tarayıcı aynı (gizli); karar tarayıcıda verilir.
 * Görünür olunca `share_prompt_shown` yerleşim başına günde bir kez (kişisel veri yok).
 */
export function useGrowthPrompt(placement: GrowthPlacement, plan: string): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const store = browserStore();
    const now = new Date();
    if (!growthVisible(placement, now, store)) return;
    setVisible(true);
    if (markGrowthShown(placement, now, store)) trackShown(placement, plan);
  }, [placement, plan]);

  const dismiss = useCallback(() => {
    dismissGrowth(placement, new Date(), browserStore());
    setVisible(false);
  }, [placement]);

  return { visible, dismiss };
}
