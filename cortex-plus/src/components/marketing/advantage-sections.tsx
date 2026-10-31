import Link from "next/link";
import { Check, X } from "lucide-react";
import {
  ADVANTAGE_BADGES,
  ADVANTAGE_BADGES_TITLE,
  ADVANTAGE_ROWS,
  ADVANTAGE_SECTION,
  BLIND_EXPERIMENT_PROOF,
  PRICING_ADVANTAGE,
  SHOW_BLIND_EXPERIMENT_PROOF,
} from "@/lib/marketing/advantage-content";
import "@/styles/advantage.css";

/*
  Vitrin farkları (1 Kasım 2026). Sunucu bileşenleri: istemci kodu, istek ya da yapay zekâ çağrısı yok; misafir
  bu bölümlerden hiçbir ücretli işi tetikleyemez. Metnin tamamı `advantage-content.ts`te.
*/

/** Ana sayfa: 3 sütunlu karşılaştırma. Dar ekranda her satır bir karta döner (yatay taşma yok). */
export function AdvantageComparison() {
  const cols = ADVANTAGE_SECTION.columns;
  return (
    <section id="farklar" className="cx-adv cx-adv-section" aria-labelledby="cx-adv-title" data-testid="advantage-comparison">
      <div className="cx-adv-wrap">
        <p className="cx-adv-kicker">{ADVANTAGE_SECTION.kicker}</p>
        <h2 id="cx-adv-title" className="cx-adv-h2">
          {ADVANTAGE_SECTION.title}
        </h2>
        <p className="cx-adv-lead">{ADVANTAGE_SECTION.lead}</p>
        <div className="cx-adv-table" role="table" aria-label={ADVANTAGE_SECTION.title}>
          <div className="cx-adv-head" role="row">
            <span role="columnheader">{cols.feature}</span>
            <span role="columnheader" className="cx-adv-head-cortex">{cols.cortex}</span>
            <span role="columnheader">{cols.others}</span>
          </div>
          {ADVANTAGE_ROWS.map((row) => (
            <div key={row.id} className="cx-adv-row" role="row">
              <h3 className="cx-adv-feature" role="rowheader">
                {row.feature}
              </h3>
              <div className="cx-adv-cell cx-adv-cell--cortex" role="cell">
                <span className="cx-adv-col-label" aria-hidden>{cols.cortex}</span>
                <p className="cx-adv-verdict cx-adv-verdict--yes">
                  <Check className="cx-adv-icon" aria-hidden />
                  {row.cortex.verdict}
                </p>
                <p className="cx-adv-body">{row.cortex.body}</p>
              </div>
              <div className="cx-adv-cell cx-adv-cell--others" role="cell">
                <span className="cx-adv-col-label" aria-hidden>{cols.others}</span>
                <p className="cx-adv-verdict cx-adv-verdict--no">
                  <X className="cx-adv-icon" aria-hidden />
                  {row.others.verdict}
                </p>
                <p className="cx-adv-body">{row.others.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AdvantageBadges() {
  return (
    <div className="cx-adv-badges-block" data-testid="advantage-badges">
      <p className="cx-adv-kicker">{ADVANTAGE_BADGES_TITLE}</p>
      <ul className="cx-adv-badges">
        {ADVANTAGE_BADGES.map((badge) => (
          <li key={badge.label} className="cx-adv-badge">
            <span className="cx-adv-badge-emoji" aria-hidden>
              {badge.emoji}
            </span>
            <span>{badge.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ana sayfa: kahramanın altında kanıt kartı + 6 rozet. Kanıt kartı tek bayrakla kapanır. */
export function AdvantageShowcase() {
  const proof = BLIND_EXPERIMENT_PROOF;
  return (
    <section className="cx-adv cx-adv-section cx-adv-section--tight" aria-label="Kanıt ve öne çıkanlar" data-testid="advantage-showcase">
      <div className="cx-adv-wrap">
        {SHOW_BLIND_EXPERIMENT_PROOF ? (
          <article className="cx-adv-proof" data-testid="blind-proof">
            <p className="cx-adv-kicker">{proof.kicker}</p>
            <div className="cx-adv-proof-grid">
              <div className="cx-adv-proof-score" aria-hidden>
                <span className="cx-adv-proof-num cx-adv-proof-num--before">
                  {proof.before.value}
                  <small>{proof.before.label}</small>
                </span>
                <span className="cx-adv-proof-arrow">→</span>
                <span className="cx-adv-proof-num cx-adv-proof-num--after">
                  {proof.after.value}
                  <small>{proof.after.label}</small>
                </span>
                <span className="cx-adv-proof-delta">{proof.delta}</span>
              </div>
              <div>
                <p className="cx-adv-proof-body">{proof.body}</p>
                <p className="cx-adv-footnote">{proof.footnote}</p>
              </div>
            </div>
          </article>
        ) : null}
        <AdvantageBadges />
      </div>
    </section>
  );
}

/** /fiyatlandirma: paket kartlarının altında kısa şerit. */
export function PricingAdvantageStrip() {
  return (
    <section className="cx-adv cx-adv-strip" aria-labelledby="cx-adv-strip-title" data-testid="pricing-advantage">
      <h2 id="cx-adv-strip-title" className="cx-adv-strip-title">
        {PRICING_ADVANTAGE.title}
      </h2>
      <ul className="cx-adv-strip-list">
        {PRICING_ADVANTAGE.items.map((item) => (
          <li key={item.title} className="cx-adv-strip-item">
            <span className="cx-adv-badge-emoji" aria-hidden>
              {item.emoji}
            </span>
            <div>
              <h3 className="cx-adv-strip-item-title">{item.title}</h3>
              <p className="cx-adv-body">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /ozellikler ve /ornek: aynı kaynaktan kısa sürüm (yalnız Cortex sütunu) + tam tabloya bağlantı. */
export function AdvantageCompact({ withLink = true }: { withLink?: boolean }) {
  return (
    <section className="cx-adv cx-adv-compact" aria-labelledby="cx-adv-compact-title" data-testid="advantage-compact">
      <p className="cx-adv-kicker">{ADVANTAGE_SECTION.kicker}</p>
      <h2 id="cx-adv-compact-title" className="cx-adv-compact-title">
        {ADVANTAGE_SECTION.title}
      </h2>
      <ul className="cx-adv-compact-list">
        {ADVANTAGE_ROWS.map((row) => (
          <li key={row.id} className="cx-adv-compact-item">
            <h3 className="cx-adv-compact-feature">{row.feature}</h3>
            <p className="cx-adv-body">{row.cortex.body}</p>
          </li>
        ))}
      </ul>
      {withLink ? (
        <Link href="/#farklar" className="cx-adv-link">
          Tam karşılaştırmayı gör →
        </Link>
      ) : null}
    </section>
  );
}
