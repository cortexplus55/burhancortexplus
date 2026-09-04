"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Hourglass } from "lucide-react";
import "@/styles/upgrade-gate.css";

export type PromoCampaign = {
  title: string;
  description: string;
  href: string;
  endsAt: string;
};

function parts(msLeft: number) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Kampanya bandı — yalnızca ücretsiz kullanıcıda ve yalnızca gerçek bir
 * kampanya varken.
 *
 * Sayaç kampanyanın veritabanındaki bitiş tarihine bakıyor. Süre dolduğunda
 * bant kayboluyor ve bir daha görünmüyor; kendi kendine yenilenen bir geri
 * sayım sahte aciliyet olurdu. Yeni kampanya yönetim panelinden açılır.
 *
 * Kalan süre 48 saatten fazlaysa sayaç yerine tarih yazılıyor: "71 saat 12
 * dakika" kimseye bir şey anlatmıyor.
 */
export function PromoBanner({ campaign }: { campaign: PromoCampaign }) {
  const endsAt = new Date(campaign.endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  // İlk değer sunucuda hesaplanmıyor: sunucu ile tarayıcı saati farklı olduğu
  // için hidrasyon uyuşmazlığı çıkardı. Bant ilk karede sayaçsız görünüyor.
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (now !== null && now >= endsAt) return null;

  const left = now === null ? null : parts(endsAt - now);
  const longRun = left !== null && left.hours >= 48;

  return (
    <Link href={campaign.href} className="ug-promo">
      <Hourglass className="h-5 w-5 text-[var(--ap-gold,#f4ae0b)]" aria-hidden />

      <div className="ug-promo-body">
        <p className="ug-promo-title">{campaign.title}</p>
        <p className="ug-promo-desc">{campaign.description}</p>
      </div>

      {left ? (
        longRun ? (
          <span className="ug-promo-clock">
            {new Date(endsAt).toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
            })}
            <small>tarihine kadar</small>
          </span>
        ) : (
          <span className="ug-promo-clock" aria-label="Kalan süre">
            {pad(left.hours)}
            <small>saat</small>
            {pad(left.minutes)}
            <small>dk</small>
            {pad(left.seconds)}
            <small>sn</small>
          </span>
        )
      ) : null}

      <ArrowRight className="h-4 w-4 opacity-70" aria-hidden />
    </Link>
  );
}
