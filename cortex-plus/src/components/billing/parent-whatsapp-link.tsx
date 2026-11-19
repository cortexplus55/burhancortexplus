"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { formatTryWhole } from "@/lib/format";
import {
  PARENT_WHATSAPP_BUTTON,
  PARENT_WHATSAPP_GUEST_HREF,
  PARENT_WHATSAPP_HINT,
  PARENT_WHATSAPP_PAID,
} from "@/lib/payments/parent-whatsapp-copy";
import "@/styles/veli-whatsapp.css";

export type ParentLinkChoice = { key: "plus" | "week" | "sigma"; planId: string; name: string; priceKurus: number };

type LinkPayload = { url: string; expiresAt: string; shareText: string; whatsappUrl: string; planName: string; priceLabel: string };

/** Öğrenci tarafı onay yoklaması: bağlantı açıkken 5 sn'de bir, en çok 15 dk (`/api/payments/status`, dakikada 60). */
const POLL_MS = 5000;
const POLL_WINDOW_MS = 15 * 60 * 1000;

/**
 * "📲 Velime WhatsApp'tan Ödeme Linki Gönder" (Faz 5 §2, 19 Kasım 2026). `/pay` ve `/fiyatlandirma` paket kartlarının
 * altında, WhatsApp yeşili. Öğrenci paketi seçer; `POST /api/billing/parent-link` 48 saatlik imzalı bağlantıyı ve
 * öğrencinin ağzından hazır mesajı döner; WhatsApp'ta gönder, paylaş ya da kopyala. Veli ödeyince geri çağrı paketi
 * öğrencinin hesabına yazar; bu panel açıksa onay ekranına döner (ayrıca uygulama içi bildirim düşer).
 * Misafirde düğme girişe götürür; girişten sonra `/pay?veli=1` paneli açık gelir.
 */
export function ParentWhatsAppLink({
  choices,
  initialKey,
  guestMode = false,
  autoOpen = false,
}: {
  choices: ParentLinkChoice[];
  initialKey?: ParentLinkChoice["key"] | null;
  guestMode?: boolean;
  autoOpen?: boolean;
}) {
  const [picked, setPicked] = useState<ParentLinkChoice["key"]>(
    choices.find((choice) => choice.key === initialKey)?.key ?? choices[0]?.key ?? "plus",
  );
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<LinkPayload | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (autoOpen) rootRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [autoOpen]);

  useEffect(() => {
    if (!link || paid) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_WINDOW_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch("/api/payments/status", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { plus?: boolean; payment?: { status?: string } | null };
        if (body.plus && body.payment?.status === "paid") setPaid(link.planName);
      } catch {
        /* sıradaki yoklama dener */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [link, paid]);

  if (!choices.length) return null;
  const choice = choices.find((item) => item.key === picked) ?? choices[0]!;

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/parent-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: choice.planId }),
      });
      const payload = (await res.json().catch(() => ({}))) as LinkPayload & { error?: string };
      if (!res.ok || !payload.url) {
        toast.error(payload.error && payload.error !== "not_found" ? payload.error : "Bağlantı üretilemedi.");
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
      await navigator.clipboard.writeText(link.shareText);
      toast.success("Mesaj ve bağlantı kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı; mesajı elle seçip kopyalayabilirsin.");
    }
  }

  async function share() {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: link.shareText });
        return;
      } catch {
        /* vazgeçti ya da desteklenmiyor: kopyalamaya düş */
      }
    }
    await copy();
  }

  if (paid) {
    return (
      <section className="cp-veli-wa cp-veli-wa--paid" role="status" data-testid="veli-wa-paid" ref={rootRef}>
        <CheckCircle2 className="cp-veli-wa-paid-icon" aria-hidden />
        <p className="cp-veli-wa-title">{PARENT_WHATSAPP_PAID}</p>
        <p className="cp-veli-wa-hint">{paid} paketin hesabına tanımlandı. Hazırlığına kaldığın yerden devam edebilirsin.</p>
        <Link href="/ogretmen" className="cp-veli-wa-back">
          Hazırlığıma dön
        </Link>
      </section>
    );
  }

  return (
    <section className="cp-veli-wa" aria-label="Velime ödeme linki" data-testid="veli-wa" ref={rootRef}>
      {guestMode ? null : (
        <div className="cp-veli-wa-choices" role="radiogroup" aria-label="Velinin ödeyeceği paket">
          {choices.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={item.key === picked}
              className="cp-veli-wa-choice"
              data-active={item.key === picked ? "true" : undefined}
              onClick={() => {
                setPicked(item.key);
                setLink(null);
              }}
            >
              <span>{item.name}</span>
              <b>{formatTryWhole(item.priceKurus)}</b>
            </button>
          ))}
        </div>
      )}
      {guestMode ? (
        <Link href={PARENT_WHATSAPP_GUEST_HREF} className="cp-veli-wa-btn" data-testid="veli-wa-button">
          {PARENT_WHATSAPP_BUTTON}
        </Link>
      ) : link ? null : (
        <button type="button" className="cp-veli-wa-btn" data-testid="veli-wa-button" disabled={busy} onClick={() => void create()}>
          {busy ? "Bağlantı hazırlanıyor…" : PARENT_WHATSAPP_BUTTON}
        </button>
      )}
      {link ? (
        <div className="cp-veli-wa-ready" data-testid="veli-wa-ready">
          <p className="cp-veli-wa-title">Velin için güvenli ödeme linki hazır</p>
          <p className="cp-veli-wa-hint">
            {link.planName} · {link.priceLabel} · 48 saat geçerli
          </p>
          <p className="cp-veli-wa-message" data-testid="veli-wa-message">
            {link.shareText}
          </p>
          <div className="cp-veli-wa-actions">
            <ExternalAnchor href={link.whatsappUrl} className="cp-veli-wa-btn cp-veli-wa-btn--small" data-testid="veli-wa-send">
              WhatsApp&apos;ta gönder
            </ExternalAnchor>
            <button type="button" className="cp-veli-wa-ghost" onClick={() => void share()}>
              <Share2 className="h-4 w-4" aria-hidden /> Paylaş
            </button>
            <button type="button" className="cp-veli-wa-ghost" onClick={() => void copy()} data-testid="veli-wa-copy">
              <Copy className="h-4 w-4" aria-hidden /> Kopyala
            </button>
          </div>
        </div>
      ) : (
        <p className="cp-veli-wa-hint">{PARENT_WHATSAPP_HINT}</p>
      )}
    </section>
  );
}
