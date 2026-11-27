import "server-only";
import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import type { PublicPlanOffer } from "@/lib/billing/public-plan-offers";
import { storePeriodUnit } from "@/lib/billing/store-products";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { treeLabelFor } from "@/lib/curriculum/seo";
import { formatTryWhole } from "@/lib/format";
import { sellerField } from "@/lib/legal/seller";
import { ANSWER_FAQ } from "@/lib/marketing/answer-faq";
import { EXAM_LANDING_LIST, examLandingSummary } from "@/lib/marketing/exam-landings";
import { GUIDE_LIST } from "@/lib/marketing/guides";
import type { FaqItem } from "@/lib/marketing/landing-content";
import { RENEWAL_FAQ } from "@/lib/marketing/landing-content";
import { PRODUCT_AUDIENCE, PRODUCT_DEFINITION } from "@/lib/marketing/product-definition";
import { scopeCount, scopePrograms, SUBJECT_HUB_LIST, subjectHubSummary } from "@/lib/marketing/subject-hubs";
import { CORE_FEATURES } from "@/lib/seo/llms-txt";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/page-metadata";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";

/*
  `/llms-full.txt` (27 Kasım 2026, GEO; ürün sahibinin isteği): yapay zekâ aramalarının Cortex Plus'ın bütün sınavlarını,
  derslerini, rehberlerini, özelliklerini ve paket yapısını tek dosyada okuyabilmesi için. `/llms.txt` kısa özetten bu
  dosyaya bağlanır. Her bölüm sayfadaki metnin aynısıdır (tek kaynak): sınav sayfaları `exam-landings.ts`, dersler
  `subject-hubs.ts`, rehberler `guides.ts`, müfredat kayıt defteri, fiyatlar `plans` tablosu (okunamazsa fiyat yazılmaz).
  Saf: aynı girdi aynı metni verir.
*/

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

function faqLines(items: readonly FaqItem[]): string[] {
  return items.flatMap((item) => [`- **${item.q}** ${item.a}`]);
}

function packageLines(offers: readonly PublicPlanOffer[]): string[] {
  const lines = [`- Ücretsiz: kart istenmez; ${lowerFirst(FREE_TIER_SENTENCE)}.`];
  for (const offer of offers) {
    const period = offer.period === "weekly" ? `${offer.periodDays} gün` : storePeriodUnit(offer.period);
    lines.push(`- ${offer.label}: ${formatTryWhole(offer.priceKurus)} / ${period}`);
  }
  return lines;
}

const KIND_TITLE: Record<string, string> = {
  okul: "Okul (MEB, sınıf sınıf)",
  lgs: "LGS",
  yks: "YKS (TYT ve AYT)",
  kpss: "KPSS",
  ales: "ALES",
  dgs: "DGS",
  yds: "YDS",
  tus: "TUS",
  dus: "DUS",
};

function curriculumLines(): string[] {
  const groups = new Map<string, string[]>();
  for (const program of CURRICULUM.programs) {
    const outcomes = program.units.reduce((sum, unit) => sum + unit.outcomes.length, 0);
    const label = treeLabelFor(program) ?? program.badge;
    const line = `- [${program.label}](${absoluteUrl(`/mufredat/${program.id}`)}): ${program.units.length} ünite, ${outcomes} kazanım. ${label}.`;
    const key = KIND_TITLE[program.kind] ?? program.kind.toLocaleUpperCase("tr");
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.entries()].flatMap(([title, lines]) => [`### ${title}`, "", ...lines, ""]);
}

export function buildLlmsFullTxt(offers: readonly PublicPlanOffer[]): string {
  const paid = offers.length
    ? "Fiyatlar KDV dahildir; web'den alınan abonelik kendiliğinden yenilenmez."
    : `Ücretli paketler (Sınav Haftası, Plus, Sigma) ve güncel fiyatları: ${absoluteUrl("/fiyatlandirma")}`;

  const exams = EXAM_LANDING_LIST.flatMap((landing) => [
    `### ${landing.navLabel}`,
    "",
    `Adres: ${absoluteUrl(landing.path)}`,
    "",
    examLandingSummary(landing),
    "",
    ...landing.features.map((feature) => `- ${feature.title}${feature.chip ? ` (${feature.chip})` : ""}: ${feature.body}`),
    "",
    ...faqLines(landing.faq),
    "",
  ]);

  const subjects = SUBJECT_HUB_LIST.flatMap((hub) => [
    `### ${hub.name}`,
    "",
    `Adres: ${absoluteUrl(hub.path)}`,
    "",
    subjectHubSummary(hub),
    "",
    ...hub.scope.map((row) => {
      const count = scopeCount(row);
      const programs = scopePrograms(row).map((program) => `${program.label} (${absoluteUrl(program.href)})`);
      return `- ${row.exam}${count != null ? `: ${count} soru` : ""}. ${row.note}${programs.length ? ` Kazanımlar: ${programs.join("; ")}.` : ""}`;
    }),
    "",
    ...faqLines(hub.faq),
    "",
  ]);

  const guides = GUIDE_LIST.flatMap((guide) => [
    `### ${guide.question}`,
    "",
    `Adres: ${absoluteUrl(guide.path)}`,
    "",
    guide.answer,
    "",
    ...guide.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`),
    "",
    ...(guide.list ? [`${guide.list.title} (kaynak: ${guide.list.source}):`, ...guide.list.items.map((item) => `- ${item}`), ""] : []),
    ...(guide.table
      ? [
          `| ${guide.table.head.join(" | ")} |`,
          `| ${guide.table.head.map(() => "---").join(" | ")} |`,
          ...guide.table.rows.map((row) => `| ${row.join(" | ")} |`),
          "",
        ]
      : []),
    ...faqLines(guide.faq),
    "",
  ]);

  const lines = [
    `# ${SITE_NAME} — tam bilgi`,
    "",
    `> ${PRODUCT_DEFINITION} ${PRODUCT_AUDIENCE}`,
    "",
    `Kısa özet: ${absoluteUrl("/llms.txt")}`,
    "",
    "## Temel özellikler",
    "",
    ...CORE_FEATURES.map((feature) => `- ${feature}`),
    `- ${PLUS_ONLY_SENTENCE}`,
    "",
    "## Paketler",
    "",
    ...packageLines(offers),
    "",
    paid,
    "",
    "## Sınavlara göre hazırlık",
    "",
    ...exams,
    "## Dersler",
    "",
    ...subjects,
    "## Rehberler",
    "",
    ...guides,
    "## Sık sorulanlar",
    "",
    ...faqLines([...ANSWER_FAQ, RENEWAL_FAQ]),
    "",
    "## Resmî müfredat programları",
    "",
    "MEB ve ÖSYM belgelerinden çıkarılan programlar; KPSS, ALES, DGS, YDS, TUS ve DUS konu ağaçları resmî ÖSYM listesi değildir.",
    "",
    ...curriculumLines(),
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
