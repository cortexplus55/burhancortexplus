"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { extendSubscription } from "@/app/admin/actions";

/** Etkin aboneliği N gün uzatma (plan 4.5). Denetim günlüğüne yazılır. */
export function SubscriptionExtend({ userId }: { userId: string }) {
  const [days, setDays] = useState("7");
  const [pending, startTransition] = useTransition();
  const value = Number(days);
  const ready = Number.isInteger(value) && value >= 1 && value <= 365;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={365}
        value={days}
        onChange={(event) => setDays(event.target.value)}
        aria-label="Uzatılacak gün"
        className="adm-input w-20"
      />
      <button
        type="button"
        className="adm-btn"
        disabled={pending || !ready}
        onClick={() =>
          startTransition(async () => {
            const result = await extendSubscription({ userId, days: value });
            if (result.ok) toast.success(result.message);
            else toast.error(result.error);
          })
        }
      >
        Gün uzat
      </button>
    </div>
  );
}
