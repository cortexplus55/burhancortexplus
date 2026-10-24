import Link from "next/link";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import { CortexLogoReveal } from "@/components/brand/cortex-logo-reveal";
import { Icon3D } from "@/components/ui/icon-3d";
import {
  FAQ,
  FEATURES,
  HERO,
  LESSON_SCENE,
  PROOF,
  STAGE,
  STEPS,
  TRUST,
  type LandingFeature,
} from "@/lib/marketing/landing-content";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { formatTryWhole } from "@/lib/format";
import { PlusMonth } from "@/components/marketing/plus-month";
import type { PlusPrices } from "@/lib/billing/plan-prices";
import { cn } from "@/lib/utils";
import "@/styles/landing.css";

export type LandingPrices = PlusPrices;

const fmtCount = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

/**
 * Ana sayfa. 19 Ekim 2026'da uygulamanın tasarım sistemiyle yazıldı; aynı gün ürün sahibinin
 * isteğiyle sinematik hale geldi ("daha fütüristik, ama dozu kararında"): kahramanda ışık, ufka
 * uzanan ızgara ve nottan ders ekranına uzanan bir sahne. Bütün cümleler `landing-content.ts`te;
 * sahnedeki her ekran üründe var. Hareket yalnız CSS ile ve `prefers-reduced-motion`da durur.
 */
export function LandingPage({ prices }: { prices: LandingPrices }) {
  const plus = allowanceInWork(PLAN_ALLOWANCES.plusMonthly);
  const week = allowanceInWork(PLAN_ALLOWANCES.plusWeekly);

  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-hero-bg" aria-hidden>
          <div className="lp-aurora" />
          <div className="lp-floor" />
        </div>
        <div className="lp-wrap lp-hero-inner">
          <p className="lp-eyebrow">
            <span className="lp-live" aria-hidden />
            {HERO.eyebrow}
          </p>
          <h1 id="lp-hero-title" className="lp-hero-title">
            {HERO.titleLead} <span className="lp-glow-text">{HERO.titleAccent}</span>
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
        <HeroStage />
      </section>

      <section className="lp-proof" aria-label="Neden Cortex Plus">
        <div className="lp-wrap">
          <div className="lp-proof-bar">
            {PROOF.map((item) => (
              <article key={item.title} className="lp-proof-item">
                <p className="lp-proof-stat">{item.stat}</p>
                <h2 className="lp-proof-title">{item.title}</h2>
                <p className="lp-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Plus'ın değeri somut sayıyla (20 Ekim 2026): misafirin ikinci gördüğü şey. */}
      <PlusMonth
        variant="full"
        monthlyKurus={prices.plusMonthly}
        primary={{ label: "Plus ile başla", href: "/kayit?next=%2Fpay" }}
        secondary={{ label: "Önce ücretsiz dene", href: "/kayit" }}
      />

      <section id="nasil" className="lp-section" aria-labelledby="lp-steps-title">
        <div className="lp-wrap" data-cinematic-reveal>
          <p className="lp-kicker">Nasıl çalışır</p>
          <h2 id="lp-steps-title" className="lp-h2">
            Dört adımda nottan sınava
          </h2>
          <ol className="lp-flow">
            {STEPS.map((step, index) => (
              <li key={step.title} className="lp-flow-step">
                <span className="lp-flow-node">
                  <Icon3D name={step.icon} size={44} />
                  <span className="lp-flow-no">{index + 1}</span>
                </span>
                <h3 className="lp-h3">{step.title}</h3>
                <p className="lp-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-section lp-section--glow" aria-labelledby="lp-teacher-title">
        <div className="lp-wrap lp-split" data-cinematic-reveal>
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
        <div className="lp-wrap" data-cinematic-reveal>
          <p className="lp-kicker">Her konu için</p>
          <h2 id="lp-features-title" className="lp-h2">
            Bir konuyu birçok yoldan çalış
          </h2>
          <div className="lp-bento">
            {FEATURES.map((feature) => (
              <FeatureTile key={feature.title} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      <section id="planlar" className="lp-section lp-section--alt" aria-labelledby="lp-plans-title">
        <div className="lp-wrap" data-cinematic-reveal>
          <p className="lp-kicker">Planlar</p>
          <h2 id="lp-plans-title" className="lp-h2">
            Ücretsiz başla, sınav döneminde büyüt
          </h2>
          <div className="lp-plans">
            <article className="lp-plan">
              <h3 className="lp-plan-name">Ücretsiz</h3>
              <p className="lp-plan-price">₺0</p>
              <ul className="lp-plan-list">
                <li>Haftada 3 ders (testleri ve kartlarıyla), günde 3 mesaj</li>
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

/**
 * Kahraman sahnesi: solda notun sayfası (bir ışık satırları okur), ortada dersin "önce dene" ekranı,
 * sağda hazırlık yolu ve "+%X kazandın" kartı. Telefonda yalnız ders ekranı ve kazanç kartı kalır.
 */
function HeroStage() {
  const { note, path, gain } = STAGE;
  return (
    <div className="lp-stage" aria-label="Notundan derse: ürün ekranlarından bir sahne" role="img">
      <div className="lp-stage-note lp-float" aria-hidden>
        <div className="lp-note-head">
          <span className="lp-note-pdf">PDF</span>
          <span>{note.file}</span>
        </div>
        <p className="lp-note-heading">{note.heading}</p>
        <span className="lp-note-line" style={{ width: "92%" }} />
        <span className="lp-note-line" style={{ width: "78%" }} />
        <span className="lp-note-line" style={{ width: "86%" }} />
        <div className="lp-note-tip">
          <span>SINAV İPUCU</span>
          <p>{note.tip}</p>
        </div>
        <span className="lp-note-line" style={{ width: "70%" }} />
        <span className="lp-note-line" style={{ width: "88%" }} />
        <span className="lp-note-line" style={{ width: "54%" }} />
        <span className="lp-note-scan" />
      </div>

      <svg className="lp-beam lp-beam--left" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lp-beam-l" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb27a" stopOpacity="0" />
            <stop offset=".5" stopColor="#ffb27a" stopOpacity=".55" />
            <stop offset="1" stopColor="#8e98ff" stopOpacity=".7" />
          </linearGradient>
        </defs>
        <path d="M0 90 C 70 90, 120 30, 200 30" stroke="url(#lp-beam-l)" strokeWidth="1.5" fill="none" />
        <path d="M0 90 C 70 90, 120 30, 200 30" className="lp-beam-pulse" fill="none" />
      </svg>

      <LessonPhone />

      <svg className="lp-beam lp-beam--right" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lp-beam-r" x1="0" x2="1">
            <stop offset="0" stopColor="#8e98ff" stopOpacity=".7" />
            <stop offset="1" stopColor="#8e98ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 40 C 80 40, 110 80, 200 80" stroke="url(#lp-beam-r)" strokeWidth="1.5" fill="none" />
        <path d="M0 40 C 80 40, 110 80, 200 80" className="lp-beam-pulse lp-beam-pulse--late" fill="none" />
      </svg>

      <div className="lp-stage-path lp-float lp-float--slow" aria-hidden>
        <p className="lp-path-title">
          {path.title}
          <span>{path.subtitle}</span>
        </p>
        <ol>
          {path.nodes.map((node) => (
            <li key={node.label} className={cn("lp-path-node", `is-${node.state}`)}>
              <span className="lp-path-dot">{node.state === "done" ? <Check className="h-3 w-3" /> : null}</span>
              <span className="lp-path-label">{node.label}</span>
              {node.state === "next" ? <span className="lp-path-next">Sıradaki</span> : null}
              {"plus" in node && node.plus ? (
                <span className="lp-path-plus">
                  <Lock className="h-3 w-3" />
                  Plus
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="lp-gain lp-float lp-float--late" aria-hidden>
        <span className="lp-gain-value">{gain.value}</span>
        <span className="lp-gain-detail">{gain.detail}</span>
      </div>
    </div>
  );
}

/** Ortadaki telefon: dersin "önce dene" ekranı, gerçek bir dersten. */
function LessonPhone() {
  const scene = LESSON_SCENE;
  return (
    <figure className="lp-phone" aria-label="Ders ekranı örneği">
      <div className="lp-phone-screen">
        <span className="lp-phone-notch" aria-hidden />
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

/** Özellik ızgarası: ders ve podcast kendi küçük ekranlarıyla, öbürleri simge ve tek cümle. */
function FeatureTile({ feature }: { feature: LandingFeature }) {
  return (
    <article className={cn("lp-tile", feature.size && `lp-tile--${feature.size}`)}>
      <div className="lp-tile-head">
        <Icon3D name={feature.icon} size={feature.size === "hero" ? 56 : 44} />
        <div className="min-w-0">
          <h3 className="lp-h3">
            {feature.title}
            {feature.plusOnly ? <span className="lp-plus-chip">Plus</span> : null}
          </h3>
          <p className="lp-muted">{feature.body}</p>
        </div>
      </div>
      {feature.icon === "ders" ? <MiniLesson /> : null}
      {feature.icon === "podcast" ? <Waveform /> : null}
    </article>
  );
}

function MiniLesson() {
  const { quiz } = LESSON_SCENE;
  return (
    <div className="lp-mini-lesson" aria-hidden>
      <p className="lp-mini-chip">Konu testi</p>
      <p className="lp-mini-text">{quiz.prompt}</p>
      <div className="lp-mini-options">
        {quiz.options.map((option) => (
          <span key={option} className={option === quiz.answer ? "is-right" : undefined}>
            {option}
            {option === quiz.answer ? <Check className="h-3.5 w-3.5" /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

const WAVE = [6, 14, 22, 12, 28, 18, 9, 24, 32, 16, 8, 20, 30, 14, 22, 10, 26, 18, 12, 6, 16, 24, 10, 20];

function Waveform() {
  return (
    <div className="lp-wave" aria-hidden>
      <span className="lp-wave-who">Ada</span>
      <span className="lp-wave-bars">
        {WAVE.map((h, i) => (
          <span key={i} style={{ height: `${h}px`, animationDelay: `${(i % 8) * 0.12}s` }} />
        ))}
      </span>
      <span className="lp-wave-who">Kerem</span>
    </div>
  );
}
