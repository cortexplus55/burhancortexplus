"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { markSupportAnswered } from "@/app/admin/support-actions";

/** "Cevaplandı": cevap e-postayla gittikten sonra basılır; süre buradan ölçülür. */
export function SupportAnsweredButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="adm-btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markSupportAnswered(requestId);
          if (result.ok) toast.success("Cevaplandı olarak işaretlendi.");
          else toast.error(result.error ?? "Kaydedilemedi.");
        })
      }
    >
      {pending ? "…" : "Cevaplandı"}
    </button>
  );
}
