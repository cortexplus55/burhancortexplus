"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, LogIn, RefreshCw } from "lucide-react";
import { celebrate } from "@/lib/ui/confetti";
import {
  ACTIVATION_POLL_INTERVAL_MS,
  ACTIVATION_POLL_WINDOW_MS,
  ACTIVATION_REDIRECT_MS,
  ACTIVATION_REQUEST_TIMEOUT_MS,
  APP_HOME_PATH,
  activationLoginHref,
  isPlusActivated,
  type ActivationStatus,
} from "@/lib/payments/activation";
import "@/styles/payment-activation.css";

export const PAYMENT_STATUS_URL = "/api/payments/status";

type Phase = "waiting" | "active" | "slow" | "signed-out";

/** Kutlamanın renkleri: altın Plus'ın kendisi, mavi uygulamanın eylem rengi. */
const CELEBRATION_COLORS = ["#fdb300", "#ffd66b", "#4353f3", "#8e98ff", "#f5f5f5"];

export type PaymentActivationProps = {
  /** Sunucu oturumu gördü mü; görmediyse yoklama hiç başlamaz. */
  signedIn: boolean;
  /** Eski veli hesabı akışı (`?kaynak=veli`): Plus ödeyene değil öğrenciye açılır. */
  forChild?: boolean;
  /** Plus açılınca gidilecek yer. */
  homeHref?: string;
  /** Oturumu düşen öğrencinin girişten sonra döneceği adres. */
  returnPath?: string;
};

/**
 * Ödeme dönüşü ekranı (31 Ekim 2026). PayTR öğrenciyi hemen geri gönderiyor, Plus'ı açan sunucu
 * bildirimi 5-15 sn sonra gelebiliyor; eskiden düz bir "Ödeme alındı" kartı vardı ve öğrenci
 * uygulamada "Ücretsiz" görüp paniğe kapılıyordu. Şimdi 20 sn boyunca 1,5 sn'de bir durum sorulur:
 * Plus açılınca kısa kutlama ve uygulamaya geçiş; açılmazsa sakin bir "banka onayı uzadı" ekranı.
 * Hiçbir durumda "ödeme başarısız" denmez: PayTR öğrenciyi bu sayfaya yalnız ödeme geçince gönderir.
 */
export function PaymentActivation({
  signedIn,
  forChild = false,
  homeHref = APP_HOME_PATH,
  returnPath,
}: PaymentActivationProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(signedIn ? "waiting" : "signed-out");
  const [round, setRound] = useState(0);
  const [badge, setBadge] = useState<"Plus" | "Sigma">("Plus");

  useEffect(() => {
    if (phase !== "waiting") return;
    let stopped = false;
    let nextTick: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const finish = (to: Phase) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(nextTick);
      clearTimeout(deadline);
      controller?.abort();
      setPhase(to);
    };

    // Süre yoklama sayısından değil saatten: takılan bir istek 20 sn'yi uzatmasın.
    const deadline = setTimeout(() => finish("slow"), ACTIVATION_POLL_WINDOW_MS);

    const tick = async () => {
      if (stopped) return;
      controller = new AbortController();
      const abortTimer = setTimeout(() => controller?.abort(), ACTIVATION_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(PAYMENT_STATUS_URL, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (stopped) return;
        if (res.status === 401) {
          finish("signed-out");
          return;
        }
        if (res.ok) {
          const body = (await res.json()) as ActivationStatus;
          if (stopped) return;
          if (isPlusActivated(body, { forChild })) {
            setBadge(body.badge === "Sigma" ? "Sigma" : "Plus");
            finish("active");
            return;
          }
        }
        // 429, 503 ya da henüz "pending": öğrenciye hata yok, sıradaki yoklama.
      } catch {
        // Ağ kopması ya da zaman aşımı: aynı şekilde sessizce yeniden sorulur.
      } finally {
        clearTimeout(abortTimer);
      }
      if (!stopped) nextTick = setTimeout(() => void tick(), ACTIVATION_POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(nextTick);
      clearTimeout(deadline);
      controller?.abort();
    };
  }, [phase, round, forChild]);

  useEffect(() => {
    if (phase !== "active") return;
    // Hareket azaltma açıksa `celebrate` hiçbir şey çizmez; yönlendirme yine olur.
    celebrate({ colors: CELEBRATION_COLORS, count: 110 });
    const go = setTimeout(() => router.replace(homeHref), ACTIVATION_REDIRECT_MS);
    return () => clearTimeout(go);
  }, [phase, homeHref, router]);

  const retry = useCallback(() => {
    setRound((n) => n + 1);
    setPhase("waiting");
  }, []);

  const loginHref = activationLoginHref(returnPath);
  const planLabel = forChild ? "Plus paketi" : `${badge} paketin`;

  return (
    <section className="cp-payact" data-phase={phase} aria-busy={phase === "waiting"}>
      <div className="cp-payact__glow" aria-hidden />

      <div className="cp-payact__orb" aria-hidden>
        <span className="cp-payact__ring" />
        <span className="cp-payact__core">
          {phase === "active" ? (
            <Check className="cp-payact__core-icon" strokeWidth={3} />
          ) : phase === "slow" ? (
            <Clock3 className="cp-payact__core-icon" />
          ) : phase === "signed-out" ? (
            <LogIn className="cp-payact__core-icon" />
          ) : (
            <span className="cp-payact__plus">+</span>
          )}
        </span>
      </div>

      <div className="cp-payact__copy" role="status" aria-live="polite">
        {phase === "waiting" ? (
          <>
            <h1 className="cp-payact__title">🎉 Ödemen alındı, {planLabel} tanımlanıyor…</h1>
            <p className="cp-payact__detail">
              Bankadan gelen onayı bekliyoruz; genelde birkaç saniye sürer. Bu sayfayı açık bırakman yeter.
            </p>
          </>
        ) : phase === "active" ? (
          <>
            <h1 className="cp-payact__title">
              {forChild ? "Plus paketi öğrencinin hesabında! 🎉" : `${badge} paketin hazır! 🎉`}
            </h1>
            <p className="cp-payact__detail">Seni hemen uygulamaya götürüyoruz…</p>
          </>
        ) : phase === "slow" ? (
          <>
            <h1 className="cp-payact__title">Banka onayı biraz uzadı</h1>
            <p className="cp-payact__detail">
              Bankanın onayı bazen bir dakikayı bulabiliyor. Onay gelince {planLabel} hesabına kendiliğinden
              tanımlanır; ayrıca bir şey yapman gerekmiyor.
            </p>
          </>
        ) : (
          <>
            <h1 className="cp-payact__title">Ödemen alındı</h1>
            <p className="cp-payact__detail">
              {forChild ? "Plus paketi" : "Plus paketin"} ödemeyi yaptığın hesaba tanımlanır. Görmek için hesabına
              giriş yap.
            </p>
          </>
        )}
      </div>

      {phase === "waiting" || phase === "active" ? (
        <ol className="cp-payact__steps" aria-label="Ödeme adımları">
          <li className="cp-payact__step is-done">
            <span className="cp-payact__dot" aria-hidden>
              <Check strokeWidth={3} />
            </span>
            Ödeme
          </li>
          <li className={`cp-payact__step ${phase === "active" ? "is-done" : "is-current"}`}>
            <span className="cp-payact__dot" aria-hidden>
              {phase === "active" ? <Check strokeWidth={3} /> : null}
            </span>
            Banka onayı
          </li>
          <li className={`cp-payact__step ${phase === "active" ? "is-done is-plus" : ""}`}>
            <span className="cp-payact__dot" aria-hidden>
              {phase === "active" ? <Check strokeWidth={3} /> : null}
            </span>
            {forChild ? "Plus" : badge}
          </li>
        </ol>
      ) : null}

      {phase === "waiting" ? (
        // Tur başına yeniden çizilir: "Tekrar kontrol et" çubuğu baştan doldurur.
        <div key={round} className="cp-payact__bar" aria-hidden>
          <span />
        </div>
      ) : null}

      <div className="cp-payact__actions">
        {phase === "active" ? (
          <Link href={homeHref} replace className="cp-payact__btn cp-payact__btn--primary">
            Hemen başla
            <ArrowRight aria-hidden />
          </Link>
        ) : null}

        {phase === "slow" ? (
          <>
            <button type="button" onClick={retry} className="cp-payact__btn cp-payact__btn--primary">
              <RefreshCw aria-hidden />
              Tekrar kontrol et
            </button>
            <p className="cp-payact__links">
              <Link href="/odemeler">Makbuzlarım</Link>
              <span aria-hidden>·</span>
              <Link href="/destek">Destek</Link>
            </p>
          </>
        ) : null}

        {phase === "signed-out" ? (
          <>
            <Link href={loginHref} className="cp-payact__btn cp-payact__btn--primary">
              Giriş yap
              <ArrowRight aria-hidden />
            </Link>
            <p className="cp-payact__links">
              <Link href="/iletisim">Destek</Link>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
