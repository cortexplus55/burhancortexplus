import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { JsonLd } from "@/components/seo/json-ld";
import { SUBJECT_INDEX_PATH } from "@/lib/marketing/content-hub-links";
import { PRODUCT_DEFINITION } from "@/lib/marketing/product-definition";
import { SUBJECT_HUB_LIST } from "@/lib/marketing/subject-hubs";
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
  Ders dizini (27 Kasım 2026, SEO ve GEO): sekiz ders açılış sayfasının girişi; gezinme yolundaki "Dersler" adımı.
  Tamamı sunucuda; ürünün tanımı ilk paragrafta.
*/

const TITLE = "Dersler";
const DESCRIPTION =
  "Matematik, kimya, fizik, biyoloji, Türkçe, tarih, coğrafya ve İngilizce için ders notundan kişisel çalışma programı, adım adım soru çözümü ve sınavlara göre kapsam.";

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: SUBJECT_INDEX_PATH });

export default function DerslerPage() {
  const items = SUBJECT_HUB_LIST.map((hub) => ({ name: hub.name, path: hub.path }));
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
            path: SUBJECT_INDEX_PATH,
            breadcrumb: true,
            mainEntity: itemListJsonLd(items),
          }),
          breadcrumbJsonLd([
            { name: "Cortex Plus", path: "/" },
            { name: TITLE, path: SUBJECT_INDEX_PATH },
          ]),
        ]}
      />
      <div className="lp xl">
        <section className="lp-hero xl-hero" aria-labelledby="dersler-title">
          <div className="lp-wrap">
            <h1 id="dersler-title" className="lp-hero-title xl-title">
              Derse göre çalışma
            </h1>
            <p className="lp-hero-lead xl-define" data-product-definition>
              {PRODUCT_DEFINITION} Her ders sayfasında sınavlara göre soru sayıları, resmî kazanımlar ve o derse özel
              sık sorulanlar var.
            </p>
          </div>
        </section>
        <section className="lp-section xl-section" aria-labelledby="dersler-list">
          <div className="lp-wrap">
            <h2 id="dersler-list" className="lp-h2">
              Sekiz ders
            </h2>
            <ul className="xl-programs" data-testid="subject-index">
              {SUBJECT_HUB_LIST.map((hub) => (
                <li key={hub.id}>
                  <Link href={hub.path} className="xl-program">
                    <span className="xl-program-name">{hub.name}</span>
                    <span className="xl-program-note">{hub.scope.map((row) => row.exam).join(" · ")}</span>
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
