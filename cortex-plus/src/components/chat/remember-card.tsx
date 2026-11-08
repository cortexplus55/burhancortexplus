"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Check, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import "@/styles/chat-teaching.css";
import { clozeFromFact } from "@/lib/learning/remember-facts";

/**
 * "Akılda kalsın" kartı (8 Kasım 2026, sohbet öğretim dili). Öğretmenin cevabının sonundaki en önemli 1-3 bilgi;
 * "Tekrarıma ekle" her maddeyi boşluk doldurma kartına çevirip genel tekrar destesine koyar (1, 3, 7, 14 gün).
 * Kilit bilgisi (==…==) olmayan madde kart olamaz; düğme yalnız kart kurulabilen maddeleri sayar.
 */
export function RememberCard({ items }: { items: string[] }) {
  const cardable = items.filter((item) => clozeFromFact(item));
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    if (state === "saving" || state === "done") return;
    setState("saving");
    try {
      const res = await fetch("/api/review/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: cardable }),
      });
      const data = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Şu an eklenemedi; biraz sonra yeniden dene.");
        return;
      }
      setState("done");
      setMessage(
        (data.added ?? 0) > 0
          ? `${data.added} kart destene eklendi. İlk tekrar yarın.`
          : "Bu bilgiler zaten destende.",
      );
    } catch {
      setState("error");
      setMessage("Bağlantı hatası; yeniden dene.");
    }
  }

  return (
    <section className="cp-remember" aria-label="Akılda kalsın">
      <p className="cp-remember-kicker">
        <Sparkles size={15} aria-hidden />
        Akılda kalsın
      </p>
      <ol className="cp-remember-list">
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`}>
            <span className="cp-remember-num" aria-hidden>
              {index + 1}
            </span>
            <Markdown content={item} variant="parity" />
          </li>
        ))}
      </ol>
      {cardable.length ? (
        <div className="cp-remember-foot">
          {state === "done" ? (
            <p className="cp-remember-done" role="status">
              <Check size={16} aria-hidden />
              {message} <Link href="/tekrar">Destemi aç</Link>
            </p>
          ) : (
            <>
              <button type="button" className="cp-remember-add" onClick={() => void add()} disabled={state === "saving"}>
                <BookmarkPlus size={16} aria-hidden />
                {state === "saving" ? "Ekleniyor…" : "Tekrarıma ekle"}
              </button>
              <span className="cp-remember-hint">1, 3, 7 ve 14 gün sonra sana sorarım.</span>
            </>
          )}
          {state === "error" && message ? (
            <p className="cp-remember-error" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
