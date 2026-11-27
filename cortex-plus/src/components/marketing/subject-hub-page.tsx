import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { JsonLd } from "@/components/seo/json-ld";
import { Icon3D } from "@/components/ui/icon-3d";
import { FREE_FIRST_LESSON_SENTENCE } from "@/lib/billing/free-tier-copy";
import { GUIDE_LINKS, guidePath, SUBJECT_HUB_LINKS, SUBJECT_INDEX_PATH } from "@/lib/marketing/content-hub-links";
import {
  scopeCount,
  scopePrograms,
  SUBJECT_HUBS,
  subjectHubSummary,
  type SubjectHub,
} from "@/lib/marketing/subject-hubs";
import type { SubjectHubId } from "@/lib/marketing/content-hub-links";
import { absoluteUrl } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  ORGANIZATION_ID,
  organizationJsonLd,
  webPageJsonLd,
  WEBSITE_ID,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import "@/styles/landing.css";
import "@/styles/exam-landing.css";

/*
  Ders açılış sayfası (27 Kasım 2026, SEO ve GEO). Tamamı sunucuda çizilir; istemci kodu ve Suspense yok. Metin
  `subject-hubs.ts`'te; soru ve ünite sayıları kayıt defterinden. Fiyat yazılmaz (fiyat sayfasına bağlanır).
*/

export function subjectHubCrumbs(hub: SubjectHub) {
  return [
    { name: "Cortex Plus", path: "/" },
    { name: "Dersler", path: SUBJECT_INDEX_PATH },
    { name: hub.name, path: hub.path },
  ] as const;
}

/** Tek `@graph`: kurum, site, sayfa, öğrenme kaynağı (ders), gezinme yolu, sık sorulanlar. */
export function subjectHubJsonLd(hub: SubjectHub) {
  const url = absoluteUrl(hub.path);
  const exams = hub.scope.map((row) => row.exam);
  const parts = hub.scope.flatMap((row) => scopePrograms(row));
  const uniqueParts = [...new Map(parts.map((part) => [part.href, part])).values()];
  return [
    organizationJsonLd(),
    websiteJsonLd(),
    webPageJsonLd({
      name: hub.metaTitle,
      description: hub.metaDescription,
      path: hub.path,
      breadcrumb: true,
      about: "software",
      mainEntity: { "@id": `${url}#ders` },
    }),
    {
      "@type": "LearningResource",
      "@id": `${url}#ders`,
      name: hub.name,
      description: subjectHubSummary(hub),
      url,
      inLanguage: "tr-TR",
      learningResourceType: "Ders çalışma programı",
      educationalLevel: exams,
      teaches: hub.name,
      isPartOf: { "@id": WEBSITE_ID },
      provider: { "@id": ORGANIZATION_ID },
      hasPart: uniqueParts.map((part) => ({
        "@type": "LearningResource",
        name: part.label,
        url: absoluteUrl(part.href),
      })),
    },
    breadcrumbJsonLd(subjectHubCrumbs(hub)),
    faqPageJsonLd(
      hub.faq.map((item) => ({ question: item.q, answer: item.a })),
      hub.path,
    ),
  ];
}

export function SubjectHubPage({ id }: { id: SubjectHubId }) {
  const hub = SUBJECT_HUBS[id];
  const crumbs = subjectHubCrumbs(hub);
  const others = SUBJECT_HUB_LINKS.filter((link) => link.id !== id);
  const guides = GUIDE_LINKS.filter((guide) => hub.guides.includes(guide.slug));
  const titleId = `ders-${id}-title`;

  return (
    <ParityMarketingPage variant="marketing">
      <JsonLd data={subjectHubJsonLd(hub)} />
      <div className="lp xl" data-subject-hub={id}>
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
            <p className="lp-eyebrow">{hub.eyebrow}</p>
            <h1 id={titleId} className="lp-hero-title xl-title">
              {hub.h1}
            </h1>
            {/* Tanım: iki cümle, sayfanın ilk kelimeleri arasında ve tek başına alıntılanabilir. */}
            <p className="lp-hero-lead xl-define" data-subject-definition>
              {subjectHubSummary(hub)}
            </p>
            <div className="lp-cta-row xl-cta-row">
              <Link href="/kayit" className="lp-btn lp-btn--primary">
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

        <section className="lp-section xl-section" aria-labelledby={`ders-${id}-scope`}>
          <div className="lp-wrap">
            <h2 id={`ders-${id}-scope`} className="lp-h2">
              Sınavlara göre {hub.lower}
            </h2>
            <p className="lp-muted xl-lead">
              Soru sayıları MEB ve ÖSYM&apos;nin 2026 kılavuzlarından; konu listeleri resmî kazanımlardan ve konu ağaçlarından.
            </p>
            <ul className="xl-scope" data-testid="subject-scope">
              {hub.scope.map((row) => {
                const count = scopeCount(row);
                const programs = scopePrograms(row);
                return (
                  <li key={row.exam} className="xl-scope-row">
                    <div className="xl-scope-head">
                      <h3 className="lp-h3">{row.exam}</h3>
                      {count != null ? <span className="xl-scope-count">{count} soru</span> : null}
                    </div>
                    <p className="lp-muted">{row.note}</p>
                    {programs.length ? (
                      <ul className="xl-scope-links">
                        {programs.map((program) => (
                          <li key={program.href}>
                            <Link href={program.href}>
                              {program.label}
                              <span className="xl-scope-units"> · {program.units} ünite</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.link ? (
                      <Link href={row.link.href} className="lp-faq-link">
                        {row.link.label}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-section--alt xl-section" aria-labelledby={`ders-${id}-features`}>
          <div className="lp-wrap">
            <h2 id={`ders-${id}-features`} className="lp-h2">
              Cortex Plus&apos;ta {hub.lower} nasıl çalışılır
            </h2>
            <ul className="xl-features">
              {hub.features.map((feature) => (
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

        {/* "Cevap önce" sık sorulanlar; aynı metin FAQPage yapılandırılmış verisine gider. */}
        <AnswerFaqSection id={`ders-${id}-faq`} title={`${hub.name} hakkında sık sorulanlar`} items={hub.faq} />

        <section className="lp-section lp-section--alt xl-section" aria-labelledby={`ders-${id}-more`}>
          <div className="lp-wrap">
            <h2 id={`ders-${id}-more`} className="lp-h2">
              Rehberler ve öbür dersler
            </h2>
            <ul className="xl-exams">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <Link href={guidePath(guide.slug)} className="xl-exam">
                    {guide.name}
                    <span className="xl-exam-note">Rehber</span>
                  </Link>
                </li>
              ))}
              {others.map((link) => (
                <li key={link.id}>
                  <Link href={link.path} className="xl-exam">
                    {link.name}
                    <span className="xl-exam-note">Ders</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-final" aria-labelledby={`ders-${id}-final`}>
          <div className="lp-wrap lp-final-inner">
            <Icon3D name="bos-hazirlik" size={72} />
            <h2 id={`ders-${id}-final`} className="lp-h2">
              {hub.name} notunla dene
            </h2>
            <p className="lp-muted">Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}</p>
            <Link href="/kayit" className="lp-btn lp-btn--primary">
              Ücretsiz başla
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
