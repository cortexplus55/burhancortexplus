"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, Swords } from "lucide-react";
import { toast } from "sonner";

/**
 * Yeni düello kurar ve kurucuyu ilk tura götürür. "AI rakiple hemen başla" (29 Ekim 2026) aynı
 * düelloyu kurar, sayfayı bot düzeyi seçili açar: arkadaş beklemeden oynanır, bağlantı yine paylaşılır.
 */
export function NewDuelButton({ prepId }: { prepId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"friend" | "bot" | null>(null);

  async function create(mode: "friend" | "bot") {
    setBusy(mode);
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
      router.push(mode === "bot" ? `/duello/${data.code}?bot=derece` : `/duello/${data.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Düello kurulamadı.");
      setBusy(null);
    }
  }

  return (
    <div className="cp-duel-actions">
      <button type="button" className="cp-duel-primary" disabled={busy != null} onClick={() => void create("friend")}>
        <Swords className="h-4 w-4" aria-hidden />
        {busy === "friend" ? "Sorular hazırlanıyor…" : "Yeni düello"}
      </button>
      <button type="button" className="cp-duel-secondary" disabled={busy != null} onClick={() => void create("bot")}>
        <Bot className="h-4 w-4" aria-hidden />
        {busy === "bot" ? "Sorular hazırlanıyor…" : "🤖 AI rakiple hemen başla"}
      </button>
    </div>
  );
}
