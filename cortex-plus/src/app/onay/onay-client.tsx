"use client";

import { ConsentGateDialog } from "@/components/legal/consent-gate";
import type { MissingConsent } from "@/lib/legal/consent-evidence";

/** Onay ekranı: onay kapısının penceresi sayfa olarak; onaydan sonra `next`e tam sayfa geçiş (kabuk taze okunur). */
export function OnayClient({ state, next }: { state: { missing: MissingConsent[]; ageNeeded: boolean }; next: string }) {
  return (
    <ConsentGateDialog
      state={state}
      onDone={() => {
        window.location.assign(next);
      }}
    />
  );
}
