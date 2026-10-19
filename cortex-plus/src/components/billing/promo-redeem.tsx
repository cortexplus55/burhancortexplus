"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { normalizePromoCode } from "@/lib/billing/promo-codes";

/**
 * "Kodun var mı?" kutusu (19 Ekim 2026, kapalı beta). Beta öğrencisi kodunu burada girer;
 * `/pay?kod=BETA-…` bağlantısı kutuyu doldurur ama kendiliğinden göndermez.
 */
export function PromoRedeem({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(() => normalizePromoCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = normalizePromoCode(code);
    if (!value) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !payload.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Kod kullanılamadı." });
        return;
      }
      const text = payload.message ?? "Kod kullanıldı.";
      setMessage({ tone: "ok", text });
      setCode("");
      toast.success(text);
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Bağlantı hatası. Yeniden dene." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="promo-redeem-title"
      className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-[var(--cs-border)] bg-[var(--cs-surface)] p-5"
    >
      <h2 id="promo-redeem-title" className="text-base font-semibold text-[var(--cs-text)]">
        Kodun var mı?
      </h2>
      <p className="mt-1 text-sm text-[var(--cs-muted)]">Beta ya da kampanya kodunu buraya yaz.</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="BETA-XXXX-XXXX"
          aria-label="Kod"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          className="min-w-0 flex-1 rounded-lg border border-[var(--cs-border)] bg-transparent px-3 py-2 font-mono text-sm text-[var(--cs-text)] outline-none focus:border-[var(--cs-primary)]"
        />
        <Button type="submit" size="sm" disabled={busy || !code.trim()}>
          {busy ? "…" : "Kodu kullan"}
        </Button>
      </form>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "mt-3 text-sm text-red-300"
              : "mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
