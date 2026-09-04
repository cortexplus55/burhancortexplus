"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Sparkles, Unlock, X } from "lucide-react";
import "@/styles/astra-app.css";
import "@/styles/cortex-premium.css";
import "@/styles/upgrade-gate.css";

/**
 * Hak dolduğunda çıkan yükseltme ekranı.
 *
 * Eskiden alttan açılan küçük bir paneldi ve içinde üç maddelik bir avantaj
 * listesi vardı. Liste okunmuyordu: hakkı dolan öğrenci o anda özellik
 * karşılaştırması yapmak istemiyor, "ne oldu ve ne yapabilirim" diye soruyor.
 *
 * Şimdi tek soruya tek cevap veren tam ekran bir kapı: ne olduğu (hakkın
 * doldu), ne zaman düzeleceği (yenilenme saati), tek bir düğme. Ayrıntı
 * isteyen için altta ikinci bir bağlantı var.
 */
export function UpgradeSheet({
  open,
  onOpenChange,
  message,
  returnPath,
  /** "Hakkın yarın 03:00'te yenilenir" gibi bir satır. */
  resetHint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  resetHint?: string;
}) {
  // Escape ile kapanmalı: tam ekran bir kapı, çıkışı kolay olmalı.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const href = returnPath
    ? `/pay?returnTo=${encodeURIComponent(returnPath)}`
    : "/pay";

  return (
    <div
      className="astra-app cortex-premium-app ug-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ug-title"
      onClick={() => onOpenChange(false)}
    >
      <div className="ug-panel" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="ug-close"
          aria-label="Kapat"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </button>

        <span className="ug-star" aria-hidden>
          <Sparkles className="h-10 w-10" />
        </span>

        <h2 id="ug-title" className="ug-title">
          <span className="ug-title-gold">Daha hızlı öğrenmek</span> için yükselt
        </h2>

        {/* Sebep başlıktan ayrı duruyor: "neden bu ekran çıktı" sorusunun
            cevabı, satış cümlesinin içine gömülmemeli. */}
        <p className="ug-reason">{message}</p>

        <div className="ug-perk">
          <Unlock className="h-4 w-4" aria-hidden />
          <span>Plus ile günlük hak yerine aylık hak, kat kat fazlası</span>
        </div>

        <Link href={href} className="ug-cta" onClick={() => onOpenChange(false)}>
          Plus&apos;a yükselt
        </Link>

        {/* Hakkı yenilenecek olan öğrenciye "beklersen de olur" demek dürüst
            olan. Abone olmadan da çözümü var ve bunu saklamıyoruz. */}
        {resetHint ? <p className="ug-reset">{resetHint}</p> : null}

        <Link href="/yardim" className="ug-why" onClick={() => onOpenChange(false)}>
          Cortex Plus neden tamamen ücretsiz değil?
        </Link>
      </div>
    </div>
  );
}
