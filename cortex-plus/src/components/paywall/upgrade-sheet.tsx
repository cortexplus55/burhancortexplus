"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Users, X } from "lucide-react";
import { useIsFounder } from "@/lib/student/student-shell-context";
import { PlusCountsInline } from "@/components/marketing/plus-month";
import { FREE_TIER_SENTENCE, REFERRAL_GIFT_LESSONS, REFERRAL_MAX_INVITES } from "@/lib/billing/free-meters";
import "@/styles/parity-app.css";
import "@/styles/cortex-premium.css";
import "@/styles/upgrade-gate.css";

/*
  Kapının davet ve ücretsiz hak cümleleri sayılarını koddan alır (24 Ekim 2026): elle yazılmış
  "haftada 3 ders" ya da "3 ders hediye" sayaç değişince sessizce yalan olurdu. Hediyenin koşulu
  `referralPitch` ile aynı: arkadaş hesabını doğrulayıp ilk çalışmasını yapınca; davet eden en çok
  `REFERRAL_MAX_INVITES` davet için alır (sınırı dolan davet edene "ikinize de" yalan olmasın).
*/
const GIFT_CONDITION = "hesabını doğrulayıp ilk çalışmasını yapınca";

/** Davet bağlantısının yazısı. */
export const UPGRADE_INVITE_LINE = `Ya da arkadaşını davet et — o ${GIFT_CONDITION} ikinize de ${REFERRAL_GIFT_LESSONS} ders hediye (en çok ${REFERRAL_MAX_INVITES} davet)`;

/** "Cortex Plus neden tamamen ücretsiz değil?" altındaki ücretsiz hak satırı. */
export const UPGRADE_FREE_LINE =
  `Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} var; ` +
  `davet ettiğin arkadaş ${GIFT_CONDITION} ikinize de ${REFERRAL_GIFT_LESSONS} ders hediye; en çok ${REFERRAL_MAX_INVITES} davet için.`;

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
  /** Yenilenme anı (ISO). Varsa canlı geri sayım çizilir (Astra gibi). */
  resetsAt,
  headline,
  wins,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  resetHint?: string;
  resetsAt?: string;
  /** Başlık (1. konu kapısı: "🚀 1. Konuyu Başarıyla Tamamladın!"); yoksa satış başlığı. */
  headline?: string;
  /** Öğrencinin bu hazırlıktaki kazanımları; başlığın altında rozetler. */
  wins?: string[];
}) {
  const founder = useIsFounder();
  const [whyOpen, setWhyOpen] = useState(false);
  // Escape ile kapanmalı: tam ekran bir kapı, çıkışı kolay olmalı.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || founder) return null;

  const href = returnPath
    ? `/pay?returnTo=${encodeURIComponent(returnPath)}`
    : "/pay";

  return (
    <div
      className="cs-app cortex-premium-app ug-backdrop"
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
          {headline ?? (
            <>
              <span className="ug-title-gold">Daha hızlı öğrenmek</span> için yükselt
            </>
          )}
        </h2>

        {wins?.length ? (
          <ul className="ug-wins" aria-label="Kazanımların">
            {wins.map((win) => (
              <li key={win}>{win}</li>
            ))}
          </ul>
        ) : null}

        {/* Sebep başlıktan ayrı duruyor: "neden bu ekran çıktı" sorusunun
            cevabı, satış cümlesinin içine gömülmemeli. */}
        <p className="ug-reason">{message}</p>

        {/* Plus'ın bir ayı dört sayıyla (20 Ekim 2026); sayılar kredi tablosundan (plan-value.ts). */}
        <PlusCountsInline />

        <Link href={href} className="ug-cta" onClick={() => onOpenChange(false)}>
          Plus&apos;a yükselt
        </Link>

        {/*
          Üçüncü yol — ve bugüne kadar bu ekranda hiç söylenmiyordu.

          Davet sistemi kurulu, kart da yazılmış; ama yalnızca /krediler,
          /profil ve /davet sayfalarında duruyordu. Üçü de öğrencinin BİLEREK
          gittiği yerler. Oysa "daha fazla hak istiyorum" düşüncesi tam burada,
          hakkı dolduğu anda doğuyor.

          24 Ekim 2026: davet çarpanı kalktı; iki tarafa bir kez REFERRAL_GIFT_LESSONS
          ders hediye (SQL `grant_referral_gift`), arkadaş hesabını doğrulayıp ilk
          çalışmasını yapınca.
        */}
        <Link
          href="/davet"
          className="ug-invite"
          onClick={() => onOpenChange(false)}
        >
          <Users className="h-4 w-4" aria-hidden />
          <span>{UPGRADE_INVITE_LINE}</span>
        </Link>

        {/* Hakkı yenilenecek olan öğrenciye "beklersen de olur" demek dürüst
            olan. Abone olmadan da çözümü var ve bunu saklamıyoruz. */}
        {resetsAt ? (
          <ResetCountdown resetsAt={resetsAt} hint={resetHint} />
        ) : resetHint ? (
          <p className="ug-reset">{resetHint}</p>
        ) : null}

        {/* Astra'da bu bağlantı aynı kapının içinde kısa bir açıklama açıyor;
            öğrenciyi yardım sayfasına göndermek kapıyı kapatıyordu. */}
        <button type="button" className="ug-why" onClick={() => setWhyOpen((value) => !value)}>
          Cortex Plus neden tamamen ücretsiz değil?
        </button>
        {whyOpen ? (
          <ol className="ug-why-list">
            <li>
              <strong>Amacımız</strong>
              <span>Her öğrencinin kendi notundan çalışan bir yapay zekâ öğretmeni olsun.</span>
            </li>
            <li>
              <strong>Gerçek maliyet</strong>
              <span>Her ders, test ve cevap model hesabı kullanıyor; bunun bir maliyeti var.</span>
            </li>
            <li>
              <strong>Ücretsiz hak</strong>
              <span>{UPGRADE_FREE_LINE}</span>
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Geri sayımın parçaları. 24 saatten uzunsa gün ve saat ("5 gün 22 saat"): haftalık ders hakkı Salı
 * biten öğrenciye "142 saat 10 dk 05 sn" yazıyordu. Bir günün altında Astra'nın duvarındaki gibi saat,
 * dakika, saniye.
 */
export function countdownParts(leftSeconds: number): { value: string; unit: string }[] {
  const left = Math.max(0, Math.floor(leftSeconds));
  if (left > 24 * 3600) {
    return [
      { value: String(Math.floor(left / 86400)), unit: "gün" },
      { value: String(Math.floor((left % 86400) / 3600)), unit: "saat" },
    ];
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    { value: pad(Math.floor(left / 3600)), unit: "saat" },
    { value: pad(Math.floor((left % 3600) / 60)), unit: "dk" },
    { value: pad(left % 60), unit: "sn" },
  ];
}

/**
 * "Hakkın yenilenene kadar: 04 saat 21 dk 00 sn" — Astra'nın sohbet duvarındaki gibi. Yenilenme satırı
 * ("Ders hakkın Pazartesi 00:00'da yenilenir.") hemen üstünde: eskiden geri sayım varken hiç çizilmiyordu.
 * Saniyede bir güncellenir; süre dolunca "Hakkın yenilendi" der.
 */
function ResetCountdown({ resetsAt, hint }: { resetsAt: string; hint?: string }) {
  const target = new Date(resetsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!Number.isFinite(target)) return hint ? <p className="ug-reset">{hint}</p> : null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  if (left === 0) return <p className="ug-reset">Hakkın yenilendi; yeniden deneyebilirsin.</p>;
  return (
    <>
      {hint ? <p className="ug-reset">{hint}</p> : null}
      <div className="ug-countdown" aria-live="off">
        <span className="ug-countdown-label">Hakkın yenilenene kadar:</span>
        <span className="ug-countdown-clock">
          {countdownParts(left).map((part, index) => (
            <span key={part.unit}>
              {index ? " " : null}
              <b>{part.value}</b> {part.unit}
            </span>
          ))}
        </span>
      </div>
    </>
  );
}
