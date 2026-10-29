"use client";

import { useState } from "react";
import { Copy, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";

type LinkPayload = { url: string; expiresAt: string; shareText: string; whatsappUrl: string };

/**
 * "Kartım yanımda değil — velime ödeme linki gönder" (29 Ekim 2026). Öğrenci bağlantıyı alır,
 * WhatsApp'ta gönderir ya da kopyalar; veli hesap açmadan öder, paket öğrencinin hesabına tanımlanır.
 */
export function ParentPayLinkButton({ planId, planName }: { planId: string; planName: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<LinkPayload | null>(null);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/payments/parent-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const payload = (await res.json().catch(() => ({}))) as LinkPayload & { error?: string };
      if (!res.ok || !payload.url) {
        toast.error(payload.error ?? "Bağlantı üretilemedi.");
        return;
      }
      setLink(payload);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Bağlantı kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı; bağlantıyı elle seçip kopyalayabilirsin.");
    }
  }

  if (link) {
    return (
      <div className="mt-2 rounded-2xl border border-[var(--cs-border)] p-3 text-left text-sm">
        <p className="font-medium text-[var(--cs-text)]">Velin için ödeme bağlantısı hazır</p>
        <p className="mt-1 text-xs text-[var(--cs-muted)]">
          {planName} · 3 gün geçerli · veli hesap açmadan öder, paket senin hesabına tanımlanır.
        </p>
        <input readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-[var(--cs-border)] bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--cs-text)]" aria-label="Ödeme bağlantısı" />
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={link.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-action px-3 py-1.5 text-xs font-semibold text-action-foreground">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp&apos;ta gönder
          </a>
          <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cs-border)] px-3 py-1.5 text-xs text-[var(--cs-text)]">
            <Copy className="h-3.5 w-3.5" aria-hidden /> Kopyala
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void create()}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--cs-border)] py-2.5 text-sm font-medium text-[var(--cs-text)] hover:border-[var(--cs-primary)] disabled:opacity-60"
    >
      <Users className="h-4 w-4" aria-hidden />
      {busy ? "Bağlantı hazırlanıyor…" : "👨‍👩‍👧 Kartım yanımda değil — velime ödeme linki gönder"}
    </button>
  );
}
