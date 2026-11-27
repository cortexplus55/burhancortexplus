import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { JsonLd } from "@/components/seo/json-ld";
import { Icon3D } from "@/components/ui/icon-3d";
import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_FIRST_LESSON_SENTENCE } from "@/lib/billing/free-tier-copy";
import { loadPublicPlanOffers, type PublicPlanOffer } from "@/lib/billing/public-plan-offers";
import { storePeriodUnit } from "@/lib/billing/store-products";
import { getProgram } from "@/lib/curriculum/registry";
import { treeLabelFor } from "@/lib/curriculum/seo";
import { formatTryWhole } from "@/lib/format";
import { EXAM_LANDING_LINKS } from "@/lib/marketing/exam-landing-links";
import { EXAM_LANDINGS, examLandingSummary, type ExamLanding, type ExamLandingId } from "@/lib/marketing/exam-landings";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import { createPublicReadClient } from "@/lib/supabase/public-read";
import "@/styles/landing.css";
import "@/styles/exam-landing.css";

/*
  Sınav açılış sayfası (27 Kasım 2026, SEO ve GEO). Tamamı sunucuda çizilir: tanım, özellikler, müfredat bağlantıları,
  fiyatlar ve sık sorulanların cevapları ilk HTML'de (yapay zekâ tarayıcıları tıklamadan okur). İstemci kodu yok,
  Suspense yok. Metinler `exam-landings.ts`'te; fiyatlar her istekte `plans` tablosundan (sayfa 5 dakikada bir tazelenir),
  okunamazsa fiyat yazılmaz ve fiyat sayfasına gönderilir.
*/

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

/** Gezinme yolu: sayfada görünen ve yapılandırılmış veriyle aynı üç adım. */
export function examLandingCrumbs(landing: ExamLanding) {
  return [
    { name: "Cortex Plus", path: "/" },
    { name: "Sınav hazırlığı", path: "/sinav-hazirligi" },
    { name: landing.navLabel, path: landing.path },
  ] as const;
}

/** Sayfanın tek `@graph`'ı: kurum, site, sayfa, gezinme yolu ve sık sorulanlar (sayfadaki metnin aynısı). */
export function examLandingJsonLd(landing: ExamLanding) {
  return [
    organizationJsonLd(),
    websiteJsonLd(),
    webPageJsonLd({
      name: landing.metaTitle,
      description: landing.metaDescription,
      path: landing.path,
      breadcrumb: true,
      about: "software",
    }),
    breadcrumbJsonLd(examLandingCrumbs(landing)),
    faqPageJsonLd(
      landing.faq.map((item) => ({ question: item.q, answer: item.a })),
      landing.path,
    ),
  ];
}

/** Notu olmayan öğrencinin başlayacağı programlar; kayıt defterinde olmayan kimlik atlanır. */
function landingPrograms(landing: ExamLanding) {
  return landing.programIds.flatMap((id) => {
    const program = getProgram(id);
    if (!program) return [];
    return [
      {
        id,
        href: `/mufredat/${id}`,
        label: program.label,
        note: treeLabelFor(program) ?? program.badge,
        units: program.units.length,
      },
    ];
  });
}

function PlanLines({ offers }: { offers: readonly PublicPlanOffer[] }) {
  return (
    <ul className="xl-plans" data-testid="exam-landing-plans">
      <li className="xl-plan">
        <span className="xl-plan-name">Ücretsiz</span>
        <span className="xl-plan-note">Kart istenmez; {lowerFirst(FREE_TIER_SENTENCE)}.</span>
      </li>
      {offers.map((offer) => (
        <li key={offer.slug} className="xl-plan">
          <span className="xl-plan-name">{offer.label}</span>
          <span className="xl-plan-price">
            {formatTryWhole(offer.priceKurus)}
            <span className="xl-plan-period">
              {" "}
              / {offer.period === "weekly" ? `${offer.periodDays} gün` : storePeriodUnit(offer.period)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export async function ExamLandingPage({ id }: { id: ExamLandingId }) {
  const landing = EXAM_LANDINGS[id];
  const offers = await loadPublicPlanOffers(createPublicReadClient());
  const programs = landingPrograms(landing);
  const crumbs = examLandingCrumbs(landing);
  const others = EXAM_LANDING_LINKS.filter((link) => link.id !== id);
  const titleId = `${id}-title`;

  return (
    <ParityMarketingPage variant="marketing">
      <JsonLd data={examLandingJsonLd(landing)} />
      <div className="lp xl" data-exam-landing={id}>
        <section className="lp-hero xl-hero" aria-labelledby={titleId}>
          <div className="lp-wrap">
            <nav aria-label="Gezinme yolu" className="xl-crumbs">
              <ol>
                {crumbs.map((crumb, index) =>
                  index === crumbs.length - 1 ? (
                    <li key={crumb.path} aria-current="page">
                      {crumb.name}
                    </li>
                  ) : (
                    <li key={crumb.path}>
                      <Link href={crumb.path}>{crumb.name}</Link>
                    </li>
                  ),
                )}
              </ol>
            </nav>
            <p className="lp-eyebrow">{landing.eyebrow}</p>
            <h1 id={titleId} className="lp-hero-title xl-title">
              {landing.h1}
            </h1>
            {/* Tanım: iki cümle, sayfanın ilk kelimeleri arasında ve tek başına alıntılanabilir. */}
            <p className="lp-hero-lead xl-define" data-exam-definition>
              {examLandingSummary(landing)}
            </p>
            <div className="lp-cta-row xl-cta-row">
              <Link href={landing.signupHref} className="lp-btn lp-btn--primary">
                Ücretsiz başla
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/ornek" className="lp-btn lp-btn--ghost">
                Örnek dersi incele
              </Link>
            </div>
            <p className="lp-fineprint">Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}</p>
          </div>
        </section>

        <section className="lp-section xl-section" aria-labelledby={`${id}-features`}>
          <div className="lp-wrap">
            <h2 id={`${id}-features`} className="lp-h2">
              {landing.featuresTitle}
            </h2>
            <ul className="xl-features">
              {landing.features.map((feature) => (
                <li key={feature.title} className="xl-feature">
                  <Icon3D name={feature.icon} size={44} />
                  <div className="xl-feature-copy">
                    <h3 className="lp-h3">
                      {feature.title}
                      {feature.chip ? <span className="lp-plus-chip">{feature.chip}</span> : null}
                    </h3>
                    <p className="lp-muted">{feature.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-section--alt xl-section" aria-labelledby={`${id}-programs`}>
          <div className="lp-wrap">
            <h2 id={`${id}-programs`} className="lp-h2">
              {landing.programsTitle}
            </h2>
            <p className="lp-muted xl-lead">{landing.programsLead}</p>
            <ul className="xl-programs" data-testid="exam-landing-programs">
              {programs.map((program) => (
                <li key={program.id}>
                  <Link href={program.href} className="xl-program">
                    <span className="xl-program-name">{program.label}</span>
                    <span className="xl-program-note">
                      {program.units} ünite · {program.note}
                    </span>
                    <ArrowRight className="xl-program-arrow h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="xl-more">
              <Link href="/mufredat" className="lp-faq-link">
                Bütün resmî müfredatı gör
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </p>
          </div>
        </section>

        <section className="lp-section xl-section" aria-labelledby={`${id}-plans`}>
          <div className="lp-wrap">
            <h2 id={`${id}-plans`} className="lp-h2">
              Paketler
            </h2>
            <p className="lp-muted xl-lead">
              Fiyatlar KDV dahildir; web&apos;den alınan paket kendiliğinden yenilenmez.
            </p>
            <PlanLines offers={offers} />
            <p className="xl-more">
              <Link href="/fiyatlandirma" className="lp-faq-link">
                Paketleri karşılaştır
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </p>
          </div>
        </section>

        {/* "Cevap önce" sık sorulanlar; aynı metin FAQPage yapılandırılmış verisine gider. */}
        <AnswerFaqSection id={`${id}-faq`} title="Sık sorulanlar" items={landing.faq} />

        <section className="lp-section lp-section--alt xl-section" aria-labelledby={`${id}-others`}>
          <div className="lp-wrap">
            <h2 id={`${id}-others`} className="lp-h2">
              Başka bir sınava mı hazırlanıyorsun?
            </h2>
            <ul className="xl-exams">
              {others.map((link) => (
                <li key={link.id}>
                  <Link href={link.path} className="xl-exam">
                    {link.navLabel}
                    <span className="xl-exam-note">{link.examLabel}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/sinav-hazirligi" className="xl-exam">
                  Sınav hazırlığı
                  <span className="xl-exam-note">Çalışma yolu nasıl kurulur</span>
                </Link>
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-final" aria-labelledby={`${id}-final`}>
          <div className="lp-wrap lp-final-inner">
            <Icon3D name="bos-hazirlik" size={72} />
            <h2 id={`${id}-final`} className="lp-h2">
              Notunla dene
            </h2>
            <p className="lp-muted">Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}</p>
            <Link href={landing.signupHref} className="lp-btn lp-btn--primary">
              Ücretsiz başla
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
