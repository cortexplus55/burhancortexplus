"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Swords } from "lucide-react";
import { toast } from "sonner";

/** Yeni düello kurar ve kurucuyu ilk tura götürür. */
export function NewDuelButton({ prepId }: { prepId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/learning/exam-prep/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) {
        throw new Error(data?.error ?? "Düello kurulamadı. Biraz sonra yeniden dene.");
      }
      router.push(`/duello/${data.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Düello kurulamadı.");
      setBusy(false);
    }
  }

  return (
    <button type="button" className="cp-duel-primary" disabled={busy} onClick={() => void create()}>
      <Swords className="h-4 w-4" aria-hidden />
      {busy ? "Sorular hazırlanıyor…" : "Yeni düello"}
    </button>
  );
}
