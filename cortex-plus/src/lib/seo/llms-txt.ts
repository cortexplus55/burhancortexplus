import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import type { PublicPlanOffer } from "@/lib/billing/public-plan-offers";
import { storePeriodUnit } from "@/lib/billing/store-products";
import { formatTryWhole } from "@/lib/format";
import { sellerField } from "@/lib/legal/seller";
import { EXAM_LANDING_LIST } from "@/lib/marketing/exam-landings";
import { PRODUCT_AUDIENCE, PRODUCT_DEFINITION } from "@/lib/marketing/product-definition";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/page-metadata";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";

/*
  `/llms.txt` (27 Kasım 2026, GEO): yapay zekâ aramalarının siteyi tek dosyadan tanıması için sade Markdown. Tanım ve hedef
  kitle `product-definition.ts`'ten, özellikler bugün çalışan işlerden (Plus'a özel olanlar `PLUS_ONLY_FEATURES`),
  paket adları `STORE_PRODUCTS`'tan, fiyatlar `plans` tablosundan (canlı; okunamazsa fiyat yazılmaz, fiyat sayfasına
  gönderilir), sayfa listesi `PUBLIC_PAGES`'ten. Saf: aynı girdi aynı metni verir (bekçi `geo-ai-search.test.ts`).

  Web'deki abonelik kendiliğinden yenilenmez (`AUTO_RENEW_SUPPORTED = false`, PayTR); cümle o kural değişince değişir.
*/

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

/** "A, B ve C". */
function listWithAnd(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

/** Bugün herkese açık altı temel iş; ilk beşi ücretsiz hesabın ilk dersinde de denenir. */
export const CORE_FEATURES: readonly string[] = [
  "Notundan ders: PDF, slayt, Word ya da defter fotoğrafından konu konu kısa ekranlı ders; önce dene soruları, formül ve sınav ipucu kutuları.",
  "Sınav tarihine göre çalışma yolu: konular sırayla ders, konu testi ve kartlarla ilerler; testte zorlandığın konuya odaklı pratik eklenir.",
  "Konu testi ve doğru/yanlış: her şıkkın neden doğru ya da yanlış olduğu açıklanır; sorular yazıldıktan sonra ikinci bir yapay zekâ kontrolünden ve kod denetiminden geçer.",
  "Kartlar, aralıklı tekrar ve yanlışlar defteri: yanlış yaptığın sorular 1, 3, 7 ve 14 gün sonra yeniden sorulur.",
  "AI öğretmen, canlı sesli öğretmen ve fotoğraftan soru çözümü: takıldığın yeri yazarak sorarsın, cevap notuna dayanır; Sınav Haftası, Plus ve Sigma'da öğretmenle canlı sesli ders yaparsın (öğretmen sesli cevap verir, formülü tahtaya yazar); sorunun fotoğrafından adım adım çözüm gelir.",
  `Plus'ta ${listWithAnd(PLUS_ONLY_FEATURES.map((name) => name.toLocaleLowerCase("tr")))}: konuyu dinleyerek, izleyerek ve sınav provasıyla çalışırsın.`,
];

function packageLines(offers: readonly PublicPlanOffer[]): string[] {
  const lines = [`- Ücretsiz: kart istenmez; ${lowerFirst(FREE_TIER_SENTENCE)}.`];
  for (const offer of offers) {
    const days = offer.period === "weekly" ? `${offer.periodDays} gün` : storePeriodUnit(offer.period);
    lines.push(`- ${offer.label}: ${formatTryWhole(offer.priceKurus)} / ${days}`);
  }
  return lines;
}

export function buildLlmsTxt(offers: readonly PublicPlanOffer[]): string {
  const pricingUrl = absoluteUrl("/fiyatlandirma");
  const paid = offers.length
    ? "Fiyatlar KDV dahildir; web'den alınan abonelik kendiliğinden yenilenmez."
    : `Ücretli paketler (Sınav Haftası, Plus, Sigma) ve güncel fiyatları: ${pricingUrl}`;
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${PRODUCT_DEFINITION} ${PRODUCT_AUDIENCE}`,
    "",
    "## Kimler için",
    "",
    "- Ortaokul ve LGS (sorular 4 şıklı)",
    "- Lise ve YKS: TYT, AYT (sorular 5 şıklı)",
    "- Üniversite vize ve finalleri",
    "- KPSS, ALES, DGS, YDS, TUS ve DUS",
    "- Notu olmayan öğrenci MEB ve ÖSYM belgelerinden çıkarılan resmî müfredattan başlar.",
    "",
    "## Sınavlara göre hazırlık",
    "",
    ...EXAM_LANDING_LIST.map((landing) => `- [${landing.navLabel}](${absoluteUrl(landing.path)}): ${landing.definition[0]}`),
    "",
    "## Temel özellikler",
    "",
    ...CORE_FEATURES.map((feature) => `- ${feature}`),
    "",
    "## Paketler",
    "",
    ...packageLines(offers),
    "",
    paid,
    "",
    "## Sayfalar",
    "",
    ...PUBLIC_PAGES.map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.note}`),
    "",
    "## İletişim",
    "",
    `- Destek: ${sellerField("email")}`,
    "",
  ];
  return lines.join("\n");
}
