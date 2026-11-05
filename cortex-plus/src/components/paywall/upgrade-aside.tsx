"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { useIsFounder } from "@/lib/student/student-shell-context";
import { allowanceWorkLine } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import "@/styles/upgrade-gate.css";

/** Kapatılan kart bu kadar süre gizli kalır (tarayıcıda; başka cihazda yeniden görünür). */
export const UPGRADE_ASIDE_HIDE_MS = 24 * 60 * 60 * 1000;
export const UPGRADE_ASIDE_STORAGE_KEY = "cp:upgrade-aside:hidden-until";

/** Kart şu an gizli mi: kayıtlı bitiş zamanı gelecekteyse. Bozuk ya da eksik kayıt gizlemez. */
export function upgradeAsideHidden(stored: string | null, now: number = Date.now()): boolean {
  const until = Number(stored);
  return Number.isFinite(until) && until > now;
}

function readHidden(): boolean {
  try {
    return upgradeAsideHidden(window.localStorage.getItem(UPGRADE_ASIDE_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * CONVERSION_PACK_UPGRADE
 * Sohbet yanındaki yükseltme kartı — yalnızca ücretsiz.
 * Fiyat sayfasıyla aynı dil: tek CTA, kısa fayda.
 * 6 Kasım 2026: öğrenci kartı "×" ile 24 saat kapatabilir (kart yazma alanının yanında kalıcı duruyordu).
 */
export function UpgradeAside({ returnPath }: { returnPath?: string }) {
  const founder = useIsFounder();
  // İlk çizimde sunucuyla aynı (görünür); tarayıcı kaydı okununca gizlenir — hidrasyon uyuşmazlığı olmasın.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(readHidden());
  }, []);

  if (founder || hidden) return null;
  const href = returnPath
    ? `/pay?returnTo=${encodeURIComponent(returnPath)}`
    : "/pay";

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(UPGRADE_ASIDE_STORAGE_KEY, String(Date.now() + UPGRADE_ASIDE_HIDE_MS));
    } catch {
      // tarayıcı kaydı yoksa kart yalnız bu sayfada kapanır
    }
  };

  return (
    <aside className="ug-aside" aria-label="Plus tanıtımı">
      <button type="button" className="ug-aside-close" onClick={dismiss} aria-label="Plus kartını kapat">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="ug-aside-brand">
        <CortexMark size={20} />
        <span>cortex</span>
        <span className="ug-aside-plus" aria-hidden>
          +
        </span>
      </div>
      <p className="ug-aside-title">Plus&apos;a yükselt</p>
      <p className="ug-aside-blurb">
        {allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly)} ve daha yüksek yükleme limiti.
      </p>
      <Link href={href} className="ug-aside-cta">
        Plus&apos;a geç
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
