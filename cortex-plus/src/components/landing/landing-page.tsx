import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { CortexLogoReveal } from "@/components/brand/cortex-logo-reveal";
import { AudienceHero } from "@/components/landing/audience-hero";
import { FAQ, FREE_PLAN_POINTS, PLUS_PLAN_POINTS, TRUST_FACTS } from "@/lib/marketing/landing-content";
import { WEEKLY_PLUS_PLAN_NAME } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { formatTryWhole } from "@/lib/format";
import type { PlusPrices } from "@/lib/billing/plan-prices";
import "@/styles/landing.css";

export type LandingPrices = PlusPrices;

const fmtCount = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

/**
 * Ana sayfa. 11 Kasım 2026'da üç bölüme indi (ürün sahibi: "uzun ve tekrarlı metin yığını olmasın; kısa ve net"):
 *
 * 1. Kahraman + dört hedef kitle sekmesi ve 7 adımlı tanıtım turu (`AudienceHero`): ziyaretçi ürünü kendi
 *    tıklamasıyla yaşar.
 * 2. Ücretsiz ile Plus'ın tek ekranda karşılaştırması ve fiyatlar.
 * 3. Sık sorulanlar ve son çağrı.
 *
 * Eski ara bölümler (kanıt şeridi, "Plus'ın bir ayı", dört adım, özellik ızgarası, karşılaştırma tablosu) aynı
 * sözleri üç kez söylüyordu; kalktı. "Plus'ın bir ayı" ödeme sayfasında, özellikler `/ozellikler`de duruyor.
 * Bütün cümleler `landing-content.ts`, `landing-showcase.ts` ve `landing-journey.ts`te; ekrandaki her söz bugün
 * üründe çalışır. Hareket yalnız CSS ile ve `prefers-reduced-motion`da durur.
 */
export function LandingPage({ prices }: { prices: LandingPrices }) {
  const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
  const week = allowanceInWork(PLAN_ALLOWANCES.plusWeekly);
  const sigma = allowanceInWork(PLAN_ALLOWANCES.sigmaMonthly);

  return (
    <div className="lp">
      {/* Kahraman, sekmeler ve tur tek durumda: sekme kayıt bağlantısını da değiştirir. */}
      <AudienceHero />

      <section id="planlar" className="lp-section lp-compare" aria-labelledby="lp-plans-title">
        <div className="lp-wrap" data-cinematic-reveal>
          <h2 id="lp-plans-title" className="lp-h2">
            Ücretsiz başla, sınav döneminde büyüt
          </h2>
          <div className="lp-duo">
            <article className="lp-duo-card">
              <div className="lp-duo-head">
                <h3 className="lp-plan-name">Ücretsiz</h3>
                <p className="lp-plan-price">₺0</p>
              </div>
              <p className="lp-duo-lede">İlk dersin süre sınırı olmadan ücretsiz.</p>
              <ul className="lp-duo-list">
                {FREE_PLAN_POINTS.map((point) => (
                  <li key={point}>
                    <Check className="lp-duo-icon lp-duo-icon--ok" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/kayit" className="lp-btn lp-btn--primary lp-btn--block">
                Ücretsiz başla
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>

            <article className="lp-duo-card lp-duo-card--plus">
              <div className="lp-duo-head">
                <h3 className="lp-plan-name">
                  <Sparkles className="h-4 w-4" aria-hidden /> Plus
                </h3>
                <p className="lp-plan-price">
                  {prices.plusMonthly ? formatTryWhole(prices.plusMonthly) : "—"}
                  <span> / ay</span>
                </p>
              </div>
              <p className="lp-duo-lede">
                Ayda yaklaşık {fmtCount(plus.lessons)} ders ya da {fmtCount(plus.messages)} mesaj; bütün konular açık.
              </p>
              <ul className="lp-duo-list">
                {PLUS_PLAN_POINTS.map((point) => (
                  <li key={point}>
                    <Check className="lp-duo-icon lp-duo-icon--plus" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/kayit?next=%2Fpay" className="lp-btn lp-btn--plus lp-btn--block">
                Plus ile başla
              </Link>
              <p className="lp-duo-week">
                Sınava bir hafta mı kaldı? <strong>{WEEKLY_PLUS_PLAN_NAME}</strong>:{" "}
                {prices.plusWeekly ? formatTryWhole(prices.plusWeekly) : "—"} / 7 gün, yaklaşık {fmtCount(week.lessons)} ders. Tek
                ödeme, abonelik açılmaz.
              </p>
            </article>
          </div>

          <ul className="lp-trustline" aria-label="Güven">
            {TRUST_FACTS.map((fact) => (
              <li key={fact.title}>
                <strong>{fact.title}</strong>
                <span>{fact.body}</span>
              </li>
            ))}
          </ul>

          <Link href="/fiyatlandirma" className="lp-sigma-strip">
            <span>
              🔥 Çok yoğun çalışanlar için: Sigma Paketi (Ayda {fmtCount(sigma.lessons)}{" "}
              ders / {fmtCount(sigma.messages)} mesaj)
            </span>
            <span>Tüm planları karşılaştır →</span>
          </Link>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-faq-wrap" data-cinematic-reveal>
          <h2 id="lp-faq-title" className="lp-h2">
            Sık sorulanlar
          </h2>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details key={item.q} className="lp-faq-item">
                <summary>{item.q}</summary>
                <p className="lp-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final" aria-labelledby="lp-final-title">
        <div className="lp-horizon" aria-hidden />
        <div className="lp-wrap lp-final-inner">
          <CortexLogoReveal size={64} className="lp-final-mark" />
          <h2 id="lp-final-title" className="lp-h2">
            İlk dersin birkaç dakika uzağında
          </h2>
          <p className="lp-muted">Notunu yükle ya da hazır müfredattan başla. Kart istemiyoruz.</p>
          <Link href="/kayit" className="lp-btn lp-btn--primary">
            Ücretsiz başla
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
