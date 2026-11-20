"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CLONE_BUTTON_LABEL } from "@/lib/learning/class-share";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

export const PREP_CLONE_URL = "/api/learning/exam-prep/clone";

type CloneState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "paywall"; message: string }
  | { kind: "error"; message: string };

/**
 * "Bu Çalışma Yolunu Hesabıma Klonla (1. Ünite Ücretsiz)" (Faz 7, 20 Kasım 2026). Kopyayı kurar ve öğrenciyi kendi
 * hazırlığına götürür. Kayıttan ya da girişten dönülünce (`?otomatik=1`) sayfa açılır açılmaz kendiliğinden ister.
 * Çift istek yok: düğme iş sürerken kilitli, istek tek seferlik bayrakla korunur (sunucu da aynı kişiye ikinci kopya
 * açmaz). Ücretsiz hesapta tek hazırlık dolduysa sessizce düşmez: Plus yolu gösterilir.
 */
export function ClonePrepButton({ shareCode, auto = false }: { shareCode: string; auto?: boolean }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<CloneState>(auto ? { kind: "busy" } : { kind: "idle" });

  async function clone() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "busy" });
    try {
      const res = await fetch(PREP_CLONE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareCode }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && body.id) {
        router.replace(examPrepHomeHref(body.id));
        return;
      }
      setState(
        res.status === 402
          ? { kind: "paywall", message: body.error ?? "Ücretsiz hesapta bir sınav hazırlığı açılabilir." }
          : { kind: "error", message: body.error ?? "Kopya bu sefer kurulamadı. Yeniden dene." },
      );
    } catch {
      setState({ kind: "error", message: "İnternet bağlantını kontrol edip yeniden dene." });
    }
    inFlight.current = false;
  }

  // Kayıt ya da girişten dönüş: bir kez, sayfa açılınca. Bayrak çift çağrıyı (React'in geliştirme kipi dahil) engeller.
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => void clone(), 0);
    return () => window.clearTimeout(timer);
    // `clone` her çizimde yenilenir; yalnız ilk açılışta çalışmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const busy = state.kind === "busy";
  return (
    <div className="cp-invite-actions">
      <button
        type="button"
        className="mk-btn-primary cp-invite-cta"
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={() => {
          if (!busy) void clone();
        }}
      >
        {busy ? "Çalışma yolun hazırlanıyor…" : CLONE_BUTTON_LABEL}
      </button>
      {state.kind === "paywall" ? (
        <p className="cp-invite-status" role="status">
          {state.message} <Link href="/pay">Plus&apos;a bak</Link>
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="cp-invite-status" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
