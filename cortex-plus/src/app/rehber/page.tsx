import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { JsonLd } from "@/components/seo/json-ld";
import { GUIDE_INDEX_PATH } from "@/lib/marketing/content-hub-links";
import { GUIDE_LIST } from "@/lib/marketing/guides";
import { PRODUCT_DEFINITION } from "@/lib/marketing/product-definition";
import { pageMetadata } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import "@/styles/landing.css";
import "@/styles/exam-landing.css";

/*
  Rehber dizini (27 Kasım 2026, SEO ve GEO): altı rehberin girişi; gezinme yolundaki "Rehber" adımı. Tamamı sunucuda.
*/

const TITLE = "Rehber";
const DESCRIPTION =
  "Ders notundan çalışma programı, TYT matematik netleri, AYT kimya sırası, vize haftası, gece takılan soru ve uygulama seçimi için kısa, adım adım rehberler.";

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: GUIDE_INDEX_PATH });

export default function RehberPage() {
  const items = GUIDE_LIST.map((guide) => ({ name: guide.question, path: guide.path }));
  return (
    <ParityMarketingPage variant="marketing">
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          webPageJsonLd({
            type: "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            path: GUIDE_INDEX_PATH,
            breadcrumb: true,
            mainEntity: itemListJsonLd(items),
          }),
          breadcrumbJsonLd([
            { name: "Cortex Plus", path: "/" },
            { name: TITLE, path: GUIDE_INDEX_PATH },
          ]),
        ]}
      />
      <div className="lp xl">
        <section className="lp-hero xl-hero" aria-labelledby="rehber-title">
          <div className="lp-wrap">
            <h1 id="rehber-title" className="lp-hero-title xl-title">
              Sınav hazırlığı rehberi
            </h1>
            <p className="lp-hero-lead xl-define" data-product-definition>
              {PRODUCT_DEFINITION} Rehberler öğrencilerin en sık sorduğu soruları kısa, adım adım ve veriyle cevaplar.
            </p>
          </div>
        </section>
        <section className="lp-section xl-section" aria-labelledby="rehber-list">
          <div className="lp-wrap">
            <h2 id="rehber-list" className="lp-h2">
              Rehberler
            </h2>
            <ul className="xl-programs xl-programs--wide" data-testid="guide-index">
              {GUIDE_LIST.map((guide) => (
                <li key={guide.slug}>
                  <Link href={guide.path} className="xl-program">
                    <span className="xl-program-name">{guide.question}</span>
                    <span className="xl-program-note">{guide.llmsNote}</span>
                    <ArrowRight className="xl-program-arrow h-4 w-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </ParityMarketingPage>
  );
}
