import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { CortexLogoReveal } from "@/components/brand/cortex-logo-reveal";
import { AudienceHero } from "@/components/landing/audience-hero";
import { FeatureReel } from "@/components/landing/feature-reel";
import { LandingDuel } from "@/components/landing/landing-duel";
import { FAQ, FREE_PLAN_POINTS, PLUS_PLAN_POINTS, TRUST_FACTS } from "@/lib/marketing/landing-content";
import { WEEKLY_PLUS_PLAN_NAME } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { formatTryWhole } from "@/lib/format";
import type { PlusPrices } from "@/lib/billing/plan-prices";
import "@/styles/landing.css";
import "@/styles/home-cinema.css";

export type LandingPrices = PlusPrices;

const fmtCount = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

/**
 * Ana sayfa. 11 Kasım 2026'da iki tur:
 *
 * Sabah (ürün sahibi: "uzun ve tekrarlı metin yığını olmasın; kısa ve net"): eski ara bölümler kalktı.
 * Akşam (ürün sahibi: "mavi zemin, mavi düğme klasik yapay zekâ sitesi gibi; yenilikçi, sinematik, fütüristik
 * olsun; ana ekran boş kalmış, karşılaştırmalarımız da olsun"): sayfa bir filmin sahneleri gibi kuruldu.
 *
 * 1. Kahraman: söz + sahne (ders notu ve ondan çıkan ışık şeridi), dört hedef kitle sekmesi (`AudienceHero`).
 * 2. Tanıtım turu: ziyaretçi ürünü kendi tıklamasıyla yaşar.
 * 3. Karşılaştırma düellosu ve kör deney kartı (`LandingDuel`, `#farklar`).
 * 4. Film şeridi: ürünün etkinlikleri tek satırda (`FeatureReel`).
 * 5. Ücretsiz ile Plus, güven satırı.
 * 6. Sık sorulanlar ve son çağrı.
 *
 * Her sahnede tek başlık, en çok tek cümle; gerisini görsel söyler. Palet `home-cinema.css`te: sıcak siyah zemin,
 * kâğıt beyazı eylem, logonun renk şeridi. Bütün cümleler `landing-content.ts`, `landing-showcase.ts`,
 * `landing-journey.ts` ve `advantage-content.ts`te; ekrandaki her söz bugün üründe çalışır. Hareket CSS ile ve
 * `prefers-reduced-motion`da durur.
 */
export function LandingPage({ prices }: { prices: LandingPrices }) {
  const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
  const week = allowanceInWork(PLAN_ALLOWANCES.plusWeekly);
  const sigma = allowanceInWork(PLAN_ALLOWANCES.sigmaMonthly);

  return (
    <div className="lp hm">
      {/* Kahraman, sekmeler ve tur tek durumda: sekme kayıt bağlantısını da değiştirir. */}
      <AudienceHero />

      <LandingDuel />

      <FeatureReel />

      <section id="planlar" className="hm-section lp-compare" aria-labelledby="lp-plans-title">
        <div className="lp-wrap" data-cinematic-reveal>
          <div className="hm-head">
            <h2 id="lp-plans-title" className="hm-h2">
              Ücretsiz başla, sınav döneminde büyüt
            </h2>
          </div>
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
          <h2 id="lp-faq-title" className="hm-h2 hm-h2--left">
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
          <h2 id="lp-final-title" className="hm-h2 hm-h2--end">
            İlk dersin birkaç dakika uzağında
          </h2>
          <p className="lp-muted">Notunu yükle ya da hazır müfredattan başla. Kart istemiyoruz.</p>
          <Link href="/kayit" className="lp-btn lp-btn--primary hm-cta">
            Ücretsiz başla
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
