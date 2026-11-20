import Link from "next/link";
import { ArrowRight, BookCheck, Check, RefreshCwOff, ShieldCheck, Sparkles, Timer, type LucideIcon } from "lucide-react";
import { CortexLogoReveal } from "@/components/brand/cortex-logo-reveal";
import { AudienceHero } from "@/components/landing/audience-hero";
import { LandingDuel } from "@/components/landing/landing-duel";
import {
  FAQ,
  FAQ_MORE,
  FREE_PLAN_POINTS,
  HOME_COPY,
  PLUS_PLAN_POINTS,
  TRUST_LINE,
  WEEK_PLAN_POINTS,
} from "@/lib/marketing/landing-content";
import { WEEKLY_PLUS_PLAN_NAME } from "@/lib/billing/tier-presentation";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";
import { formatTryWhole } from "@/lib/format";
import type { PlusPrices } from "@/lib/billing/plan-prices";
import "@/styles/landing.css";
import "@/styles/home-cinema.css";
import "@/styles/home-farklar.css";

export type LandingPrices = PlusPrices;

/** Güven satırının simgeleri, `TRUST_LINE` sırasıyla: nota sadakat, yenileme yok, güvenli ödeme. */
const TRUST_ICONS: readonly LucideIcon[] = [BookCheck, RefreshCwOff, ShieldCheck];


/**
 * Ana sayfa. 11 Kasım 2026'da üç tur:
 *
 * Sabah (ürün sahibi: "uzun ve tekrarlı metin yığını olmasın; kısa ve net"): eski ara bölümler kalktı.
 * Akşam ("mavi zemin, mavi düğme klasik yapay zekâ sitesi gibi; yenilikçi, sinematik, fütüristik olsun"): palet
 * sıcak siyah, kâğıt beyazı ve logonun şeridi oldu.
 * Gece, kokpit (canlı denetim: aynı beş özellik sayfada üç kez anlatılıyor, sayfa 5.000 px): dört bölüm kaldı.
 *
 * 1. Kahraman + dört hedef kitle sekmesi + 7 adımlı canlı kokpit, tek ekranda (`AudienceHero`).
 * 2. "Aynı not, iki ayrı sonuç": altı başlıklı, sahneli tek akordeon (`LandingDuel`, `#farklar`; Faz 9, 20 Kasım 2026).
 * 3. Planlar ve güvenceler: Ücretsiz, Plus, Sınav Haftası; altında tek güven satırı (`TRUST_LINE`).
 * 4. Sık sorulanlar (beş soru + Yardım Merkezi bağlantısı) ve son çağrı.
 *
 * Durağan kahraman sahnesi ve film şeridi kalktı: anlattıklarını kokpit canlı gösteriyor. Her bölümde tek başlık,
 * en çok tek cümle. Bütün cümleler `landing-content.ts`, `landing-showcase.ts`, `landing-journey.ts` ve
 * `advantage-content.ts`te; ekrandaki her söz bugün üründe çalışır. Fiyatlar veritabanından okunur. Hareket CSS
 * ile ve `prefers-reduced-motion`da durur.
 */
export function LandingPage({ prices }: { prices: LandingPrices }) {
  // Faz 5 §4: kota metni tek merkezden (`plan-copy.ts`); fiyat sayfasıyla birebir aynı karşılık.
  const { plus, week, sigma } = PLAN_MARKETING_COPY;
  const copy = HOME_COPY.plans;

  return (
    <div className="lp hm">
      {/* Kahraman, sekmeler ve kokpit tek durumda: sekme kayıt bağlantısını ve turun bağlamını da değiştirir. */}
      <AudienceHero />

      <LandingDuel />

      <section id="planlar" className="hm-section lp-compare" aria-labelledby="lp-plans-title">
        <div className="lp-wrap" data-cinematic-reveal>
          <div className="hm-head">
            <h2 id="lp-plans-title" className="hm-h2">
              {copy.title}
            </h2>
          </div>
          <div className="lp-duo lp-trio">
            <article className="lp-duo-card">
              <div className="lp-duo-head">
                <h3 className="lp-plan-name">Ücretsiz</h3>
                <p className="lp-plan-price">₺0</p>
              </div>
              <p className="lp-plan-badge">{copy.freeBadge}</p>
              <p className="lp-duo-lede">{copy.freeLede}</p>
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
                {plus.periodLine}; bütün konular açık.
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
            </article>

            <article className="lp-duo-card lp-duo-card--week">
              <div className="lp-duo-head">
                <h3 className="lp-plan-name">
                  <Timer className="h-4 w-4" aria-hidden /> {WEEKLY_PLUS_PLAN_NAME}
                </h3>
                <p className="lp-plan-price">
                  {prices.plusWeekly ? formatTryWhole(prices.plusWeekly) : "—"}
                  <span> / 7 gün</span>
                </p>
              </div>
              <p className="lp-duo-lede">
                {copy.weekLede} {week.line}.
              </p>
              <ul className="lp-duo-list">
                {WEEK_PLAN_POINTS.map((point) => (
                  <li key={point}>
                    <Check className="lp-duo-icon lp-duo-icon--plus" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/kayit?next=%2Fpay" className="lp-btn lp-btn--ghost lp-btn--block">
                Sınav haftasını başlat
              </Link>
            </article>
          </div>

          {/* Faz 9 (20 Kasım 2026): üç paragraflık güvence listesi yerine tek satır, üç simgeli öğe. */}
          <ul className="lp-trustline" aria-label="Güvenceler" data-testid="trust-line">
            {TRUST_LINE.map((label, at) => {
              const Icon = TRUST_ICONS[at] ?? Check;
              return (
                <li key={label}>
                  <Icon className="lp-trustline-icon" aria-hidden />
                  {label}
                </li>
              );
            })}
          </ul>

          <Link href="/fiyatlandirma" className="lp-sigma-strip">
            <span>
              🔥 Çok yoğun çalışanlar için: Sigma Paketi ({sigma.periodLine})
            </span>
            <span>Tüm planları karşılaştır →</span>
          </Link>
        </div>
      </section>

      <section className="lp-section hm-closing" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-faq-wrap" data-cinematic-reveal>
          <h2 id="lp-faq-title" className="hm-h2 hm-h2--left">
            Sık sorulanlar
          </h2>
          <div className="lp-faq" data-testid="home-faq">
            {FAQ.map((item) => (
              <details key={item.q} className="lp-faq-item">
                <summary>{item.q}</summary>
                <p className="lp-muted">{item.a}</p>
                {item.link ? (
                  <Link href={item.link.href} className="lp-faq-link">
                    {item.link.label}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </details>
            ))}
          </div>
          <p className="lp-faq-more">
            <Link href={FAQ_MORE.href}>
              {FAQ_MORE.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>
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
