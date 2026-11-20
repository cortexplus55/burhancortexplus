"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSelfFlagPilot } from "@/app/admin/actions";

/**
 * Özellik anahtarını genel olarak açmadan yalnız kurucunun hesabında açar (`metadata.pilot_user_ids`). Düello 9B
 * (`duel.v2`, 15 Kasım 2026): "önce yalnız Burhan". Genel anahtar kapalı kalır; geri almak bu düğmeyle ya da satırdaki
 * Kapat ile (en geç 30 sn, bayrak önbelleği).
 */
export function PilotSelfButton({ flagKey, active, count }: { flagKey: string; active: boolean; count: number }) {
  const [on, setOn] = useState(active);
  const [pilots, setPilots] = useState(count);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--adm-muted)]">
      <span>
        Pilot: {pilots === 0 ? "kimse" : `${pilots} hesap`}
        {on ? " (sen dahil)" : ""}
      </span>
      <button
        type="button"
        className="adm-btn"
        disabled={pending}
        onClick={() => {
          const next = !on;
          startTransition(async () => {
            const result = await setSelfFlagPilot(flagKey, next);
            if (result.ok) {
              setOn(next);
              setPilots(result.pilotCount);
              toast.success(next ? "Yalnız senin hesabında açıldı." : "Senin hesabından kaldırıldı.");
            } else {
              toast.error(result.error);
            }
          });
        }}
      >
        {pending ? "…" : on ? "Benden kaldır" : "Yalnız bende aç (pilot)"}
      </button>
    </div>
  );
}
