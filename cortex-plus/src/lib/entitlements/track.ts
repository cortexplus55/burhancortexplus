import type { Action, GateReason, Plan } from "@/lib/entitlements/types";

/**
 * Hak sisteminin olayları (Faz 3B'de çağrılır). Depodaki analitik yolu: tarayıcıda PostHog yalnız çerez izniyle
 * yüklenir (`analytics.tsx`); yüklenmemişse olay hiçbir yere gitmez. Hiçbir koşulda hata fırlatmaz.
 */
export type EntitlementEvent = "gate_viewed" | "upgrade_sheet_opened" | "upgrade_clicked";

export type EntitlementEventPayload = {
  action: Action;
  plan: Plan;
  reason: GateReason;
  target?: "plus" | "week" | "sigma";
};

export function track(name: EntitlementEvent, payload: EntitlementEventPayload): void {
  try {
    if (typeof window === "undefined") return;
    const ph = (window as unknown as { posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void } }).posthog;
    ph?.capture?.(name, { source: "entitlements", ...payload });
  } catch {
    // olay kaybolabilir; arayüz etkilenmez
  }
}
