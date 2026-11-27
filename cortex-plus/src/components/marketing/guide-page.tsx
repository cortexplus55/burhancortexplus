import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { JsonLd } from "@/components/seo/json-ld";
import { FREE_FIRST_LESSON_SENTENCE } from "@/lib/billing/free-tier-copy";
import { GUIDE_INDEX_PATH, GUIDE_LINKS, guidePath, type GuideSlug } from "@/lib/marketing/content-hub-links";
import { GUIDE_PUBLISHED, GUIDES, type Guide } from "@/lib/marketing/guides";
import { absoluteUrl, OG_IMAGE } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  ORGANIZATION_ID,
  organizationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import "@/styles/landing.css";
import "@/styles/exam-landing.css";

/*
  Rehber sayfası (27 Kasım 2026, SEO ve GEO). Tamamı sunucuda çizilir: doğrudan cevap ilk 100 kelimede, adımlar numaralı
  liste, veri bloğu (kayıt defterinden) ya da tarafsız ölçüt tablosu, üç "cevap önce" soru. Metin `guides.ts`'te.
*/

export function guideCrumbs(guide: Guide) {
  return [
    { name: "Cortex Plus", path: "/" },
    { name: "Rehber", path: GUIDE_INDEX_PATH },
    { name: guide.question, path: guide.path },
  ] as const;
}

/** Tek `@graph`: kurum, site, sayfa, makale, gezinme yolu, sık sorulanlar. */
export function guideJsonLd(guide: Guide) {
  const url = absoluteUrl(guide.path);
  return [
    organizationJsonLd(),
    websiteJsonLd(),
    webPageJsonLd({
      name: guide.metaTitle,
      description: guide.metaDescription,
      path: guide.path,
      breadcrumb: true,
      mainEntity: { "@id": `${url}#makale` },
    }),
    {
      "@type": "Article",
      "@id": `${url}#makale`,
      headline: guide.question,
      description: guide.metaDescription,
      url,
      inLanguage: "tr-TR",
      datePublished: GUIDE_PUBLISHED,
      dateModified: GUIDE_PUBLISHED,
      author: { "@id": ORGANIZATION_ID },
      publisher: { "@id": ORGANIZATION_ID },
      mainEntityOfPage: { "@id": `${url}#sayfa` },
      image: absoluteUrl(OG_IMAGE.url),
    },
    breadcrumbJsonLd(guideCrumbs(guide)),
    faqPageJsonLd(
      guide.faq.map((item) => ({ question: item.q, answer: item.a })),
      guide.path,
    ),
  ];
}

export function GuidePage({ slug }: { slug: GuideSlug }) {
  const guide = GUIDES[slug];
  const crumbs = guideCrumbs(guide);
  const others = GUIDE_LINKS.filter((link) => link.slug !== slug);
  const titleId = `rehber-${slug}`;

  return (
    <ParityMarketingPage variant="marketing">
      <JsonLd data={guideJsonLd(guide)} />
      <div className="lp xl" data-guide={slug}>
        <article aria-labelledby={titleId}>
          <section className="lp-hero xl-hero">
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
              <h1 id={titleId} className="lp-hero-title xl-title xl-guide-title">
                {guide.question}
              </h1>
              {/* Doğrudan cevap: ilk 100 kelimede, tek başına alıntılanabilir. */}
              <p className="lp-hero-lead xl-define" data-guide-answer>
                {guide.answer}
              </p>
              <p className="xl-guide-meta">
                Cortex Plus · <time dateTime={GUIDE_PUBLISHED}>27 Kasım 2026</time>
              </p>
            </div>
          </section>

          <section className="lp-section xl-section" aria-labelledby={`${titleId}-steps`}>
            <div className="lp-wrap">
              <h2 id={`${titleId}-steps`} className="lp-h2">
                Adım adım
              </h2>
              <ol className="xl-guide-steps">
                {guide.steps.map((step) => (
                  <li key={step.title} className="xl-guide-step">
                    <h3 className="lp-h3">{step.title}</h3>
                    <p className="lp-muted">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {guide.list ? (
            <section className="lp-section lp-section--alt xl-section" aria-labelledby={`${titleId}-list`}>
              <div className="lp-wrap">
                <h2 id={`${titleId}-list`} className="lp-h2">
                  {guide.list.title}
                </h2>
                <ol className="xl-guide-list" data-testid="guide-list">
                  {guide.list.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
                <p className="lp-muted xl-lead">Kaynak: {guide.list.source}.</p>
              </div>
            </section>
          ) : null}

          {guide.table ? (
            <section className="lp-section lp-section--alt xl-section" aria-labelledby={`${titleId}-table`}>
              <div className="lp-wrap">
                <h2 id={`${titleId}-table`} className="lp-h2">
                  {guide.table.caption}
                </h2>
                <div className="xl-table-wrap" data-testid="guide-table">
                  <table className="xl-table">
                    <thead>
                      <tr>
                        {guide.table.head.map((cell) => (
                          <th key={cell} scope="col">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {guide.table.rows.map((row) => (
                        <tr key={row[0]}>
                          <th scope="row">{row[0]}</th>
                          <td data-label={guide.table!.head[1]}>{row[1]}</td>
                          <td data-label={guide.table!.head[2]}>{row[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </article>

        {/* "Cevap önce" sık sorulanlar; aynı metin FAQPage yapılandırılmış verisine gider. */}
        <AnswerFaqSection id={`${titleId}-faq`} title="Sık sorulanlar" items={guide.faq} />

        <section className="lp-section lp-section--alt xl-section" aria-labelledby={`${titleId}-related`}>
          <div className="lp-wrap">
            <h2 id={`${titleId}-related`} className="lp-h2">
              İlgili sayfalar
            </h2>
            <ul className="xl-exams">
              {guide.related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="xl-exam">
                    {link.label}
                  </Link>
                </li>
              ))}
              {others.map((link) => (
                <li key={link.slug}>
                  <Link href={guidePath(link.slug)} className="xl-exam">
                    {link.name}
                    <span className="xl-exam-note">Rehber</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-final" aria-labelledby={`${titleId}-final`}>
          <div className="lp-wrap lp-final-inner">
            <h2 id={`${titleId}-final`} className="lp-h2">
              Kendi notunla dene
            </h2>
            <p className="lp-muted">Kart istemiyoruz. {FREE_FIRST_LESSON_SENTENCE}</p>
            <div className="lp-cta-row">
              <Link href="/kayit" className="lp-btn lp-btn--primary">
                Ücretsiz başla
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/ornek" className="lp-btn lp-btn--ghost">
                Örnek dersi incele
              </Link>
            </div>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
