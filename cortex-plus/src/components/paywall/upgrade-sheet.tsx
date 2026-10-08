"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Unlock, Users, X } from "lucide-react";
import { useIsFounder } from "@/lib/student/student-shell-context";
import "@/styles/parity-app.css";
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
  /** Yenilenme anı (ISO). Varsa canlı geri sayım çizilir (Astra gibi). */
  resetsAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  resetHint?: string;
  resetsAt?: string;
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

        {/*
          Üçüncü yol — ve bugüne kadar bu ekranda hiç söylenmiyordu.

          Davet sistemi kurulu, çarpanlar işliyor, kart da yazılmış; ama
          yalnızca /krediler, /profil ve /davet sayfalarında duruyordu. Üçü de
          öğrencinin BİLEREK gittiği yerler. Oysa "daha fazla hak istiyorum"
          düşüncesi tam burada, hakkı dolduğu anda doğuyor.

          Çarpanın kaç olduğu yazılmıyor: sayı veritabanından geliyor ve
          değişebiliyor, kabuk bağlamında da taşınmıyor. Sırf bu satır için
          her sayfa yüklemesine fazladan sorgu eklemek yerine, çarpan kaç
          olursa olsun doğru kalan cümle kuruldu.
        */}
        <Link
          href="/davet"
          className="ug-invite"
          onClick={() => onOpenChange(false)}
        >
          <Users className="h-4 w-4" aria-hidden />
          <span>Ya da arkadaşını davet et — ikinizin de hakkı katlanır</span>
        </Link>

        {/* Hakkı yenilenecek olan öğrenciye "beklersen de olur" demek dürüst
            olan. Abone olmadan da çözümü var ve bunu saklamıyoruz. */}
        {resetsAt ? (
          <ResetCountdown resetsAt={resetsAt} />
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
              <span>Ücretsiz hesap her gün bir derslik hak alıyor; davet ettiğin arkadaşınla ikinizin hakkı katlanıyor.</span>
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Tekrar dene: 04 saat 21 dk 00 sn" — Astra'nın sohbet duvarındaki gibi.
 * Saniyede bir güncellenir; süre dolunca "Hakkın yenilendi" der.
 */
function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  const target = new Date(resetsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!Number.isFinite(target)) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  if (left === 0) return <p className="ug-reset">Hakkın yenilendi; yeniden deneyebilirsin.</p>;
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  return (
    <div className="ug-countdown" aria-live="off">
      <span className="ug-countdown-label">Hakkın yenilenene kadar:</span>
      <span className="ug-countdown-clock">
        <b>{pad(hours)}</b> saat <b>{pad(minutes)}</b> dk <b>{pad(seconds)}</b> sn
      </span>
    </div>
  );
}
