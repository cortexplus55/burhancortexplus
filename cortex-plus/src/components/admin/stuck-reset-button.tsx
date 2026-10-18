"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetStuckGeneration } from "@/app/admin/actions";

/** Takılı üretimi kapatır ve askıdaki krediyi iade eder (plan 4.3). */
export function StuckResetButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="adm-btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resetStuckGeneration(jobId);
            setNote(result.ok ? result.message : result.error);
            if (result.ok) router.refresh();
          })
        }
      >
        {pending ? "Kapatılıyor…" : "Kapat ve iade et"}
      </button>
      {note ? <span className="text-xs text-[var(--adm-muted)]">{note}</span> : null}
    </span>
  );
}
