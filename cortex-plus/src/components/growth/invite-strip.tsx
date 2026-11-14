"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useGrowthPrompt } from "@/lib/growth/use-growth-prompt";
import { REFERRAL_GIFT_LESSONS } from "@/lib/billing/free-meters";

/**
 * Ana ekran davet şeridi (Faz 11C yerleşim 7, `ui.v2.buyume`). İlk ders tamamlanınca, günde en çok bir öneri kuralıyla;
 * kapatılabilir (30 gün çıkmaz). Ödül cümlesi davet hediyesinin bugünkü sayısından (`REFERRAL_GIFT_LESSONS`; mekanizma
 * `grant_referral_gift`). Hiçbir şey kendiliğinden gönderilmez: yalnız "Bağlantıyı kopyala".
 */
export function InviteStrip({ url, plan }: { url: string; plan: string }) {
  const { visible, dismiss } = useGrowthPrompt("home_invite", plan);
  const [copied, setCopied] = useState(false);
  if (!visible) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="cx-growth" role="region" aria-label="Arkadaşını getir">
      <p className="cx-t-label-13 cx-growth-text">
        Arkadaşını getir · İkinize de {REFERRAL_GIFT_LESSONS} ders hediye
      </p>
      <button type="button" className="cx-glass cx-growth-action" onClick={() => void copy()}>
        {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Davet bağlantısı kopyalandı" : ""}
      </span>
      <button type="button" className="cx-growth-close" aria-label="Öneriyi kapat" onClick={dismiss}>
        <X aria-hidden />
      </button>
    </section>
  );
}
