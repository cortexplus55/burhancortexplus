import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { FAQ, FEATURES, HERO, LESSON_SCENE, PROOF, STEPS, TRUST } from "@/lib/marketing/landing-content";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { formatTryWhole } from "@/lib/format";
import "@/styles/landing.css";

export type LandingPrices = {
  plusMonthly: number | null;
  plusYearly: number | null;
  plusWeekly: number | null;
};

const fmtCount = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

/**
 * Ana sayfa (19 Ekim 2026). Uygulamanın tasarım sistemiyle (Figtree, koyu palet, mavi eylem, 3B
 * simgeler) yazıldı; eski "altın sinematik" sayfa tırnaklı başlık ve olmayan özellikler gösteriyordu.
 * Bütün cümleler `landing-content.ts`te; ders sahnesi gerçek bir dersten.
 */
export function LandingPage({ prices }: { prices: LandingPrices }) {
  const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
  const week = allowanceInWork(PLAN_ALLOWANCES.plusWeekly);
  const yearlyPerMonth = prices.plusYearly ? Math.round(prices.plusYearly / 12 / 100) * 100 : null;

  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">{HERO.eyebrow}</p>
            <h1 id="lp-hero-title" className="lp-hero-title">
              {HERO.title}
            </h1>
            <p className="lp-hero-lead">{HERO.lead}</p>
            <div className="lp-cta-row">
              <Link href={HERO.primary.href} className="lp-btn lp-btn--primary">
                {HERO.primary.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href={HERO.secondary.href} className="lp-btn lp-btn--ghost">
                {HERO.secondary.label}
              </a>
            </div>
            <p className="lp-fineprint">{HERO.fineprint}</p>
          </div>
          <LessonPhone />
        </div>
      </section>

      <section className="lp-proof" aria-label="Neden Cortex Plus">
        <div className="lp-wrap lp-proof-grid">
          {PROOF.map((item) => (
            <article key={item.title} className="lp-proof-card">
              <p className="lp-proof-stat">{item.stat}</p>
              <h2 className="lp-proof-title">{item.title}</h2>
              <p className="lp-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="nasil" className="lp-section" aria-labelledby="lp-steps-title">
        <div className="lp-wrap">
          <p className="lp-kicker">Nasıl çalışır</p>
          <h2 id="lp-steps-title" className="lp-h2">
            Dört adımda nottan sınava
          </h2>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="lp-step">
                <Icon3D name={step.icon} size={56} />
                <span className="lp-step-no">{index + 1}</span>
                <h3 className="lp-h3">{step.title}</h3>
                <p className="lp-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-section lp-section--alt" aria-labelledby="lp-teacher-title">
        <div className="lp-wrap lp-split">
          <div className="lp-split-copy">
            <p className="lp-kicker">Gerçek bir dersten</p>
            <h2 id="lp-teacher-title" className="lp-h2">
              Öğretmenin işaretlediği gibi
            </h2>
            <ul className="lp-trust">
              {TRUST.map((item) => (
                <li key={item.title}>
                  <Check className="lp-trust-icon" aria-hidden />
                  <div>
                    <h3 className="lp-h3">{item.title}</h3>
                    <p className="lp-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <LessonCard />
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-features-title">
        <div className="lp-wrap">
          <p className="lp-kicker">Her konu için</p>
          <h2 id="lp-features-title" className="lp-h2">
            Bir konuyu birçok yoldan çalış
          </h2>
          <div className="lp-features">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="lp-feature">
                <Icon3D name={feature.icon} size={44} />
                <div className="min-w-0">
                  <h3 className="lp-h3">
                    {feature.title}
                    {feature.plusOnly ? <span className="lp-plus-chip">Plus</span> : null}
                  </h3>
                  <p className="lp-muted">{feature.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="planlar" className="lp-section lp-section--alt" aria-labelledby="lp-plans-title">
        <div className="lp-wrap">
          <p className="lp-kicker">Planlar</p>
          <h2 id="lp-plans-title" className="lp-h2">
            Ücretsiz başla, sınav döneminde büyüt
          </h2>
          <div className="lp-plans">
            <article className="lp-plan">
              <h3 className="lp-plan-name">Ücretsiz</h3>
              <p className="lp-plan-price">₺0</p>
              <ul className="lp-plan-list">
                <li>Her gün bir ders, bir test ya da iki sohbet mesajı</li>
                <li>Bir sınav hazırlığı</li>
                <li>Toplam {FREE_PAGE_TOTAL} sayfa belge</li>
                <li>Ders, konu testi, kartlar, doğru/yanlış, AI öğretmen</li>
              </ul>
              <Link href="/kayit" className="lp-btn lp-btn--ghost lp-btn--block">
                Ücretsiz başla
              </Link>
            </article>
            <article className="lp-plan lp-plan--featured">
              <p className="lp-plan-badge">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Önerilen
              </p>
              <h3 className="lp-plan-name">Plus</h3>
              <p className="lp-plan-price">
                {prices.plusMonthly ? formatTryWhole(prices.plusMonthly) : "—"}
                <span> / ay</span>
              </p>
              {yearlyPerMonth ? (
                <p className="lp-plan-note">Yıllık alırsan ayda {formatTryWhole(yearlyPerMonth)}</p>
              ) : null}
              <ul className="lp-plan-list">
                <li>
                  Ayda yaklaşık {fmtCount(plus.lessons)} ders ya da {fmtCount(plus.messages)} mesaj
                </li>
                <li>Podcast, sözlü ve yazılı deneme, video ders</li>
                <li>Belgenin tamamı, sınırsız hazırlık</li>
                <li>Hazır içerik yokken daha hızlı yazım</li>
              </ul>
              <Link href="/kayit?next=%2Fpay" className="lp-btn lp-btn--plus lp-btn--block">
                Plus ile başla
              </Link>
            </article>
            <article className="lp-plan">
              <h3 className="lp-plan-name">Sınav haftası</h3>
              <p className="lp-plan-price">
                {prices.plusWeekly ? formatTryWhole(prices.plusWeekly) : "—"}
                <span> / 7 gün</span>
              </p>
              <ul className="lp-plan-list">
                <li>
                  Bir hafta Plus: yaklaşık {fmtCount(week.lessons)} ders ya da {fmtCount(week.messages)} mesaj
                </li>
                <li>Tek ödeme, abonelik açılmaz</li>
                <li>Sınavdan önceki son sprint için</li>
              </ul>
              <Link href="/kayit?next=%2Fpay" className="lp-btn lp-btn--ghost lp-btn--block">
                Haftalık al
              </Link>
            </article>
          </div>
          <p className="lp-plans-foot">
            Abonelik kendiliğinden yenilenmez. Ödeme PayTR ile; kart bilgisi bize gelmez.{" "}
            <Link href="/fiyatlandirma">Bütün planları karşılaştır</Link>
          </p>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-faq-wrap">
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
        <div className="lp-wrap lp-final-inner">
          <Icon3D name="bos-hazirlik" size={72} />
          <h2 id="lp-final-title" className="lp-h2">
            İlk dersin birkaç dakika uzağında
          </h2>
          <p className="lp-muted">Notunu yükle ya da sınavını yaz. Kart istemiyoruz.</p>
          <Link href="/kayit" className="lp-btn lp-btn--primary">
            Ücretsiz başla
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Hero'daki telefon: dersin "önce dene" ekranı, gerçek bir dersten. */
function LessonPhone() {
  const scene = LESSON_SCENE;
  return (
    <figure className="lp-phone" aria-label="Ders ekranı örneği">
      <div className="lp-phone-screen">
        <div className="lp-phone-top">
          <span className="lp-phone-progress">
            <span style={{ width: "34%" }} />
          </span>
          <span className="lp-phone-x" aria-hidden>
            ×
          </span>
        </div>
        <p className="lp-phone-topic">{scene.topic}</p>
        <p className="lp-phone-kicker">Önce dene · Doğru mu, yanlış mı?</p>
        <p className="lp-phone-prompt">{scene.tryFirst.prompt}</p>
        <div className="lp-phone-options">
          <span className="lp-option">Doğru</span>
          <span className="lp-option lp-option--right">
            {scene.tryFirst.answer}
            <Check className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <div className="lp-phone-answer">
          <p className="lp-phone-answer-title">Doğrusu</p>
          <p>{scene.tryFirst.corrected}</p>
        </div>
        <span className="lp-phone-next">Devam et</span>
      </div>
      <figcaption className="lp-caption">Gerçek bir ders ekranı · Çocuk Sağlığı notundan</figcaption>
    </figure>
  );
}

/** Turuncu vurgu ve tablo: aynı dersin bir sonraki ekranı. */
function LessonCard() {
  const { screen } = LESSON_SCENE;
  return (
    <figure className="lp-lesson-card" aria-label="Ders ekranı örneği: vurgu ve tablo">
      <p className="lp-lesson-chip">Sınavda sorulur</p>
      <h3 className="lp-lesson-heading">{screen.heading}</h3>
      <p className="lp-lesson-text">
        {screen.before}
        <mark>{screen.emphasis}</mark>
        {screen.after}
      </p>
      <div className="lp-table-wrap">
        <table className="lp-table">
          <thead>
            <tr>
              {screen.table.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {screen.table.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="lp-caption">Turuncu: notunda sınav ipucu olarak geçen yer</figcaption>
    </figure>
  );
}
