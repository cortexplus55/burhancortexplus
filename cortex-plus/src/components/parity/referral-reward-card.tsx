"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  referralPitch,
  referralStatus,
  type ReferralSummary,
} from "@/lib/credits/referral";

/**
 * Davet ödülü kartı.
 *
 * Kotanın hemen yanında duruyor, çünkü kullanıcı limitine baktığı anda
 * "nasıl artırırım" sorusunu soruyor. Çarpan sayıları veritabanından geliyor.
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
    <div className="ap-ref-card">
      <span className="ap-ref-badge">
        {summary.usedCount}/{summary.maxCount} davet sayıldı
      </span>

      <div className="ap-ref-coin" aria-hidden />

      <h2 className="ap-ref-title">Arkadaşını davet et, hakkın katlansın</h2>
      <p className="ap-ref-body">{referralPitch(summary)}</p>

      {status ? <p className="ap-ref-status">{status}</p> : null}

      <div className="ap-ref-actions">
        <button
          type="button"
          className="ap-ref-primary"
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
          className="ap-ref-ghost"
          aria-expanded={explaining}
          onClick={() => setExplaining((v) => !v)}
        >
          Nasıl çalışır?
        </button>
      </div>

      {explaining ? (
        <ul className="ap-ref-steps">
          <li>Bağlantını paylaş; arkadaşın kayıt olurken kodun işlenir.</li>
          <li>
            Kaydolduğu anda ikinizin de dönemlik hakkı{" "}
            <strong>{summary.signupMultiplier} katına</strong> çıkar.
          </li>
          <li>
            Arkadaşın aboneliğe geçerse senin hakkın{" "}
            <strong>{summary.subscribedMultiplier} katına</strong> yükselir.
          </li>
          <li>
            En fazla <strong>{summary.maxCount} davet</strong> sayılır ve en
            yüksek çarpan geçerli olur — çarpanlar toplanmaz.
          </li>
        </ul>
      ) : null}
    </div>
  );
}
