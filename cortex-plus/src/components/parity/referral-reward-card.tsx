"use client";

import { Icon3D } from "@/components/ui/icon-3d";
import { useState } from "react";
import { toast } from "sonner";
import {
  referralPitch,
  referralStatus,
  referralSteps,
  type ReferralSummary,
} from "@/lib/credits/referral";
import { REFERRAL_GIFT_LESSONS } from "@/lib/billing/free-meters";

/**
 * Davet ödülü kartı.
 *
 * Kotanın hemen yanında duruyor, çünkü kullanıcı limitine baktığı anda
 * "nasıl artırırım" sorusunu soruyor.
 *
 * 24 Ekim 2026: davet çarpanı kalktı (ürün sahibinin kararı). Arkadaş hesabını
 * doğrulayıp ilk çalışmasını yapınca ikisine de bir kez 3 ders hediye; davet
 * eden en çok 3 davet için alır (SQL `grant_referral_gift`). Kart çarpan
 * alanlarını okumaz: başlık, adımlar ve durum hediyeyi anlatır, durum satırı
 * yazılmış hediyeden gelir (`referral.ts`).
 */
export function ReferralRewardCard({
  summary,
  inviteUrl,
}: {
  summary: ReferralSummary;
  inviteUrl: string;
}) {
  const [explaining, setExplaining] = useState(false);
  const status = referralStatus(summary);

  // Ödül altyapısı henüz yoksa kart çizilmez — olmayan bir şey vaat etmektense
  // hiç görünmemesi doğru.
  if (!summary.available) return null;

  return (
    <div className="cp-ref-card">
      <span className="cp-ref-badge">
        {summary.giftsKnown
          ? `${summary.giftsGranted}/${summary.maxCount} davet hediyesi`
          : `${summary.usedCount}/${summary.maxCount} davet sayıldı`}
      </span>

      <Icon3D name="davet" size={64} className="cp-ref-art" />

      <h2 className="cp-ref-title">Arkadaşını davet et, ikinize de {REFERRAL_GIFT_LESSONS} ders hediye</h2>
      <p className="cp-ref-body">{referralPitch(summary)}</p>

      {status ? <p className="cp-ref-status">{status}</p> : null}

      <div className="cp-ref-actions">
        <button
          type="button"
          className="cp-ref-primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteUrl);
              toast.success("Davet bağlantısı kopyalandı.");
            } catch {
              // Pano izni yoksa kullanıcı elle kopyalayabilsin.
              toast.error("Kopyalanamadı. Bağlantı: " + inviteUrl);
            }
          }}
        >
          Bağlantıyı kopyala
        </button>
        <button
          type="button"
          className="cp-ref-ghost"
          aria-expanded={explaining}
          onClick={() => setExplaining((v) => !v)}
        >
          Nasıl çalışır?
        </button>
      </div>

      {explaining ? (
        <ul className="cp-ref-steps">
          {referralSteps(summary).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
